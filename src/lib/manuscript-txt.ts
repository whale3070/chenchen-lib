/** 将用户 .txt 转为 TipTap / StarterKit 可用的 HTML（段落 + br，并对特殊字符转义）。 */

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 空段落以空 &lt;p&gt; 占位，避免无效文档。 */
export function plainTextToTipTapHtml(raw: string): string {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  if (blocks.length === 0) {
    return "<p></p>";
  }
  return blocks
    .map((block) => {
      const inner = block
        .split("\n")
        .map((line) => escapeHtmlText(line))
        .join("<br />");
      return `<p>${inner}</p>`;
    })
    .join("");
}
