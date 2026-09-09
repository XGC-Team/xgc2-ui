import type { GridLayoutProps, Position } from 'react-grid-layout';

type PositionStrategy = NonNullable<GridLayoutProps['positionStrategy']>;

/**
 * Sidebar width interpolates in CSS. react-grid-layout still computes item
 * geometry from a JS pixel width. Converting left/width to fractions of that
 * same measured width keeps the grid-unit ratio, so tiles (and the HUD inside
 * them) CSS-follow the live container even when the JS width is a frame late.
 * Top/height stay pixels and follow the measured GCS layout: preferred panel
 * heights can change with width even when the workspace height is unchanged.
 */
export function dashboardFluidPositionStrategy(containerWidthPx: number): PositionStrategy {
  const basis = containerWidthPx > 0 ? containerWidthPx : 1;
  return {
    type: 'absolute',
    scale: 1,
    calcStyle(pos: Position) {
      return {
        position: 'absolute',
        top: `${pos.top}px`,
        height: `${pos.height}px`,
        left: `${(pos.left / basis) * 100}%`,
        width: `${(pos.width / basis) * 100}%`,
      };
    },
  };
}
