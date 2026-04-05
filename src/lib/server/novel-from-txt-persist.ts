import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { getDraftFilePath } from "@/lib/draft-path";
import { buildVolumeAndChaptersFromPlainParts } from "@/lib/plot-nodes-from-chapters";
import { trackWalletEvent } from "@/lib/server/wallet-analytics";

import type { NovelListItem, NovelMeta } from "@/app/api/v1/novels/route";

const MAX_STRUCTURE_NODES = 2500;

type AuthorNovelsIndex = {
  authorId: string;
  novels: NovelMeta[];
};

function safeAuthorId(id: string) {
  return id.toLowerCase();
}

function authorIndexPath(authorId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "novels",
    "authors",
    `${safeAuthorId(authorId)}.json`,
  );
}

async function readAuthorIndex(authorId: string): Promise<AuthorNovelsIndex> {
  const fp = authorIndexPath(authorId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as AuthorNovelsIndex;
    if (data && Array.isArray(data.novels))
      return { authorId: safeAuthorId(authorId), novels: data.novels };
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code !== "ENOENT") throw e;
  }
  return { authorId: safeAuthorId(authorId), novels: [] };
}

async function writeAuthorIndex(idx: AuthorNovelsIndex) {
  const fp = authorIndexPath(idx.authorId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(idx, null, 2), "utf8");
}

function newNovelId(): string {
  return `nvl-${Date.now().toString(36)}-${randomBytes(5).toString("hex")}`;
}

async function structureFilePath(authorId: string, docId: string): Promise<string> {
  const dir = path.join(process.cwd(), ".data", "structure");
  await fs.mkdir(dir, { recursive: true });
  const safeDoc = docId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(dir, `${safeAuthorId(authorId)}_${safeDoc}.json`);
}

export type PlainChapter = { title: string; content: string };

export type PersistNovelSuccess = {
  ok: true;
  novel: NovelListItem;
  batchCount: number;
  anyTruncated: boolean;
  chapterCount: number;
};

export type PersistNovelFailure = {
  ok: false;
  status: number;
  error: string;
  novel?: NovelListItem;
  batchCount?: number;
  anyTruncated?: boolean;
  chapterCount?: number;
};

/**
 * 将已切好的章节写入作者索引、structure 与首章草稿（与 from-txt 成功路径一致）。
 */
export async function persistNovelFromPlainChapters(params: {
  walletLower: string;
  title: string;
  description: string;
  chapters: PlainChapter[];
  batchCount: number;
  anyTruncated: boolean;
}): Promise<PersistNovelSuccess | PersistNovelFailure> {
  const { walletLower, title, description, chapters, batchCount, anyTruncated } =
    params;

  const now = new Date().toISOString();
  const novel: NovelMeta = {
    id: newNovelId(),
    authorId: walletLower,
    title,
    description: description || `由 TXT 素材导入，共 ${chapters.length} 章。`,
    createdAt: now,
    updatedAt: now,
  };

  const idx = await readAuthorIndex(walletLower);
  idx.novels.unshift(novel);
  await writeAuthorIndex(idx);

  const nodes = buildVolumeAndChaptersFromPlainParts(chapters);
  if (nodes.length > MAX_STRUCTURE_NODES) {
    idx.novels = idx.novels.filter((n) => n.id !== novel.id);
    await writeAuthorIndex(idx);
    return {
      ok: false,
      status: 400,
      error: `节点数量超过上限（最多 ${MAX_STRUCTURE_NODES} 个）`,
    };
  }

  try {
    const fp = await structureFilePath(walletLower, novel.id);
    await fs.writeFile(
      fp,
      JSON.stringify(
        {
          authorId: walletLower,
          docId: novel.id,
          nodes,
          updatedAt: now,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    idx.novels = idx.novels.filter((n) => n.id !== novel.id);
    await writeAuthorIndex(idx);
    return { ok: false, status: 500, error: "写入章节大纲失败" };
  }

  const firstChapter = nodes.find((n) => n.kind === "chapter");
  const meta =
    firstChapter?.metadata && typeof firstChapter.metadata === "object"
      ? (firstChapter.metadata as Record<string, unknown>)
      : null;
  const firstHtml =
    typeof meta?.chapterHtml === "string" && meta.chapterHtml.trim().length > 0
      ? meta.chapterHtml
      : "<p></p>";

  const listItem: NovelListItem = {
    ...novel,
    wordCount: 0,
    lastModified: now,
  };

  try {
    const draftFp = getDraftFilePath(process.cwd(), walletLower, novel.id);
    await fs.mkdir(path.dirname(draftFp), { recursive: true });
    const draftPayload = {
      authorId: walletLower,
      docId: novel.id,
      html: firstHtml,
      json: null,
      chapterId: firstChapter?.id ?? null,
      chapterHash: null,
      selection: { from: 0, to: 0 },
      updatedAt: now,
      lastActionTimestamp: Date.now(),
      viewportScroll: 0,
      writingSnippet: "",
    };
    await fs.writeFile(draftFp, JSON.stringify(draftPayload), "utf8");
    await trackWalletEvent({
      wallet: walletLower,
      eventType: "save_draft",
      meta: { novelId: novel.id },
    });
  } catch {
    return {
      ok: false,
      status: 500,
      error:
        "章节大纲已保存，稿面草稿写入失败。请从列表打开该作品，在编辑器内保存一次。",
      novel: listItem,
      batchCount,
      anyTruncated,
      chapterCount: chapters.length,
    };
  }

  return {
    ok: true,
    novel: listItem,
    batchCount,
    anyTruncated,
    chapterCount: chapters.length,
  };
}
