export function containedVideoSize({
  containerWidth,
  containerHeight,
  sourceWidth,
  sourceHeight,
}: {
  containerWidth: number;
  containerHeight: number;
  sourceWidth: number;
  sourceHeight: number;
}) {
  if (![containerWidth,containerHeight,sourceWidth,sourceHeight].every(
    (value) => Number.isFinite(value) && value > 0,
  )) return undefined;

  const sourceAspectRatio = sourceWidth / sourceHeight;
  const containerAspectRatio = containerWidth / containerHeight;
  if (containerAspectRatio > sourceAspectRatio) {
    return {
      width:containerHeight * sourceAspectRatio,
      height:containerHeight,
    };
  }
  return {
    width:containerWidth,
    height:containerWidth / sourceAspectRatio,
  };
}
