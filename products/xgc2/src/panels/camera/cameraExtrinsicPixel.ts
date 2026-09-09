import type { CameraExtrinsicPixel } from '../../domains/execution/cameraCalibrationProcessPublic';

export function cameraPixelForClientPoint(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect,'left' | 'top' | 'width' | 'height'>,
  imageWidth: number,
  imageHeight: number,
): CameraExtrinsicPixel | undefined {
  if (bounds.width <= 0 || bounds.height <= 0 || imageWidth <= 0 || imageHeight <= 0) return undefined;
  const scale = Math.min(bounds.width / imageWidth, bounds.height / imageHeight);
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;
  const offsetX = (bounds.width - renderedWidth) / 2;
  const offsetY = (bounds.height - renderedHeight) / 2;
  const x = clientX - bounds.left - offsetX;
  const y = clientY - bounds.top - offsetY;
  if (x < 0 || y < 0 || x >= renderedWidth || y >= renderedHeight) return undefined;
  return [x / scale,y / scale];
}
