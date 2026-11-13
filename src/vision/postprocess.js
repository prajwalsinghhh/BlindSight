import {
  CLASS_NAMES,
} from "../constants/classes";

export const CONFIDENCE_THRESHOLD = 0.50;
export const IOU_THRESHOLD = 0.45;

export function processOutput(
  output,
  videoWidth,
  videoHeight,
  scale,
  padX,
  padY
) {
  const data = output.data;
  const dims = output.dims;


  const numClasses = 80;

  // Expected:
  // [1, 84, 8400]
  const numDetections =
    dims[dims.length - 1];

  const detections = [];

  for (
    let i = 0;
    i < numDetections;
    i++
  ) {
    let bestClass = -1;
    let bestScore = 0;

    // Find highest scoring class
    for (
      let c = 0;
      c < numClasses;
      c++
    ) {
      const score =
        data[
          (4 + c) *
            numDetections +
            i
        ];

      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }

    if (
      bestScore <
      CONFIDENCE_THRESHOLD
    ) {
      continue;
    }

    // YOLO coordinates
    const centerX = data[i];

    const centerY =
      data[
        numDetections + i
      ];

    const width =
      data[
        2 * numDetections + i
      ];

    const height =
      data[
        3 * numDetections + i
      ];

    // Convert center → corners
    let x1 =
      centerX - width / 2;

    let y1 =
      centerY - height / 2;

    let x2 =
      centerX + width / 2;

    let y2 =
      centerY + height / 2;

    // Remove letterbox padding
    x1 =
      (x1 - padX) / scale;

    y1 =
      (y1 - padY) / scale;

    x2 =
      (x2 - padX) / scale;

    y2 =
      (y2 - padY) / scale;

    // Clamp
    x1 = Math.max(
      0,
      Math.min(videoWidth, x1)
    );

    y1 = Math.max(
      0,
      Math.min(videoHeight, y1)
    );

    x2 = Math.max(
      0,
      Math.min(videoWidth, x2)
    );

    y2 = Math.max(
      0,
      Math.min(videoHeight, y2)
    );

    detections.push({
      classId: bestClass,

      className:
        CLASS_NAMES[bestClass],

      score: bestScore,

      x1,
      y1,
      x2,
      y2,
    });
  }

  return classAwareNMS(
    detections
  );
}

function classAwareNMS(
  detections
) {
  const result = [];

  const classes = [
    ...new Set(
      detections.map(
        (d) => d.classId
      )
    ),
  ];

  for (const classId of classes) {
    const classDetections =
      detections
        .filter(
          (d) =>
            d.classId ===
            classId
        )
        .sort(
          (a, b) =>
            b.score - a.score
        );

    while (
      classDetections.length > 0
    ) {
      const current =
        classDetections.shift();

      result.push(current);

      for (
        let i =
          classDetections.length -
          1;
        i >= 0;
        i--
      ) {
        if (
          calculateIoU(
            current,
            classDetections[i]
          ) > IOU_THRESHOLD
        ) {
          classDetections.splice(
            i,
            1
          );
        }
      }
    }
  }

  return result;
}

function calculateIoU(a, b) {
  const x1 = Math.max(
    a.x1,
    b.x1
  );

  const y1 = Math.max(
    a.y1,
    b.y1
  );

  const x2 = Math.min(
    a.x2,
    b.x2
  );

  const y2 = Math.min(
    a.y2,
    b.y2
  );

  const width = Math.max(
    0,
    x2 - x1
  );

  const height = Math.max(
    0,
    y2 - y1
  );

  const intersection =
    width * height;

  const areaA =
    Math.max(
      0,
      a.x2 - a.x1
    ) *
    Math.max(
      0,
      a.y2 - a.y1
    );

  const areaB =
    Math.max(
      0,
      b.x2 - b.x1
    ) *
    Math.max(
      0,
      b.y2 - b.y1
    );

  const union =
    areaA +
    areaB -
    intersection;

  if (union <= 0) {
    return 0;
  }

  return (
    intersection / union
  );
}