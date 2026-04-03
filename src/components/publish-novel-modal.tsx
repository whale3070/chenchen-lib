"use client";

/**
 * 发布模块 — 配置弹窗（深色科技风）
 * TODO: 对接真实支付、读者端元数据同步
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

import type { NovelPublishRecord, PublishLayoutMode } from "@/lib/novel-publish";

const COPYRIGHT_TEXT =
  "本作品版权100%归作者所有，郴郴文库仅提供技术服务，不抽成、不买断、不干涉创作";

type Currency = "HKD" | "USD" | "CNY";

export type PublishNovelModalProps = {
  open: boolean;
  onClose: () => void;
  novelTitle: string;
  initialSynopsis: string;
  initialTags: string[];
  savedRecord: NovelPublishRecord | null;
  onAutoFillMeta: () => Promise<{
    synopsis: string;
    tags: string[];
    generatedBy: "deepseek" | "fallback";
  }>;
  onConfirm: (payload: {
    synopsis: string;
    tags: string[];
    visibility: "private" | "public";
    paymentMode: "free" | "paid";
    currency: Currency;
    priceAmount: string;
    updateCommitment: "none" | number;
    refundRuleAck: boolean;
    layoutMode: PublishLayoutMode;
  }) => Promise<void>;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-[#1e2a3f] bg-[#0a0e17] px-3 py-2 text-sm text-zinc-100 shadow-inner outline-none transition " +
  "placeholder:text-zinc-600 hover:border-[#4fc3f7]/50 focus:border-[#4fc3f7] focus:ring-1 focus:ring-[#4fc3f7]/40";

export function PublishNovelModal({
  open,
  onClose,
  novelTitle,
  initialSynopsis,
  initialTags,
  savedRecord,
  onAutoFillMeta,
  onConfirm,
}: PublishNovelModalProps) {
  const [synopsis, setSynopsis] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [paymentMode, setPaymentMode] = useState<"free" | "paid">("free");
  const [currency, setCurrency] = useState<Currency>("HKD");
  const [priceAmount, setPriceAmount] = useState("");
  const [commitMode, setCommitMode] = useState<"none" | "weekly">("none");
  const [weeklyN, setWeeklyN] = useState(3);
  const [refundRuleAck, setRefundRuleAck] = useState(false);
  const [layoutMode, setLayoutMode] = useState<PublishLayoutMode>("preserve");
  const [tagDraft, setTagDraft] = useState("");
  const [metaGeneratedBy, setMetaGeneratedBy] = useState<"deepseek" | "fallback" | null>(
    null,
  );
  const [metaGenerating, setMetaGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (savedRecord) {
      setSynopsis(savedRecord.synopsis);
      setTags(savedRecord.tags ?? []);
      setVisibility(savedRecord.visibility);
      setPaymentMode(savedRecord.paymentMode);
      setCurrency(savedRecord.currency);
      setPriceAmount(savedRecord.priceAmount ?? "");
      if (savedRecord.updateCommitment === "none") {
        setCommitMode("none");
      } else {
        setCommitMode("weekly");
        setWeeklyN(savedRecord.updateCommitment);
      }
      setRefundRuleAck(savedRecord.refundRuleAck);
      setLayoutMode(savedRecord.layoutMode ?? "preserve");
      setTagDraft("");
      setMetaGeneratedBy(null);
    } else {
      setSynopsis(initialSynopsis);
      setTags(
        initialTags
          .map((t) => t.replace(/^#+/, "").trim())
          .filter(Boolean),
      );
      setVisibility("private");
      setPaymentMode("free");
      setCurrency("HKD");
      setPriceAmount("");
      setCommitMode("none");
      setWeeklyN(3);
      setRefundRuleAck(false);
      setLayoutMode("preserve");
      setTagDraft("");
      setMetaGeneratedBy(null);
    }
  }, [open, savedRecord, initialSynopsis, initialTags]);

  const autoFillMeta = useCallback(async () => {
    setMetaGenerating(true);
    try {
      const data = await onAutoFillMeta();
      setSynopsis((data.synopsis ?? "").trim().slice(0, 5000));
      setTags(
        (data.tags ?? [])
          .map((t) => t.replace(/^#+/, "").trim())
          .filter(Boolean)
          .slice(0, 12),
      );
      setMetaGeneratedBy(data.generatedBy);
    } finally {
      setMetaGenerating(false);
    }
  }, [onAutoFillMeta]);

  useEffect(() => {
    if (!open) return;
    if (savedRecord) return;
    const hasMeta = synopsis.trim().length > 0 || tags.length > 0;
    if (hasMeta) return;
    void autoFillMeta();
    // intentionally only react to modal open + init state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, savedRecord]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm({
        synopsis: synopsis.trim(),
        tags,
        visibility,
        paymentMode,
        currency,
        priceAmount: paymentMode === "paid" ? priceAmount.trim() : "",
        updateCommitment: commitMode === "none" ? "none" : weeklyN,
        refundRuleAck: commitMode === "weekly" ? refundRuleAck : false,
        layoutMode,
      });
      onClose();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "发布失败");
    } finally {
      setSubmitting(false);
    }
  };

  const onBackdropClick = () => {
    if (!submitting) onClose();
  };

  const commitTagDraft = useCallback(() => {
    const next = tagDraft
      .replace(/#/g, " ")
      .split(/[,\n，、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (next.length === 0) return;
    setTags((prev) => {
      const merged = [...prev];
      for (const t of next) {
        if (!merged.includes(t)) merged.push(t);
      }
      return merged.slice(0, 12);
    });
    setTagDraft("");
  }, [tagDraft]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={(e) => e.target === e.currentTarget && onBackdropClick()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-novel-title"
            className="max-h-[min(92vh,880px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#1e2a3f] bg-[#0a0e17] shadow-[0_0_48px_rgba(79,195,247,0.12)]"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[#1e2a3f] bg-[#121a29] px-5 py-4">
              <h2
                id="publish-novel-title"
                className="text-base font-semibold tracking-tight text-[#4fc3f7]"
              >
                发布配置
              </h2>
              <p className="mt-1 text-[11px] text-zinc-500">
                填写作品上架信息；确认后写入作者发布配置（本地）。
              </p>
            </div>

            <div className="space-y-5 px-5 py-4 text-sm text-zinc-300">
              <section className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#4fc3f7]/90">
                  基础信息
                </p>
                <label className="mt-3 block text-xs text-zinc-400">
                  作品标题（统一使用新建作品标题）
                  <div className={fieldClass + " select-text text-zinc-300"}>
                    {novelTitle || "未命名作品"}
                  </div>
                </label>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-400">作品简介（AI 自动生成，可手动微调）</span>
                  <button
                    type="button"
                    disabled={metaGenerating || submitting}
                    onClick={() => void autoFillMeta()}
                    className="rounded border border-[#4fc3f7]/40 px-2 py-1 text-[11px] text-[#4fc3f7] hover:bg-[#4fc3f7]/10 disabled:opacity-40"
                  >
                    {metaGenerating ? "生成中…" : "重新生成"}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  本次简介/标签来源：
                  {metaGeneratedBy === "deepseek"
                    ? "DeepSeek"
                    : metaGeneratedBy === "fallback"
                      ? "fallback"
                      : "未生成"}
                </p>
                <textarea
                  value={synopsis}
                  onChange={(e) => setSynopsis(e.target.value.slice(0, 5000))}
                  rows={5}
                  className={fieldClass + " min-h-[110px] resize-y text-zinc-200"}
                  placeholder="可手动修改 AI 生成的简介"
                />
                <div className="mt-3">
                  <span className="text-xs text-zinc-400">作品标签（AI 生成后可手动增删）</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        commitTagDraft();
                      }}
                      className={fieldClass + " !mt-0 flex-1 py-1.5 text-xs"}
                      placeholder="输入标签后回车（支持逗号分隔）"
                    />
                    <button
                      type="button"
                      onClick={commitTagDraft}
                      disabled={submitting || metaGenerating}
                      className="rounded border border-[#4fc3f7]/40 px-2 py-1 text-[11px] text-[#4fc3f7] hover:bg-[#4fc3f7]/10 disabled:opacity-40"
                    >
                      添加
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {tags.length === 0 ? (
                      <span className="text-[11px] text-zinc-500">暂无标签</span>
                    ) : (
                      tags.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() =>
                            setTags((prev) => prev.filter((x) => x !== t))
                          }
                          className="rounded-full border border-[#4fc3f7]/35 bg-[#0a0e17] px-2 py-0.5 text-[11px] text-[#4fc3f7]"
                          title="点击移除标签"
                        >
                          #{t} ×
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#4fc3f7]/90">
                  发布设置
                </p>
                <label className="mt-3 block text-xs text-zinc-400">
                  可见范围
                  <select
                    value={visibility}
                    onChange={(e) =>
                      setVisibility(
                        e.target.value === "public" ? "public" : "private",
                      )
                    }
                    className={fieldClass + " cursor-pointer"}
                  >
                    <option value="private">仅自己可见（草稿）</option>
                    <option value="public">公开可见（读者可看）</option>
                  </select>
                </label>
                <label className="mt-3 block text-xs text-zinc-400">
                  付费模式
                  <select
                    value={paymentMode}
                    onChange={(e) =>
                      setPaymentMode(
                        e.target.value === "paid" ? "paid" : "free",
                      )
                    }
                    className={fieldClass + " cursor-pointer"}
                  >
                    <option value="free">免费阅读</option>
                    <option value="paid">
                      付费阅读（0抽成，收益直达作者）
                    </option>
                  </select>
                </label>
                {paymentMode === "paid" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="min-w-[100px] flex-1 text-xs text-zinc-400">
                      货币
                      <select
                        value={currency}
                        onChange={(e) =>
                          setCurrency(e.target.value as Currency)
                        }
                        className={fieldClass + " cursor-pointer"}
                      >
                        <option value="HKD">港币 HKD</option>
                        <option value="USD">美元 USD</option>
                        <option value="CNY">人民币 CNY</option>
                      </select>
                    </label>
                    <label className="min-w-[120px] flex-1 text-xs text-zinc-400">
                      金额
                      <input
                        type="text"
                        inputMode="decimal"
                        value={priceAmount}
                        onChange={(e) => setPriceAmount(e.target.value)}
                        className={fieldClass}
                        placeholder="如 9.90"
                      />
                    </label>
                  </div>
                ) : null}

                <div className="mt-3">
                  <span className="text-xs text-zinc-400">排版策略</span>
                  <div className="mt-1 space-y-1.5">
                    <label className="flex cursor-pointer items-start gap-2 text-xs">
                      <input
                        type="radio"
                        name="layoutMode"
                        checked={layoutMode === "preserve"}
                        onChange={() => setLayoutMode("preserve")}
                        className="mt-0.5 accent-[#4fc3f7]"
                      />
                      <span>
                        保留作者排版（推荐）
                        <span className="block text-[11px] text-zinc-500">
                          保留图片、表格、Markdown 渲染结构。
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 text-xs">
                      <input
                        type="radio"
                        name="layoutMode"
                        checked={layoutMode === "ai_reflow"}
                        onChange={() => setLayoutMode("ai_reflow")}
                        className="mt-0.5 accent-[#4fc3f7]"
                      />
                      <span>
                        AI 自动排版（保留图片）
                        <span className="block text-[11px] text-zinc-500">
                          自动优化段落和断句，同时保留图片占位符并回填。
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-xs text-zinc-400">更新承诺</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="radio"
                        name="commit"
                        checked={commitMode === "none"}
                        onChange={() => {
                          setCommitMode("none");
                          setRefundRuleAck(false);
                        }}
                        className="accent-[#4fc3f7]"
                      />
                      无承诺
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="radio"
                        name="commit"
                        checked={commitMode === "weekly"}
                        onChange={() => setCommitMode("weekly")}
                        className="accent-[#4fc3f7]"
                      />
                      每周
                      <select
                        value={weeklyN}
                        disabled={commitMode !== "weekly"}
                        onChange={(e) =>
                          setWeeklyN(Number.parseInt(e.target.value, 10))
                        }
                        className={
                          fieldClass +
                          " inline-block !mt-0 w-20 py-1 text-xs disabled:opacity-40"
                        }
                      >
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                          <option key={n} value={n}>
                            {n} 更
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {commitMode === "weekly" ? (
                    <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] leading-snug text-zinc-400">
                      <input
                        type="checkbox"
                        checked={refundRuleAck}
                        onChange={(e) => setRefundRuleAck(e.target.checked)}
                        className="mt-0.5 accent-[#4fc3f7]"
                      />
                      <span>
                        本人已阅读并同意：若未履行每周更新承诺，读者可依据平台规则发起
                        <strong className="text-[#4fc3f7]">烂尾退款</strong>
                        相关流程（具体以未来平台条款为准）。
                      </span>
                    </label>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border border-dashed border-zinc-600/80 bg-[#121a29]/80 p-3">
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  {COPYRIGHT_TEXT}
                </p>
              </section>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[#1e2a3f] bg-[#121a29] px-5 py-3">
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:border-[#4fc3f7]/50 hover:text-[#4fc3f7] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleConfirm()}
                className="rounded-lg bg-[#4fc3f7] px-5 py-2 text-xs font-semibold text-[#0a0e17] shadow-lg shadow-[#4fc3f7]/25 transition hover:bg-[#81d4fa] disabled:opacity-50"
              >
                {submitting ? "提交中…" : "确认发布"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
