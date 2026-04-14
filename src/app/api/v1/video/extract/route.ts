import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { isAddress } from "viem";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const MAX_VIDEO_BYTES = 220 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 600_000;

type VideoExtractItem = {
  id: string;
  sourceName: string;
  mp3Url: string;
  pathParam: string;
  size: number;
  createdAt: string;
};

type VideoExtractIndex = {
  authorId: string;
  items: VideoExtractItem[];
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function safeAuthorId(id: string) {
  return id.toLowerCase();
}

function parseWalletHeader(
  req: NextRequest,
): { ok: true; walletLower: string } | { ok: false; res: NextResponse } {
  const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(headerAddr)) {
    return { ok: false, res: unauthorized("缺少或无效的 x-wallet-address") };
  }
  return { ok: true, walletLower: safeAuthorId(headerAddr) };
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
  if (xfHost) return `${xfProto}://${xfHost}`;
  return trimTrailingSlash(req.nextUrl.origin);
}

function indexPath(authorLower: string) {
  return path.join(process.cwd(), ".data", "video-extracts", `${authorLower}.json`);
}

async function readIndex(authorLower: string): Promise<VideoExtractIndex> {
  const fp = indexPath(authorLower);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as VideoExtractIndex;
    if (data && Array.isArray(data.items)) {
      return { authorId: authorLower, items: data.items };
    }
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOENT") throw e;
  }
  return { authorId: authorLower, items: [] };
}

async function writeIndex(index: VideoExtractIndex) {
  const fp = indexPath(index.authorId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(index, null, 2), "utf8");
}

function sanitizeSegment(seg: string) {
  return seg.replace(/[^\w.-]+/g, "_");
}

/** 解析作者名下 audio-bed 中的 MP3 绝对路径；非法则返回 null */
function resolveAuthorMp3AbsPath(
  authorLower: string,
  pathParam: string,
): string | null {
  const parts = pathParam
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(sanitizeSegment);
  if (parts.length < 3) return null;
  if (parts[0]?.toLowerCase() !== authorLower) return null;
  const ext = path.extname(parts[parts.length - 1] ?? "").toLowerCase();
  if (ext !== ".mp3") return null;
  const dataPath = path.join(process.cwd(), ".data", "audio-bed", ...parts);
  const root = path.join(process.cwd(), ".data", "audio-bed");
  const rel = path.relative(root, dataPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return dataPath;
}

function primaryMime(file: File): string {
  return (file.type || "").toLowerCase().split(";")[0]?.trim() ?? "";
}

/** 上传：MP4（抽音轨）、Opus/Ogg（转 MP3）、已是 MP3 则直存（不转码） */
function isSupportedMediaFile(file: File) {
  const ext = path.extname(file.name || "").toLowerCase();
  const mime = primaryMime(file);
  if (ext === ".mp4" || mime === "video/mp4") return true;
  if (ext === ".opus" || mime === "audio/opus") return true;
  if (ext === ".ogg" || mime === "audio/ogg" || mime === "application/ogg") return true;
  if (ext === ".mp3" || mime === "audio/mpeg" || mime === "audio/mp3" || mime === "audio/x-mpeg")
    return true;
  return false;
}

/** 已是 MP3：跳过 ffmpeg，写入托管目录 */
function isRawMp3Upload(file: File): boolean {
  const ext = path.extname(file.name || "").toLowerCase();
  const mime = primaryMime(file);
  if (ext === ".mp3") return true;
  if (mime === "audio/mpeg" || mime === "audio/mp3" || mime === "audio/x-mpeg") return true;
  return false;
}

function inferUploadExt(file: File): string {
  const ext = path.extname(file.name || "").toLowerCase();
  if (ext === ".mp4" || ext === ".opus" || ext === ".ogg" || ext === ".mp3") return ext;
  const mime = primaryMime(file);
  if (mime === "video/mp4") return ".mp4";
  if (mime === "audio/opus") return ".opus";
  if (mime === "audio/ogg" || mime === "application/ogg") return ".ogg";
  if (mime === "audio/mpeg" || mime === "audio/mp3" || mime === "audio/x-mpeg") return ".mp3";
  return ".mp4";
}

export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;
  const index = await readIndex(wh.walletLower);
  const items = [...index.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ items });
}

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

