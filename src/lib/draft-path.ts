import path from "node:path";

/** 与 save-draft 一致：单篇稿面 JSON 文件路径（不创建目录）。 */
export function getDraftFilePath(
  cwd: string,
  authorId: string,
  docId: string,
): string {
  const safeDoc = docId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(
    cwd,
    ".data",
    "drafts",
    `${authorId.toLowerCase()}_${safeDoc}.json`,
  );
}
