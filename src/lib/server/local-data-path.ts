import path from "node:path";

/**
 * 统一生成 `process.cwd()/.data` 下的绝对路径，避免在多个 API 里写
 * `path.join(process.cwd(), ".data", …, ...dynamicParts)` 的变参展开；
 * 后者会让 Turbopack 在 build 时把 `.data` 下大量文件算进「过宽」的依赖图并告警。
 */
export function getLocalDataDir(): string {
  return path.join(process.cwd(), ".data");
}

export function getLocalDataSubpath(...segments: string[]): string {
  if (segments.length === 0) return getLocalDataDir();
  return path.join(getLocalDataDir(), path.join(...segments));
}
