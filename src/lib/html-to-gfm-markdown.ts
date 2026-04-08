import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

let turndownSingleton: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!turndownSingleton) {
    turndownSingleton = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
    turndownSingleton.use(gfm);
  }
  return turndownSingleton;
}

/**
 * TipTap 表格常带 colgroup，且首行 &lt;th&gt; 放在 tbody 里；turndown-plugin-gfm 要求表头在 thead
 * 或「tbody 为第一子节点且首行全 th」，colgroup 挡在中间会导致整表被 keep 成 HTML。
 * 此处去掉 colgroup，并把「tbody 内首行且单元格全为 th」提升到 thead。
 */
function prepareTipTapTablesForTurndown(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  try {
    const doc = new DOMParser().parseFromString(
      `<div data-tiptap-turndown-wrap="1">${html}</div>`,
      "text/html",
    );
    const root = doc.querySelector("[data-tiptap-turndown-wrap]");
    if (!root) return html;

    root.querySelectorAll("colgroup").forEach((el) => el.remove());

    for (const table of root.querySelectorAll("table")) {
      if (table.querySelector("thead tr")) continue;

      const tbody = table.querySelector("tbody");
      if (!tbody) continue;

      const firstRow = tbody.firstElementChild;
      if (!firstRow || firstRow.tagName !== "TR") continue;

      let cells = Array.from(firstRow.children);
      if (cells.length === 0) continue;

      if (cells.every((cell) => cell.tagName === "TD")) {
        for (const cell of [...cells]) {
          if (cell.tagName !== "TD") continue;
          const th = doc.createElement("th");
          th.innerHTML = cell.innerHTML;
          for (const { name, value } of Array.from(cell.attributes)) {
            if (name === "colspan" || name === "rowspan") {
              th.setAttribute(name, value);
            }
          }
          firstRow.replaceChild(th, cell);
        }
        cells = Array.from(firstRow.children);
      }

      if (!cells.every((cell) => cell.tagName === "TH")) continue;

      const thead = doc.createElement("thead");
      tbody.removeChild(firstRow);
      thead.appendChild(firstRow);
      table.insertBefore(thead, tbody);
    }

    return root.innerHTML;
  } catch {
    return html;
  }
}

/**
 * TipTap / 章节 HTML 片段 → GFM Markdown（含表格）。
 * 无表头行（首行非全 th）的表格仍可能以 HTML 块保留。
 */
export function htmlFragmentToGfmMarkdown(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";
  try {
    const prepared = prepareTipTapTablesForTurndown(trimmed);
    return getTurndown().turndown(prepared).trim();
  } catch {
    return "";
  }
}
