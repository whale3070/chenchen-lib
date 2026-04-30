import path from "node:path";

/**
 * 本地数据目录 `process.cwd()/.data`。
 * 构建时避免使用 `path.join(process.cwd(), ".data", …动态段)`：Turbopack 会把其推断为对
 * `.data/**` 的过宽文件依赖并告警；此处仅用固定字符串与 `path.sep` 拼接。
 */
export function getLocalDataDir(): string {
  const cwd = process.cwd().replace(/[/\\]+$/, "");
  return `${cwd}${path.sep}.data`;
}

/**
 * `relativePosix` 使用 `/` 分隔（如 `image-bed/0xabc/202601`），内部转为当前平台分隔符。
 */
export function getLocalDataSubpath(relativePosix: string): string {
  const base = getLocalDataDir();
  const trimmed = relativePosix.replace(/^[\\/]+/, "").replace(/\\/g, "/");
  if (!trimmed) return base;
  const suffix = trimmed.split("/").filter(Boolean).join(path.sep);
  return `${base}${path.sep}${suffix}`;
}
