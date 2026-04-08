export const READER_AI_PANEL_W = 368;
export const READER_AI_PANEL_H_MAX = 620;
export const READER_AI_FLOAT_MARGIN = 10;

export function clampReaderAiPanelPos(
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number } {
  if (typeof window === "undefined") return { x, y };
  const maxX = Math.max(
    READER_AI_FLOAT_MARGIN,
    window.innerWidth - w - READER_AI_FLOAT_MARGIN,
  );
  const maxY = Math.max(
    READER_AI_FLOAT_MARGIN,
    window.innerHeight - h - READER_AI_FLOAT_MARGIN,
  );
  return {
    x: Math.min(maxX, Math.max(READER_AI_FLOAT_MARGIN, x)),
    y: Math.min(maxY, Math.max(READER_AI_FLOAT_MARGIN, y)),
  };
}

export function defaultReaderAiPanelPos(w: number, h: number): { x: number; y: number } {
  if (typeof window === "undefined") {
    return { x: READER_AI_FLOAT_MARGIN, y: 72 };
  }
  return clampReaderAiPanelPos(
    window.innerWidth - w - READER_AI_FLOAT_MARGIN,
    72,
    w,
    h,
  );
}