export async function DELETE(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const extractId = req.nextUrl.searchParams.get("extractId")?.trim() ?? "";
  if (!extractId) {
    return badRequest("缺少 extractId 参数");
  }

  const index = await readIndex(wh.walletLower);
  const idx = index.items.findIndex((x) => x.id === extractId);
  if (idx < 0) {
    return notFound("未找到该提取记录");
  }
  const [removed] = index.items.splice(idx, 1);
  await writeIndex(index);

  if (removed?.pathParam) {
    const abs = resolveAuthorMp3AbsPath(wh.walletLower, removed.pathParam);
    if (abs) {
      await fs.unlink(abs).catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("无效的表单数据");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return badRequest(
      "请上传单个文件（字段名 file）：MP4 视频、MP3 音频，或 Opus / Ogg 音频",
    );
  }
  if (!isSupportedMediaFile(file)) {
    return badRequest("仅支持 MP4、MP3，或 Opus（.opus）/ Ogg 音频（.ogg）");
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength <= 0) return badRequest("空文件");
  if (buf.byteLength > MAX_VIDEO_BYTES) {
    return badRequest(`文件过大（>${MAX_VIDEO_BYTES / (1024 * 1024)}MB）`);
  }

  const month = new Date().toISOString().slice(0, 7).replace("-", "");
  const hostedName = `vex-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}.mp3`;
  const absDir = path.join(process.cwd(), ".data", "audio-bed", wh.walletLower, month);
  const absHosted = path.join(absDir, hostedName);

  const rawBase =
    path.basename(file.name || "").replace(/[^\w.-]+/g, "_").replace(/\.+$/, "") || "upload";
  const stem = rawBase.replace(/\.[^.]+$/, "") || "upload";
  const ext = inferUploadExt(file);
  const displaySourceName = file.name || `${stem}${ext}`;

  let mp3Size: number;

  if (isRawMp3Upload(file)) {
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(absHosted, buf);
    mp3Size = buf.byteLength;
  } else {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-video-"));
    const inPath = path.join(tmpDir, `${stem}${ext}`);
    const outPath = path.join(tmpDir, "out.mp3");
    try {
      await fs.writeFile(inPath, buf);
      try {
        await execFileAsync(
          "ffmpeg",
          [
            "-nostdin",
            "-y",
            "-i",
            inPath,
            "-vn",
            "-acodec",
            "libmp3lame",
            "-q:a",
            "4",
            outPath,
          ],
          { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "ffmpeg 失败";
        return NextResponse.json({ error: `提取音频失败：${msg.slice(0, 400)}` }, { status: 500 });
      }

      let mp3Stat;
      try {
        mp3Stat = await fs.stat(outPath);
      } catch {
        return NextResponse.json({ error: "未生成 MP3 文件" }, { status: 500 });
      }
      if (mp3Stat.size <= 0) {
        return NextResponse.json({ error: "生成的 MP3 为空" }, { status: 500 });
      }

      await fs.mkdir(absDir, { recursive: true });
      await fs.copyFile(outPath, absHosted);
      mp3Size = mp3Stat.size;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  const pathParam = `${wh.walletLower}/${month}/${hostedName}`;
  const base = getPublicBaseUrl(req);
  const mp3Url = `${base}/api/v1/audio-host?path=${encodeURIComponent(pathParam)}`;

  const now = new Date().toISOString();
  const id = `vex-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  const item: VideoExtractItem = {
    id,
    sourceName: displaySourceName,
    mp3Url,
    pathParam,
    size: mp3Size,
    createdAt: now,
  };
  const index = await readIndex(wh.walletLower);
  index.items.unshift(item);
  await writeIndex(index);
  return NextResponse.json({ item });
}
