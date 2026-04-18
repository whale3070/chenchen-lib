/**
 * 发布模块 — 类型与工具
 * TODO: 对接后端支付网关、读者端目录、链上结算等
 */

import type { PlotNode } from "@chenchen/shared/types";

import { flatToOutlineTree, type PlotOutlineNode } from "@/lib/plot-outline";

export type PublishLayoutMode = "preserve" | "ai_reflow";

/** 持久化到 /api/v1/novel-publish 的配置体 */
export type NovelPublishRecord = {
  /** 发布时分配的对外文章 ID（随机） */
  articleId?: string;
  authorId: string;
  novelId: string;
  title: string;
  synopsis: string;
  tags: string[];
  visibility: "private" | "public";
  paymentMode: "free" | "paid";
  currency: "HKD" | "USD" | "CNY";
  /** 付费金额文本，如 "9.90" */
  priceAmount: string;
  /** 无承诺 | 每周 N 更（1–7） */
  updateCommitment: "none" | number;
  /** 选择周更时勾选烂尾退款承诺 */
  refundRuleAck: boolean;
  /** 已发布章节 ID 列表；为空或缺失时默认全部章节可见（兼容旧数据） */
  publishedChapterIds?: string[];
  /** 发布排版策略：保留原排版 | AI 文本重排 */
  layoutMode?: PublishLayoutMode;
  /**
   * 选择 AI 自动排版时：作者补充说明（分段、标点、缩进、对话样式等），由 worker 拼入 DeepSeek 提示词；
   * 后处理会尊重 firstLineIndent 及补充说明中「不要首行缩进」等版式意图。硬约束仍为不改剧情、不删改占位符。
   */
  aiReflowAuthorPrompt?: string;
  /** 阅读页段落样式：是否首行缩进 */
  firstLineIndent?: boolean;
  /** 章节 ID → 作者托管朗读音频 URL（通常为 /api/v1/audio-host?path=…） */
  chapterNarrationAudio?: Record<string, string>;
  /**
   * 公开 + AI 自动排版时：后台任务状态。未设置表示无进行中任务。
   */
  aiReflowStatus?: "pending" | "running" | "done" | "error";
  aiReflowError?: string;
  /** 单调递增，用于作废上一波未完成的后台排版，避免竞态覆盖 */
  aiReflowGeneration?: number;
  aiReflowStartedAt?: string;
  aiReflowFinishedAt?: string;
  publishedAt: string;
  withdrawnAt?: string | null;
};

/** 大纲顶部标签文案 */
export type PublishDisplayStatus = "draft" | "public" | "paid";

export function derivePublishDisplayStatus(
  rec: NovelPublishRecord | null,
): PublishDisplayStatus {
  if (!rec || rec.visibility === "private") return "draft";
  if (rec.paymentMode === "paid") return "paid";
  return "public";
}

export function publishStatusLabelZh(s: PublishDisplayStatus): string {
  switch (s) {
    case "draft":
      return "草稿";
    case "public":
      return "已公开";
    case "paid":
      return "付费中";
    default:
      return "草稿";
  }
}

/** 优先取第一卷；无卷则取大纲树根第一项，用于预填发布表单 */
export function getPrimaryVolumeForPublish(nodes: PlotNode[]): PlotNode | null {
  const roots = flatToOutlineTree(nodes);
  const walkFindVolume = (list: PlotOutlineNode[]): PlotOutlineNode | null => {
    for (const r of list) {
      if (r.kind === "volume") return r;
      const inner = walkFindVolume(r.children);
      if (inner) return inner;
    }
    return null;
  };
  const vol = walkFindVolume(roots);
  if (vol) return vol;
  if (roots[0]) return roots[0];
  return nodes[0] ?? null;
}
