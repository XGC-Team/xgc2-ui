import type { GraphFilter, GraphIndex, Point } from './model.js';
/** x/y are graph-space viewport centre coordinates, not screen-pixel pan offsets. */
export interface GraphCamera { readonly x: number; readonly y: number; readonly zoom: number }
export interface GraphTheme {
  readonly background: string; readonly node: string; readonly muted: string;
  readonly edge: string; readonly focus: string; readonly text: string;
}
export interface GraphRendererOptions {
  readonly index: GraphIndex;
  readonly theme: GraphTheme;
  readonly reducedMotion: boolean;
  readonly onSelection: (ids: string[]) => void;
  readonly onActivate?: (id: string) => void;
  readonly onCamera?: (camera: GraphCamera) => void;
  readonly onPosition?: (id: string, position: Point) => void;
}
export interface GraphRenderer {
  setIndex(index: GraphIndex): void;
  setFilter(filter: GraphFilter): void;
  setSelection(ids: readonly string[]): void;
  setTheme(theme: GraphTheme): void;
  setReducedMotion(value: boolean): void;
  setLabels(value: boolean): void;
  focus(ids: readonly string[]): void;
  fit(): void;
  zoom(factor: number): void;
  resize(): void;
  camera(): GraphCamera;
  restore(camera: GraphCamera): void;
  /** Returns pixels only. The product must govern permission, scope and export confirmation. */
  capture(): string;
  destroy(): void;
}
export type GraphRendererFactory = (container: HTMLElement, options: GraphRendererOptions) => GraphRenderer;
export function readGraphTheme(element: Element): GraphTheme {
  const styles = getComputedStyle(element);
  const token = (name: string) => {
    const value = styles.getPropertyValue(name).trim();
    if (!value) throw new Error(`Missing shared UI token: ${name}`);
    return value;
  };
  return {
    background: token('--color-bg-canvas'), node: token('--color-text-soft'),
    muted: token('--color-text-faint'), edge: token('--color-chart-axis'),
    focus: token('--color-selection-highlight'), text: token('--color-text'),
  };
}
