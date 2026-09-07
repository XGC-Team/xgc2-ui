import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Button, EmptyState, Input, Notice, Toolbar } from '@xgc2/ui-react';
import { indexGraph, projectGraph, searchNodes, selectionContext, type GraphFilter, type GraphSnapshot, type SelectionContext } from './model.js';
import { readGraphTheme, type GraphCamera, type GraphRenderer, type GraphRendererFactory } from './renderer.js';
import './styles.css';

export interface GraphCanvasHandle {
  fit(): void;
  focus(ids: readonly string[]): void;
  zoom(factor: number): void;
  camera(): GraphCamera | undefined;
}
export interface GraphCanvasProps {
  snapshot: GraphSnapshot;
  createRenderer: GraphRendererFactory;
  selectedIds: readonly string[];
  onSelectionChange(ids: string[]): void;
  onActivate?(id: string): void;
  onDiscuss?(context: SelectionContext): void;
  onCameraChange?(camera: GraphCamera): void;
  filter?: GraphFilter;
  labels?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Replace this value when the host explicitly restores a saved view. */
  initialCamera?: GraphCamera;
}
const EMPTY_FILTER: GraphFilter = Object.freeze({});

/** The canvas is an alternate representation, never the sole accessible navigation. */
export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(props, ref) {
  const { snapshot, createRenderer, selectedIds, filter = EMPTY_FILTER, labels = true, ariaLabel = '知识图谱', className = '' } = props;
  const viewport = useRef<HTMLDivElement>(null);
  const renderer = useRef<GraphRenderer | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const parsed = useMemo(() => {
    try { return { index: indexGraph(snapshot), error: null }; }
    catch (cause) { return { index: null, error: cause instanceof Error ? cause.message : '无效的图谱数据' }; }
  }, [snapshot]);
  const visible = useMemo(() => parsed.index ? projectGraph(parsed.index, filter) : null, [parsed.index, filter]);
  const visibleIds = useMemo(() => new Set(visible?.nodes.map(node => node.id) ?? []), [visible]);
  const safeSelection = selectedIds.filter(id => visibleIds.has(id));
  const resultNodes = useMemo(() => {
    if (!parsed.index) return [];
    return query.trim() ? searchNodes(parsed.index, query, parsed.index.nodes.size).filter(node => visibleIds.has(node.id)) : [...(visible?.nodes ?? [])];
  }, [parsed.index, query, visible, visibleIds]);
  const pageSize = 30;
  const maxPage = Math.max(0, Math.ceil(resultNodes.length / pageSize) - 1);
  const currentPage = Math.min(page, maxPage);

  useImperativeHandle(ref, () => ({
    fit: () => renderer.current?.fit(), focus: ids => renderer.current?.focus(ids),
    zoom: factor => renderer.current?.zoom(factor), camera: () => renderer.current?.camera(),
  }), []);

  // Changing data must not destroy the renderer or reset the user's camera.
  useEffect(() => {
    const el = viewport.current;
    if (!el || !parsed.index) return;
    let active: GraphRenderer | null = null;
    let observer: MutationObserver | null = null;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => active?.setReducedMotion(motion.matches);
    try {
      active = createRenderer(el, {
        index: parsed.index, theme: readGraphTheme(el), reducedMotion: motion.matches,
        onSelection: ids => latest.current.onSelectionChange(ids),
        onActivate: id => latest.current.onActivate?.(id),
        onCamera: camera => latest.current.onCameraChange?.(camera),
      });
      renderer.current = active;
      active.setFilter(latest.current.filter ?? EMPTY_FILTER);
      active.setSelection(latest.current.selectedIds);
      active.setLabels(latest.current.labels ?? true);
      if (latest.current.initialCamera) active.restore(latest.current.initialCamera);
      setError(null);
      observer = new MutationObserver(() => {
        try { active?.setTheme(readGraphTheme(el)); }
        catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取主题'); }
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin', 'class'] });
      motion.addEventListener('change', updateMotion);
    } catch (cause) {
      active?.destroy(); active = null;
      renderer.current = null;
      setError(cause instanceof Error ? cause.message : '图谱渲染器不可用'); setListOpen(true);
    }
    return () => {
      observer?.disconnect(); motion.removeEventListener('change', updateMotion);
      active?.destroy(); if (renderer.current === active) renderer.current = null;
    };
    // The factory is the lifecycle identity. Snapshot updates are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRenderer, !!parsed.index]);
  useEffect(() => { if (parsed.index) renderer.current?.setIndex(parsed.index); }, [parsed.index]);
  useEffect(() => { renderer.current?.setFilter(filter); }, [filter]);
  useEffect(() => { renderer.current?.setSelection(selectedIds); }, [selectedIds]);
  useEffect(() => { renderer.current?.setLabels(labels); }, [labels]);
  useEffect(() => { if (props.initialCamera) renderer.current?.restore(props.initialCamera); }, [props.initialCamera]);

  const select = (id: string, additive = false) => {
    const next = additive ? safeSelection.includes(id) ? safeSelection.filter(value => value !== id) : [...safeSelection, id] : [id];
    props.onSelectionChange(next); renderer.current?.focus([id]);
  };
  const discuss = () => {
    if (!parsed.index || !safeSelection.length) return;
    props.onDiscuss?.(selectionContext(parsed.index, safeSelection, filter));
  };
  const fail = parsed.error ?? error;
  return (
    <section className={`xgc-graph ${className}`} aria-label={ariaLabel}>
      <div className="xgc-graph-viewport" ref={viewport} aria-hidden="true" />
      <div className="xgc-graph-tools">
        <Toolbar>
          <Button aria-label="放大图谱" onClick={() => renderer.current?.zoom(1.25)}>＋</Button>
          <Button aria-label="缩小图谱" onClick={() => renderer.current?.zoom(0.8)}>−</Button>
          <Button onClick={() => renderer.current?.fit()}>适合视图</Button>
          <Button aria-expanded={listOpen} onClick={() => setListOpen(value => !value)}>资源列表</Button>
        </Toolbar>
      </div>
      {fail ? <div className="xgc-graph-message"><Notice heading="图谱不可用">{fail}。仍可通过资源列表导航。</Notice></div> : null}
      {!fail && visible?.nodes.length === 0 ? <div className="xgc-graph-message"><EmptyState title="这个视图还没有资源" description="调整筛选条件，或从文献和笔记建立第一条联系。" /></div> : null}
      {listOpen ? (
        <div className="xgc-graph-resource-list" aria-label="图谱资源">
          <Input aria-label="搜索图谱资源" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
          <p className="xgc-graph-count">{resultNodes.length} 项资源 · 选择后定位到画布</p>
          <ul>
            {resultNodes.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(node => (
              <li key={node.id}><Button aria-pressed={safeSelection.includes(node.id)} onClick={event => select(node.id, event.shiftKey || event.metaKey || event.ctrlKey)}>{node.label}</Button></li>
            ))}
          </ul>
          {!resultNodes.length ? <p>没有匹配的资源。</p> : null}
          <Toolbar>
            <Button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</Button>
            <span>{currentPage + 1} / {maxPage + 1}</span>
            <Button disabled={currentPage >= maxPage} onClick={() => setPage(currentPage + 1)}>下一页</Button>
          </Toolbar>
        </div>
      ) : null}
      <div className="xgc-graph-caption" aria-live="polite">
        <span>{visible?.nodes.length ?? 0} 项资源 · {visible?.edges.length ?? 0} 条关系</span>
        {snapshot.complete ? null : <span>当前范围，并非完整知识库</span>}
      </div>
      {safeSelection.length ? <div className="xgc-graph-selection">
        <span>已选择 {safeSelection.length} 项</span>
        {props.onDiscuss ? <Button onClick={discuss}>讨论所选</Button> : null}
        <Button onClick={() => props.onSelectionChange([])}>清除选择</Button>
      </div> : null}
    </section>
  );
});
