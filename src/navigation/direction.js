export function getObjectDirection(
  detection,
  frameWidth
) {
  const objectCenterX =
    (detection.x1 +
      detection.x2) /
    2;

  const frameCenter =
    frameWidth / 2;

  // Divide the camera into
  // three navigation regions.

  const leftBoundary =
    frameWidth * 0.33;

  const rightBoundary =
    frameWidth * 0.67;

  let direction;

  if (
    objectCenterX <
    leftBoundary
  ) {
    direction = "LEFT";
  } else if (
    objectCenterX >
    rightBoundary
  ) {
    direction = "RIGHT";
  } else {
    direction = "CENTER";
  }

  return {
    ...detection,

    centerX: objectCenterX,

    frameCenter,

    direction,
  };
}

export function addDirections(
  detections,
  frameWidth
) {
  return detections.map(
    (detection) =>
      getObjectDirection(
        detection,
        frameWidth
      )
  );
}