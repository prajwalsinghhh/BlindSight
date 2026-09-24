export function getPathGeometry(frameWidth, frameHeight) {
  // Walking corridor is modeled as a trapezoid.
  //
  // Narrower toward the top because objects farther away
  // occupy a smaller portion of the image.
  
  const topY = frameHeight * 0.30;
  const bottomY = frameHeight;

  const topHalfWidth = frameWidth * 0.08;
  const bottomHalfWidth = frameWidth * 0.22;

  const centerX = frameWidth / 2;

  return {
    topY,
    bottomY,

    topLeft: centerX - topHalfWidth,
    topRight: centerX + topHalfWidth,

    bottomLeft: centerX - bottomHalfWidth,
    bottomRight: centerX + bottomHalfWidth,
  };
}


function interpolate(start, end, amount) {
  return start + (end - start) * amount;
}


export function getPathBoundsAtY(frameWidth, frameHeight, y) {
  const geometry = getPathGeometry(frameWidth, frameHeight);

  const clampedY = Math.max(
    geometry.topY,
    Math.min(y, geometry.bottomY)
  );

  const progress =
    (clampedY - geometry.topY) /
    (geometry.bottomY - geometry.topY);

  const left = interpolate(
    geometry.topLeft,
    geometry.bottomLeft,
    progress
  );

  const right = interpolate(
    geometry.topRight,
    geometry.bottomRight,
    progress
  );

  return {
    left,
    right,
  };
}


export function getPathStatus(
  detection,
  frameWidth,
  frameHeight
) {
  const centerX =
    (detection.x1 + detection.x2) / 2;

  // Bottom of bounding box approximates where
  // the object touches the ground.
  const footY = detection.y2;

  const path = getPathBoundsAtY(
    frameWidth,
    frameHeight,
    footY
  );

  // Is the object's bottom-center inside the path?
  const centerInside =
    centerX >= path.left &&
    centerX <= path.right;

  if (centerInside) {
    return {
      ...detection,
      pathStatus: "IN PATH",
    };
  }

  // Check whether the object's bounding box overlaps
  // the walking corridor horizontally.
  const boxOverlaps =
    detection.x2 >= path.left &&
    detection.x1 <= path.right;

  if (boxOverlaps) {
    return {
      ...detection,
      pathStatus: "PARTIAL",
    };
  }

  return {
    ...detection,
    pathStatus: "OUTSIDE PATH",
  };
}


export function addPathStatus(
  detections,
  frameWidth,
  frameHeight
) {
  return detections.map((detection) =>
    getPathStatus(
      detection,
      frameWidth,
      frameHeight
    )
  );
}