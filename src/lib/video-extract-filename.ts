import path from "node:path";

function primaryMime(mime: string): string {
  return mime.toLowerCase().split(";")[0]?.trim() ?? "";
}

export function inferUploadExtFromName(fileName: string, mime: string): string {
  const ext = path.extname(fileName || "").toLowerCase();
  if (ext === ".mp4" || ext === ".opus" || ext === ".ogg" || ext === ".mp3" || ext === ".wav")
    return ext;
  const m = primaryMime(mime);
  if (m === "video/mp4") return ".mp4";
  if (m === "audio/opus") return ".opus";
  if (m === "audio/ogg" || m === "application/ogg") return ".ogg";
  if (m === "audio/wav" || m === "audio/x-wav" || m === "audio/wave") return ".wav";
  if (m === "audio/mpeg" || m === "audio/mp3" || m === "audio/x-mpeg") return ".mp3";
  return ".mp4";
}

export function isSupportedExtractMedia(fileName: string, mime: string): boolean {
  const ext = path.extname(fileName || "").toLowerCase();
  const m = primaryMime(mime);
  if (ext === ".mp4" || m === "video/mp4") return true;
  if (ext === ".opus" || m === "audio/opus") return true;
  if (ext === ".ogg" || m === "audio/ogg" || m === "application/ogg") return true;
  if (ext === ".wav" || m === "audio/wav" || m === "audio/x-wav" || m === "audio/wave") return true;
  if (ext === ".mp3" || m === "audio/mpeg" || m === "audio/mp3" || m === "audio/x-mpeg") return true;
  return false;
}

export function isRawMp3ExtractMedia(fileName: string, mime: string): boolean {
  const ext = path.extname(fileName || "").toLowerCase();
  const m = primaryMime(mime);
  if (ext === ".mp3") return true;
  if (m === "audio/mpeg" || m === "audio/mp3" || m === "audio/x-mpeg") return true;
  return false;
}
