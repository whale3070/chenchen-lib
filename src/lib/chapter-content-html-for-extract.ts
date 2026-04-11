import { marked } from "marked";

/** 与 chapter-content GET 单章返回的 content 形状对齐 */
export type ChapterContentBlob = {
  chapterBodySource?: "markdown" | "richtext";
  chapterMarkdown?: string;
  chapterHtml?: string;
};

function bodySourceFromContent(c: ChapterContentBlob): "markdown" | "richtext" {
  if (c.chapterBodySource === "markdown") return "markdown";
  if (c.chapterBodySource === "richtext") return "richtext";
  const md = typeof c.chapterMarkdown === "string" ? c.chapterMarkdown.trim() : "";
  if (md.length > 0) return "markdown";
  return "richtext";
}

/**
 * 将持久化的章节内容转为 HTML 字符串，供 chapter-cast/extract 的 chapterHtml 字段
 *（服务端用 stripHtml 得到纯文本；与主编台 Markdown 分支一致）。
 */
export function contentPayloadToChapterHtmlForExtract(
  content: ChapterContentBlob | null | undefined,
): string {
  if (!content || typeof content !== "object") return "";
  const src = bodySourceFromContent(content);
  if (src === "markdown") {
    const md = typeof content.chapterMarkdown === "string" ? content.chapterMarkdown : "";
    const parsed = marked.parse(md, {
      breaks: true,
      gfm: true,
      async: false,
    });
    const htmlRaw = typeof parsed === "string" ? parsed : String(parsed);
    return htmlRaw.trim();
  }
  const html = typeof content.chapterHtml === "string" ? content.chapterHtml.trim() : "";
  return html;
}
