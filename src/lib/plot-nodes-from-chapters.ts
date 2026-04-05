import type { PlotNode } from "@chenchen/shared/types";

import { plainTextToTipTapHtml } from "@/lib/manuscript-txt";

export function makePlotNodeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 一卷 + 多章，与编辑器「正则切章导入」结构一致 */
export function buildVolumeAndChaptersFromPlainParts(
  parts: Array<{ title: string; content: string }>,
): PlotNode[] {
  const volumeId = makePlotNodeId("plot-volume");
  return [
    {
      id: volumeId,
      kind: "volume",
      title: "",
      summary: "",
    },
    ...parts.map((ch, idx) => ({
      id: makePlotNodeId("plot-chapter"),
      kind: "chapter" as const,
      title: (ch.title || "").trim() || `第${idx + 1}章`,
      summary: "",
      tags: [] as string[],
      parentId: volumeId,
      metadata: {
        chapterHtml: plainTextToTipTapHtml(ch.content || ""),
      },
    })),
  ];
}
