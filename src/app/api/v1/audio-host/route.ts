import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

import { getLocalDataSubpath } from "@/lib/server/local-data-path";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
]);

const ALLOWED_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"]);
const MAX_AUDIO_BYTES = 100 * 1024 * 1024; // 100MB per audio file

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function normalizeAuthor(authorId: string) {
  return authorId.toLowerCase();
}

function sanitizeFilename(name: string) {
  const ext = path.extname(name).toLowerCase();
  const base = path
    .basename(name, ext)
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 64);
  return { base: base || "audio", ext };
}

function makeHostedFileName(originalName: string) {
  const { base, ext } = sanitizeFilename(originalName);
  const safeExt = ALLOWED_EXT.has(ext) ? ext : ".mp3";
  const random = crypto.randomBytes(4).toString("hex");
  const stamp = Date.now().toString(36);
  return `${base}-${stamp}-${random}${safeExt}`;
}

function trimTrailingSlash(s: string) {
  return s.replace(/\/+$/, "");
}

function getPublicBaseUrl(req: NextRequest): string {
  const envBase =
    process.env.IMAGE_BED_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_WEB_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;
  if (envBase && /^https?:\/\//i.test(envBase.trim())) {
    return trimTrailingSlash(envBase.trim());
  }

  const xfHost = req.headers.get("x-forwarded-host")?.trim();
  const xfProto = req.headers.get("x-forwarded-proto")?.trim() || "https";
  if (xfHost) {
    return `${xfProto}://${xfHost}`;
  }

  return trimTrailingSlash(req.nextUrl.origin);
}

const MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

function sanitizeSegment(seg: string) {
  return seg.replace(/[^\w.-]+/g, "_");
}

function isAllowedAudio(file: File) {
  const ext = path.extname(file.name || "").toLowerCase();
  const mime = (file.type || "").toLowerCase();
  return ALLOWED_MIME.has(mime) || ALLOWED_EXT.has(ext);
}

export async function POST(req: NextRequest) {
  const wallet = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(wallet)) {
    return unauthorized("请先连接钱包后再上传音频");
  }
  const authorLower = normalizeAuthor(wallet);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("无效的表单数据");
  }

  const uploads = form.getAll("files");
  if (uploads.length === 0) {
    return badRequest("请上传音频文件");
  }

  const results: Array<{ name: string; url: string; size: number; mimeType: string }> = [];
  for (const item of uploads) {
    if (!(item instanceof File)) continue;
    if (!isAllowedAudio(item)) {
      return badRequest(`不支持的音频类型: ${item.type || item.name || "unknown"}`);
    }
    const buf = new Uint8Array(await item.arrayBuffer());
    if (buf.byteLength <= 0) return badRequest("存在空音频文件");
    if (buf.byteLength > MAX_AUDIO_BYTES) {
      return badRequest(`音频文件过大（>${MAX_AUDIO_BYTES / (1024 * 1024)}MB）`);
    }

    const month = new Date().toISOString().slice(0, 7).replace("-", "");
    const relDir = path.posix.join("audio-bed", authorLower, month);
    const absDir = getLocalDataSubpath(relDir);
    await fs.mkdir(absDir, { recursive: true });

    const hostedName = makeHostedFileName(item.name || "audio.mp3");
    const absPath = path.join(absDir, hostedName);
    await fs.writeFile(absPath, buf);

    const base = getPublicBaseUrl(req);
    const pathParam = `${authorLower}/${month}/${hostedName}`;
    const url = `${base}/api/v1/audio-host?path=${encodeURIComponent(pathParam)}`;

    results.push({
      name: item.name || hostedName,
      url,
      size: buf.byteLength,
      mimeType: item.type || MIME_BY_EXT[path.extname(hostedName).toLowerCase()] || "audio/mpeg",
    });
  }

  if (results.length === 0) {
    return badRequest("没有找到可处理的音频文件");
  }
  return NextResponse.json({ items: results });
}

/** Node 类型定义未必包含 readFile({ start, end })，用手动 seek 兼容构建环境 */
async function readFileByteRange(absPath: string, start: number, end: number): Promise<Buffer> {
  const length = end - start + 1;
  const buf = Buffer.alloc(length);
  const fh = await fs.open(absPath, "r");
  try {
    const { bytesRead } = await fh.read(buf, 0, length, start);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

function parseSingleByteRange(
  rangeHeader: string | null,
  fileSize: number,
): { start: number; end: number } | null | "unsatisfiable" {
  if (!rangeHeader) return null;
  const raw = rangeHeader.trim();
  if (raw.includes(",")) return null;
  // 仅处理音频 seek 常见的单区间：bytes=start-end | bytes=start-
  const m = /^bytes=(\d+)-(\d*)$/i.exec(raw);
  if (!m) return null;
  const start = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(start) || start < 0 || start >= fileSize) {
    return "unsatisfiable";
  }
  const endPart = m[2] ?? "";
  let end: number;
  if (endPart === "") {
    end = fileSize - 1;
  } else {
    const parsedEnd = Number.parseInt(endPart, 10);
    if (!Number.isFinite(parsedEnd)) return "unsatisfiable";
    end = Math.min(parsedEnd, fileSize - 1);
  }
  if (end < start) return "unsatisfiable";
  return { start, end };
}

export async function GET(req: NextRequest) {
  const rawPath = req.nextUrl.searchParams.get("path")?.trim() ?? "";
  if (!rawPath) return badRequest("Missing path");
  const parts = rawPath
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(sanitizeSegment);
  if (parts.length < 3) return badRequest("Invalid path");

  const tailPosix = parts.join("/");
  const dataPath = getLocalDataSubpath(`audio-bed/${tailPosix}`);
  const publicPath = path.join(process.cwd(), "public", "audio-bed", ...parts);
  const root = getLocalDataSubpath("audio-bed");
  const rel = path.relative(root, dataPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 404 });
  }

  let absPath = "";
  let ext = "";
  try {
    await fs.stat(dataPath);
    absPath = dataPath;
    ext = path.extname(dataPath).toLowerCase();
  } catch {
    try {
      await fs.stat(publicPath);
      absPath = publicPath;
      ext = path.extname(publicPath).toLowerCase();
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const stat = await fs.stat(absPath);
  const fileSize = stat.size;
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const cache = "public, max-age=31536000, immutable";

  const rangeParsed = parseSingleByteRange(req.headers.get("range"), fileSize);
  if (rangeParsed === "unsatisfiable") {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${fileSize}`,
      },
    });
  }

  if (rangeParsed) {
    const { start, end } = rangeParsed;
    const bytes = await readFileByteRange(absPath, start, end);
    return new NextResponse(new Uint8Array(bytes), {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": cache,
      },
    });
  }

  const bytes = await fs.readFile(absPath);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Cache-Control": cache,
    },
  });
}
