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

function isMp4File(file: File) {
  const ext = path.extname(file.name || "").toLowerCase();
  const mime = (file.type || "").toLowerCase();
  return ext === ".mp4" || mime === "video/mp4";
}

export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;
  const index = await readIndex(wh.walletLower);
  const items = [...index.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ items });
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
    return badRequest("请上传单个 MP4 文件（字段名 file）");
  }
  if (!isMp4File(file)) {
    return badRequest("仅支持 MP4 视频");
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength <= 0) return badRequest("空文件");
  if (buf.byteLength > MAX_VIDEO_BYTES) {
    return badRequest(`视频过大（>${MAX_VIDEO_BYTES / (1024 * 1024)}MB）`);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-video-"));
  const inName = path.basename(file.name || "upload.mp4").replace(/[^\w.-]+/g, "_") || "upload.mp4";
  const inPath = path.join(tmpDir, inName.endsWith(".mp4") ? inName : `${inName}.mp4`);
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

    const month = new Date().toISOString().slice(0, 7).replace("-", "");
    const hostedName = `vex-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}.mp3`;
    const absDir = path.join(process.cwd(), ".data", "audio-bed", wh.walletLower, month);
    await fs.mkdir(absDir, { recursive: true });
    const absHosted = path.join(absDir, hostedName);
    await fs.copyFile(outPath, absHosted);

    const pathParam = `${wh.walletLower}/${month}/${hostedName}`;
    const base = getPublicBaseUrl(req);
    const mp3Url = `${base}/api/v1/audio-host?path=${encodeURIComponent(pathParam)}`;

    const now = new Date().toISOString();
    const id = `vex-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
    const item: VideoExtractItem = {
      id,
      sourceName: file.name || inName,
      mp3Url,
      pathParam,
      size: mp3Stat.size,
      createdAt: now,
    };
    const index = await readIndex(wh.walletLower);
    index.items.unshift(item);
    await writeIndex(index);
    return NextResponse.json({ item });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
