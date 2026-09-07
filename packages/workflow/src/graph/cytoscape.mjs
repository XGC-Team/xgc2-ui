import { initialPositions, neighbourhood, projectGraph, reconcileSelection } from './model.js';

/**
 * Mature Canvas renderer for the first interactive foundation slice.
 * Inject the host's cytoscape instance; do not bundle a second graph engine.
 * @param {Function} cytoscape Cytoscape 3.33.x factory.
 * @returns {import('./renderer.js').GraphRendererFactory}
 */
export function createCytoscapeRenderer(cytoscape) {
  return (container, options) => {
    let index = options.index;
    let theme = options.theme;
    let reduced = options.reducedMotion;
    let filter = {};
    let selected = [];
    let labels = true;
    let disposed = false;
    let hovered = null;
    let cameraFrame = 0;
    let detailMode = false;
    const fontFamily = getComputedStyle(container).fontFamily;
    const measure = document.createElement('canvas').getContext('2d');
    const positions = initialPositions(index);
    const duration = () => {
      if (reduced) return 0;
      const token = getComputedStyle(container).getPropertyValue('--duration-deliberate').trim();
      const value = parseFloat(token);
      return Number.isFinite(value) ? value * (token.endsWith('ms') ? 1 : 1000) : 0;
    };
    const nodeId = id => `node:${id}`;
    const edgeId = id => `edge:${id}`;
    const elements = graph => [
      ...graph.snapshot.nodes.map(node => ({
        group: 'nodes', data: {
          id: nodeId(node.id), resourceId: node.id, label: node.label,
          kind: node.kind, size: 3 + (node.importance ?? 0.2) * 12, caption: '',
          importance: node.importance ?? 0, major: (node.importance ?? 0) >= 0.95 ? 1 : 0,
        }, position: positions.get(node.id),
      })),
      ...graph.snapshot.edges.map(edge => ({
        group: 'edges', data: { id: edgeId(edge.id), resourceId: edge.id, source: nodeId(edge.source), target: nodeId(edge.target), label: edge.label, state: edge.state },
      })),
    ];
    const style = () => [
      { selector: 'node', style: {
        'width': 'data(size)', 'height': 'data(size)', 'background-color': theme.node,
        'border-width': 0, 'border-color': theme.focus, 'label': 'data(caption)',
        'color': theme.muted, 'font-family': fontFamily,
        'font-size': 12, 'text-valign': 'bottom', 'text-margin-y': 8,
        'text-max-width': 170, 'text-wrap': 'ellipsis', 'min-zoomed-font-size': 0,
        'text-background-color': theme.background, 'text-background-opacity': 0.92, 'text-background-padding': '3px',
        'overlay-opacity': 0,
      } },
      { selector: 'node[major = 1]', style: { 'min-zoomed-font-size': 8, 'font-size': 15, 'color': theme.text, 'background-color': theme.focus } },
      { selector: 'node.graph-detail[kind = "question"]', style: { 'shape': 'diamond' } },
      { selector: 'node.graph-detail[kind = "note"]', style: { 'shape': 'round-rectangle' } },
      { selector: 'node.graph-detail[kind = "project"]', style: { 'shape': 'hexagon' } },
      { selector: 'edge', style: {
        'width': 0.6, 'line-color': theme.edge, 'opacity': 0.38, 'curve-style': 'straight',
        'target-arrow-shape': 'none', 'target-arrow-color': theme.edge, 'overlay-opacity': 0,
      } },
      { selector: 'edge[state = "proposed"]', style: { 'line-style': 'dashed', 'opacity': 0.65, 'width': 0.9 } },
      { selector: '.graph-hidden', style: { 'display': 'none' } },
      { selector: 'node.graph-dim', style: { 'opacity': 0.16, 'text-opacity': 0.14 } },
      { selector: 'edge.graph-dim', style: { 'opacity': 0.07 } },
      { selector: 'node.graph-neighbour', style: { 'opacity': 1, 'min-zoomed-font-size': 8, 'color': theme.text } },
      { selector: 'edge.graph-neighbour', style: { 'line-color': theme.focus, 'target-arrow-color': theme.focus, 'opacity': 0.68, 'width': 1, 'target-arrow-shape': 'triangle', 'arrow-scale': 0.5 } },
      { selector: 'node.graph-selected', style: {
        'background-color': theme.focus, 'border-width': 2, 'border-color': theme.focus, 'border-opacity': 0.6,
        'border-style': 'double', 'width': ele => ele.data('size') + 7, 'height': ele => ele.data('size') + 7,
        'color': theme.text, 'font-size': 16, 'font-weight': 600, 'min-zoomed-font-size': 0, 'opacity': 1,
      } },
    ];
    const cy = cytoscape({
      container, elements: elements(index), layout: { name: 'preset', fit: false }, style: style(),
      minZoom: 0.12, maxZoom: 4, pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      autounselectify: true, boxSelectionEnabled: false, hideEdgesOnViewport: false,
      textureOnViewport: false, motionBlur: false,
    });
    // Screen-space label budget. Persistent labels win; nearby labels never pile up.
    const updateLabels = () => {
      if (disposed) return;
      const zoom = cy.zoom();
      const wanted = new Set();
      const occupied = [];
      const priority = id => selected.includes(id) ? 100 : hovered === id ? 90 : index.nodes.get(id)?.importance ?? 0;
      const candidates = cy.nodes(':visible').toArray().sort((a, b) => priority(b.data('resourceId')) - priority(a.data('resourceId')));
      const budget = Math.min(50, Math.max(8, Math.floor(cy.width() * cy.height() / 17000)));
      if (labels) for (const node of candidates) {
        const id = node.data('resourceId'); const mustShow = selected.includes(id) || hovered === id;
        if (!mustShow && (wanted.size >= budget || (zoom < 1.25 && !node.data('major')))) continue;
        const pos = node.renderedPosition();
        const size = (mustShow ? 16 : node.data('major') ? 15 : 12) * zoom;
        const radius = node.data('size') * zoom / 2;
        if (measure) measure.font = `${size}px ${fontFamily}`;
        const width = Math.min(170 * zoom, measure ? measure.measureText(node.data('label')).width : node.data('label').length * size);
        const box = { x: pos.x - width / 2 - 5, y: pos.y + radius + 6 * zoom, width: width + 10, height: size * 1.6 + 4 };
        if (box.x + box.width < 0 || box.x > cy.width() || box.y > cy.height() || box.y + box.height < 0) continue;
        const collides = occupied.some(other => box.x < other.x + other.width && box.x + box.width > other.x && box.y < other.y + other.height && box.y + box.height > other.y);
        if (!mustShow && collides) continue;
        occupied.push(box); wanted.add(id);
      }
      cy.batch(() => {
        if (detailMode !== (zoom >= 1.25)) { detailMode = zoom >= 1.25; cy.nodes().toggleClass('graph-detail', detailMode); }
        cy.nodes().forEach(node => {
          const caption = wanted.has(node.data('resourceId')) ? node.data('label') : '';
          if (caption !== node.data('caption')) node.data('caption', caption);
        });
      });
    };
    const visibleIds = () => new Set(projectGraph(index, filter).nodes.map(node => node.id));
    const highlight = () => {
      if (disposed) return;
      const seeds = hovered ? [hovered] : selected;
      const related = neighbourhood(index, seeds, 1, !!filter.includeProposed);
      cy.batch(() => {
        cy.elements().removeClass('graph-dim graph-neighbour graph-selected');
        if (seeds.length) {
          cy.elements().addClass('graph-dim');
          for (const id of related) cy.getElementById(nodeId(id)).removeClass('graph-dim').addClass('graph-neighbour');
          for (const edge of index.snapshot.edges) {
            if ((filter.includeProposed || edge.state === 'confirmed') && (seeds.includes(edge.source) || seeds.includes(edge.target))) {
              cy.getElementById(edgeId(edge.id)).removeClass('graph-dim').addClass('graph-neighbour');
            }
          }
        }
        for (const id of selected) cy.getElementById(nodeId(id)).removeClass('graph-dim').addClass('graph-selected');
      });
      updateLabels();
    };
    const applyFilter = () => {
      const projection = projectGraph(index, filter);
      const ids = new Set(projection.nodes.map(node => nodeId(node.id)));
      projection.edges.forEach(edge => ids.add(edgeId(edge.id)));
      cy.batch(() => cy.elements().forEach(ele => ele.toggleClass('graph-hidden', !ids.has(ele.id()))));
      const next = reconcileSelection(index, selected, filter);
      if (next.length !== selected.length || next.some((id, i) => id !== selected[i])) { selected = next; options.onSelection([...selected]); }
      if (hovered && !ids.has(nodeId(hovered))) hovered = null;
      highlight();
    };
    const animate = config => {
      cy.stop();
      if (!duration()) {
        if (config.fit) cy.fit(config.fit.eles, config.fit.padding);
        else cy.viewport(config);
      } else cy.animate(config, { duration: duration(), easing: 'ease-out-cubic', queue: false });
    };
    const camera = () => ({ x: (cy.width() / 2 - cy.pan().x) / cy.zoom(), y: (cy.height() / 2 - cy.pan().y) / cy.zoom(), zoom: cy.zoom() });
    const viewportFor = value => ({ pan: { x: cy.width() / 2 - value.x * value.zoom, y: cy.height() / 2 - value.y * value.zoom }, zoom: value.zoom });
    const choose = ids => {
      selected = reconcileSelection(index, ids, filter);
      highlight(); options.onSelection([...selected]);
    };
    cy.on('tap', 'node', event => {
      const id = event.target.data('resourceId');
      const additive = event.originalEvent?.shiftKey || event.originalEvent?.metaKey || event.originalEvent?.ctrlKey;
      choose(additive ? selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id] : [id]);
    });
    cy.on('dbltap', 'node', event => options.onActivate?.(event.target.data('resourceId')));
    cy.on('tap', event => { if (event.target === cy) choose([]); });
    cy.on('mouseover', 'node', event => { hovered = event.target.data('resourceId'); container.style.cursor = 'pointer'; highlight(); });
    cy.on('mouseout', 'node', () => { hovered = null; container.style.cursor = ''; highlight(); });
    cy.on('dragfree', 'node', event => {
      const id = event.target.data('resourceId'); const position = { ...event.target.position() };
      positions.set(id, position); updateLabels(); options.onPosition?.(id, position);
    });
    cy.on('pan zoom', () => {
      if (cameraFrame) return;
      cameraFrame = requestAnimationFrame(() => { cameraFrame = 0; if (!disposed) { updateLabels(); options.onCamera?.(camera()); } });
    });
    let initialFitPending = true;
    const fitWhenVisible = () => {
      if (!initialFitPending || container.clientWidth <= 0 || container.clientHeight <= 0) return;
      const visible = cy.nodes(':visible');
      if (!visible.length) return;
      cy.fit(visible, 90);
      initialFitPending = false;
    };
    applyFilter();
    fitWhenVisible();
    updateLabels();
    const resizeObserver = new ResizeObserver(() => { if (!disposed) { cy.resize(); fitWhenVisible(); updateLabels(); } });
    resizeObserver.observe(container);
    return {
      setIndex(next) {
        const current = camera();
        cy.nodes().forEach(ele => positions.set(ele.data('resourceId'), { ...ele.position() }));
        const merged = initialPositions(next, positions);
        positions.clear(); merged.forEach((point, id) => positions.set(id, point));
        index = next; hovered = null;
        cy.batch(() => { cy.elements().remove(); cy.add(elements(next)); });
        cy.viewport(viewportFor(current)); detailMode = !detailMode; applyFilter(); fitWhenVisible();
      },
      setFilter(next) { filter = { ...next }; applyFilter(); },
      setSelection(ids) { selected = reconcileSelection(index, ids, filter); highlight(); },
      setTheme(next) { theme = next; cy.style(style()); highlight(); },
      setReducedMotion(value) { reduced = value; if (reduced) cy.stop(); },
      setLabels(value) { labels = value; cy.style(style()); highlight(); },
      focus(ids) {
        const allowed = visibleIds();
        const eles = cy.collection(ids.filter(id => allowed.has(id)).map(id => cy.getElementById(nodeId(id))));
        if (!eles.length) return;
        if (eles.length === 1) {
          const p = eles[0].position(); const zoom = Math.max(0.8, Math.min(cy.zoom() * 1.25, 1.35));
          animate({ zoom, pan: { x: cy.width() / 2 - p.x * zoom, y: cy.height() / 2 - p.y * zoom } });
        } else animate({ fit: { eles, padding: 80 } });
      },
      fit() { const eles = cy.nodes(':visible'); if (eles.length) animate({ fit: { eles, padding: 90 } }); },
      zoom(factor) {
        if (!Number.isFinite(factor) || factor <= 0) return;
        const z = cy.zoom(); const next = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), z * factor));
        const p = cy.pan(); const x = cy.width() / 2; const y = cy.height() / 2;
        animate({ zoom: next, pan: { x: x - (x - p.x) * next / z, y: y - (y - p.y) * next / z } });
      },
      resize() { if (!disposed) cy.resize(); }, camera,
      restore(value) { if (![value.x, value.y, value.zoom].every(Number.isFinite) || value.zoom <= 0) return; initialFitPending = false; cy.stop(); cy.viewport(viewportFor({ ...value, zoom: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), value.zoom)) })); },
      capture() { return cy.png({ output: 'base64uri', bg: theme.background, full: false, scale: 2 }); },
      destroy() { if (disposed) return; disposed = true; cancelAnimationFrame(cameraFrame); resizeObserver.disconnect(); cy.stop(); cy.destroy(); container.style.cursor = ''; },
    };
  };
}
