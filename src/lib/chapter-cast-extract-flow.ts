import {
  contentPayloadToChapterHtmlForExtract,
  type ChapterContentBlob,
} from "@/lib/chapter-content-html-for-extract";

export async function chapterHasCastExtract(
  authorId: string,
  novelId: string,
  chapterId: string,
): Promise<boolean> {
  const sp = new URLSearchParams({
    authorId,
    novelId,
    chapterId,
  });
  const r = await fetch(`/api/v1/chapter-cast?${sp.toString()}`, {
    headers: { "x-wallet-address": authorId },
    cache: "no-store",
  });
  if (!r.ok) return false;
  const data = (await r.json()) as { versions?: string[] };
  return Array.isArray(data.versions) && data.versions.length > 0;
}

export async function fetchChapterHtmlFromSavedContent(
  authorId: string,
  novelId: string,
  chapterId: string,
): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const cr = await fetch(
    `/api/v1/chapter-content?authorId=${encodeURIComponent(authorId)}&docId=${encodeURIComponent(novelId)}&chapterId=${encodeURIComponent(chapterId)}`,
    { headers: { "x-wallet-address": authorId } },
  );
  const cdata = (await cr.json()) as {
    content?: ChapterContentBlob | null;
    error?: string;
  };
  if (!cr.ok) {
    return { ok: false, error: cdata.error ?? `正文加载失败 HTTP ${cr.status}` };
  }
  const chapterHtml = contentPayloadToChapterHtmlForExtract(cdata.content);
  return { ok: true, html: chapterHtml };
}

export type ChapterCastExtractPostResult =
  | { ok: true; count: number; version: string }
  | { ok: false; error: string; status: number; code?: string };

export async function postChapterCastExtract(params: {
  authorId: string;
  novelId: string;
  chapterId: string;
  chapterIndex: number;
  chapterHtml: string;
}): Promise<ChapterCastExtractPostResult> {
  const r = await fetch("/api/v1/chapter-cast/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-wallet-address": params.authorId,
    },
    body: JSON.stringify({
      authorId: params.authorId,
      novelId: params.novelId,
      chapterId: params.chapterId,
      chapterIndex: params.chapterIndex,
      chapterHtml: params.chapterHtml,
    }),
  });
  const data = (await r.json()) as {
    ok?: boolean;
    version?: string;
    count?: number;
    error?: string;
    code?: string;
  };
  if (!r.ok) {
    return {
      ok: false,
      error: data.error ?? `HTTP ${r.status}`,
      status: r.status,
      code: typeof data.code === "string" ? data.code : undefined,
    };
  }
  return {
    ok: true,
    count: data.count ?? 0,
    version: data.version ?? "",
  };
}
