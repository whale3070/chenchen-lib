/** TXT 解码 + 分批调用 /api/v1/ai/chapterize（工作台与编辑器共用） */

export type ChapterizeTxtMode = "auto" | "rule";

export function decodeTxtAuto(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const be = bytes.subarray(2);
    const swapped = new Uint8Array(be.length - (be.length % 2));
    for (let i = 0; i + 1 < be.length; i += 2) {
      swapped[i] = be[i + 1];
      swapped[i + 1] = be[i];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
}

// 与 lib/server/chapterize-internal.ts 中章节标题行正则一致（分批边界对齐）
const CHAPTER_HEADING_LINE_RE =
  /^\s*(?:第\s*[一二三四五六七八九十百千万零〇两\d]+\s*[章节回篇卷](?=\s|$|[：:，。、！？!?「」『』（(])|(?:chapter|chap\.?)\s*(?:\d+|[ivxlcdm]+)\b)/gim;

function splitTextByParagraph(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];
  const out: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const remain = normalized.length - start;
    if (remain <= maxChars) {
      const tail = normalized.slice(start).trim();
      if (tail) out.push(tail);
      break;
    }
    const hardEnd = start + maxChars;
    let cut = normalized.lastIndexOf("\n\n", hardEnd);
    if (cut <= start + Math.floor(maxChars * 0.6)) {
      cut = normalized.lastIndexOf("\n", hardEnd);
    }
    if (cut <= start) cut = hardEnd;
    const piece = normalized.slice(start, cut).trim();
    if (piece) out.push(piece);
    start = cut;
    while (start < normalized.length && /\s/.test(normalized[start] ?? "")) start += 1;
  }
  return out.filter(Boolean);
}

export function buildChapterizeBatches(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];
  const headingIndexes: number[] = [];
  CHAPTER_HEADING_LINE_RE.lastIndex = 0;
  for (const m of normalized.matchAll(CHAPTER_HEADING_LINE_RE)) {
    if (typeof m.index === "number") headingIndexes.push(m.index);
  }

  if (headingIndexes.length >= 2) {
    const blocks: string[] = [];
    for (let i = 0; i < headingIndexes.length; i += 1) {
      const from = headingIndexes[i]!;
      const to = headingIndexes[i + 1] ?? normalized.length;
      const block = normalized.slice(from, to).trim();
      if (block) blocks.push(block);
    }
    const out: string[] = [];
    let bucket = "";
    for (const block of blocks) {
      if (block.length > maxChars) {
        if (bucket) {
          out.push(bucket);
          bucket = "";
        }
        out.push(...splitTextByParagraph(block, maxChars));
        continue;
      }
      if (!bucket) {
        bucket = block;
        continue;
      }
      if (bucket.length + 2 + block.length <= maxChars) {
        bucket = `${bucket}\n\n${block}`;
      } else {
        out.push(bucket);
        bucket = block;
      }
    }
    if (bucket) out.push(bucket);
    return out.filter(Boolean);
  }

  return splitTextByParagraph(normalized, maxChars);
}

const CHAPTERIZE_BATCH_MAX_CHARS = 38000;

export async function chapterizeTxtViaApi(
  text: string,
  mode: ChapterizeTxtMode,
  options?: { walletAddress?: string | null },
): Promise<{
  chapters: Array<{ title: string; content: string }>;
  batchCount: number;
  anyTruncated: boolean;
}> {
  const batches = buildChapterizeBatches(text, CHAPTERIZE_BATCH_MAX_CHARS);
  if (batches.length === 0) {
    throw new Error("文本为空，无法切章");
  }
  const wallet = options?.walletAddress?.trim() ?? "";
  const mergedChapters: Array<{ title: string; content: string }> = [];
  let anyTruncated = false;
  for (let i = 0; i < batches.length; i += 1) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (wallet) headers["x-wallet-address"] = wallet;
    const r = await fetch("/api/v1/ai/chapterize", {
      method: "POST",
      headers,
      body: JSON.stringify({ text: batches[i], mode }),
    });
    const data = (await r.json()) as {
      chapters?: Array<{ title: string; content: string }>;
      error?: string;
      truncated?: boolean;
    };
    if (!r.ok || !Array.isArray(data.chapters) || data.chapters.length === 0) {
      throw new Error(`${data.error ?? "切章失败"}（分批 ${i + 1}/${batches.length}）`);
    }
    mergedChapters.push(...data.chapters);
    anyTruncated = anyTruncated || Boolean(data.truncated);
  }
  if (mergedChapters.length === 0) {
    throw new Error("切章失败：未生成有效章节");
  }
  return { chapters: mergedChapters, batchCount: batches.length, anyTruncated };
}
