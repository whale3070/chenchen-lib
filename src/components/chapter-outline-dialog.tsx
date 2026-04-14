"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  CHAPTER_OUTLINE_EXTRACT_MIN_WORDS,
  CHAPTER_OUTLINE_MAX_CHARS,
  CHAPTER_OUTLINE_METADATA_KEY,
} from "@/lib/chapter-outline";
import { countTextForChineseWriting } from "@/lib/text-count";
import type { PlotNode } from "@chenchen/shared/types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export type ChapterOutlineDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapter: PlotNode | null;
  authorId: string | null | undefined;
  novelId: string | undefined;
  onSaveMetadata: (chapterId: string, patch: Record<string, unknown>) => void;
};

function chapterOutlineFromNode(node: PlotNode | null): string {
  if (!node?.metadata) return "";
  const v = (node.metadata as Record<string, unknown>)[CHAPTER_OUTLINE_METADATA_KEY];
  return typeof v === "string" ? v : "";
}

export function ChapterOutlineDialog({
  open,
  onOpenChange,
  chapter,
  authorId,
  novelId,
  onSaveMetadata,
}: ChapterOutlineDialogProps) {
  const [draft, setDraft] = useState("");
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || !chapter) return;
    setDraft(chapterOutlineFromNode(chapter));
  }, [open, chapter?.id]);

  const charCount = draft.length;
  const canExtract =
    Boolean(authorId && novelId && chapter?.id) &&
    chapter != null &&
    countTextForChineseWriting(
      (() => {
        const meta = (chapter.metadata ?? {}) as Record<string, unknown>;
        const md = typeof meta.chapterMarkdown === "string" ? meta.chapterMarkdown : "";
        if (md.trim()) return md;
        const html =
          (typeof meta.chapterHtml === "string" && meta.chapterHtml) ||
          (typeof meta.chapterHtmlDesktop === "string" && meta.chapterHtmlDesktop) ||
          (typeof meta.chapterHtmlMobile === "string" && meta.chapterHtmlMobile) ||
          "";
        return html;
      })(),
    ) >= CHAPTER_OUTLINE_EXTRACT_MIN_WORDS;

  const handleDraftChange = useCallback((v: string) => {
    setDraft(v.slice(0, CHAPTER_OUTLINE_MAX_CHARS));
  }, []);

  const handleExtract = useCallback(async () => {
    if (!authorId || !novelId || !chapter?.id) return;
    setExtracting(true);
    try {
      const r = await fetch("/api/v1/chapter-outline/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId,
          novelId,
          chapterId: chapter.id,
        }),
      });
      const data = (await r.json()) as {
        outline?: string;
        generatedBy?: string;
        error?: string;
      };
      if (!r.ok) {
        window.alert(data.error ?? "提取失败");
        return;
      }
      const outline = typeof data.outline === "string" ? data.outline : "";
      setDraft(outline.slice(0, CHAPTER_OUTLINE_MAX_CHARS));
      if (data.generatedBy === "excerpt") {
        window.alert(
          "已用语义节录生成本章大纲（未使用深度模型或当前非会员）。你可直接改写后保存。",
        );
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "提取失败");
    } finally {
      setExtracting(false);
    }
  }, [authorId, novelId, chapter?.id]);

  const handlePickFile = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      handleDraftChange(text.replace(/\u0000/g, ""));
    };
    reader.onerror = () => {
      window.alert("读取文件失败");
    };
    reader.readAsText(file, "UTF-8");
  }, [handleDraftChange]);

  const handleSave = useCallback(() => {
    if (!chapter?.id) return;
    const trimmed = draft.trim();
    onSaveMetadata(chapter.id, {
      [CHAPTER_OUTLINE_METADATA_KEY]: trimmed,
    });
    onOpenChange(false);
  }, [chapter?.id, draft, onOpenChange, onSaveMetadata]);

  if (!chapter || chapter.kind !== "chapter") {
    return null;
  }

  const title = chapter.title?.trim() || "未命名章节";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>本章大纲</DialogTitle>
          <DialogDescription>
            「{title}」剧情大纲（最多 {CHAPTER_OUTLINE_MAX_CHARS} 字）。有正文时可一键提取；无正文时可上传
            .txt 或粘贴。
          </DialogDescription>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground">
          提取读取的是<strong>服务端章节正文存档</strong>（与稿面同步落盘），不是侧栏结构 JSON。若刚写完稿请稍候自动保存后再试。
        </p>
        <Textarea
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          rows={12}
          placeholder="本章剧情大纲（可粘贴或上传 .txt）"
          className="min-h-[200px] resize-y text-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>
            {charCount} / {CHAPTER_OUTLINE_MAX_CHARS}
          </span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          aria-hidden
          onChange={handleFile}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canExtract || extracting}
              title={
                !authorId
                  ? "请先连接钱包"
                  : !canExtract
                    ? "本章已保存的正文过少，请先写稿或上传大纲"
                    : "从已保存正文提取大纲"
              }
              onClick={() => void handleExtract()}
            >
              {extracting ? "提取中…" : "一键提取"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handlePickFile}>
              上传 .txt
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="button" size="sm" onClick={handleSave}>
              保存到本章
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
