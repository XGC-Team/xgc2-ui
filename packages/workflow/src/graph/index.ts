export * from './model.js';
export * from './renderer.js';
export { GraphCanvas } from './GraphCanvas.js';
export type { GraphCanvasHandle, GraphCanvasProps } from './GraphCanvas.js';
export { GraphInspector } from './GraphInspector.js';
export type { GraphInspectorProps } from './GraphInspector.js';
import { createCytoscapeRenderer as createAdapter } from './cytoscape.mjs';
import type { GraphRendererFactory } from './renderer.js';
/** The host resolves its graph engine. No dynamic download or hidden CDN fallback. */
export function createCytoscapeRenderer(engine: unknown): GraphRendererFactory {
  if (typeof engine !== 'function') throw new TypeError('A Cytoscape 3.33.x factory is required');
  return createAdapter(engine);
}
