/** Coordinate helpers for a grid rendered inside one or more CSS transforms. */

export type CanvasRect = { left: number; top: number; width: number; height: number };

const safeScale = (rendered: number, logical: number) => {
  const scale = rendered / logical;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
};

export function measuredCanvasScale(rect: CanvasRect, width: number, height: number) {
  return {
    x: safeScale(rect.width, width),
    y: safeScale(rect.height, height),
  };
}

/** Logical item top-left that preserves the exact point grabbed by the mouse. */
export function draggedCanvasPosition(
  clientX: number,
  clientY: number,
  pointerOffsetX: number,
  pointerOffsetY: number,
  rect: CanvasRect,
  logicalWidth: number,
  logicalHeight: number,
) {
  const scale = measuredCanvasScale(rect, logicalWidth, logicalHeight);
  return {
    left: (clientX - rect.left - pointerOffsetX) / scale.x,
    top: (clientY - rect.top - pointerOffsetY) / scale.y,
  };
}

/** Grid cell whose item centre sits under the pointer for a palette drop. */
export function paletteDropCell({
  clientX,
  clientY,
  rect,
  logicalWidth,
  logicalHeight,
  cols,
  rowHeight,
  itemW,
  itemH,
}: {
  clientX: number;
  clientY: number;
  rect: CanvasRect;
  logicalWidth: number;
  logicalHeight: number;
  cols: number;
  rowHeight: number;
  itemW: number;
  itemH: number;
}) {
  const scale = measuredCanvasScale(rect, logicalWidth, logicalHeight);
  const colWidth = logicalWidth / cols;
  const logicalX = (clientX - rect.left) / scale.x - (itemW * colWidth) / 2;
  const logicalY = (clientY - rect.top) / scale.y - (itemH * rowHeight) / 2;
  return {
    x: Math.max(0, Math.min(cols - itemW, Math.round(logicalX / colWidth))),
    y: Math.max(0, Math.round(logicalY / rowHeight)),
  };
}

/**
 * react-grid-layout centres external drops before undoing its transform scale.
 * This offset keeps that preview centre under the pointer at every scale.
 */
export function palettePreviewOffset(
  rect: CanvasRect,
  logicalWidth: number,
  logicalHeight: number,
  itemPixelWidth: number,
  itemPixelHeight: number,
) {
  const scale = measuredCanvasScale(rect, logicalWidth, logicalHeight);
  return {
    x: (itemPixelWidth / 2) * (1 - scale.x),
    y: (itemPixelHeight / 2) * (1 - scale.y),
  };
}
