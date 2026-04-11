/**
 * 中文写作口径：汉字数 + 英文词数（忽略 URL 与空白）。
 */
export function countTextForChineseWriting(raw: string): number {
  if (!raw) return 0;
  const withoutUrl = raw.replace(/https?:\/\/\S+/gi, " ");
  const cjkChars = (withoutUrl.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWords = (withoutUrl.match(/[A-Za-z0-9]+/g) ?? []).length;
  return cjkChars + latinWords;
}

export function stripHtmlForCount(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ");
}
