import fs from "node:fs/promises";
import path from "node:path";

import type { NovelPublishRecord } from "@/lib/novel-publish";

export function safeNovelSegment(novelId: string) {
  return novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export function publishFilePath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "publish",
    `${authorLower.toLowerCase()}_${safeNovelSegment(novelId)}.json`,
  );
}

export async function readPublishRecordFs(
  authorLower: string,
  novelId: string,
): Promise<NovelPublishRecord | null> {
  const fp = publishFilePath(authorLower, novelId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    return JSON.parse(raw) as NovelPublishRecord;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return null;
    throw e;
  }
}

export async function writePublishRecordFs(rec: NovelPublishRecord) {
  const fp = publishFilePath(rec.authorId, rec.novelId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(rec, null, 2), "utf8");
}
