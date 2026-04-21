import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import busboy from "busboy";
import { isAddress } from "viem";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import { after, NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * 整条路由墙钟上限（含上传 + 长音频转码）。长 Opus/WAV/MP4 转 MP3 可能远超 15 分钟；
 * 自建可拉大；Vercel 等以平台文档上限为准。
 */
export const maxDuration = 7200;

const execFileAsync = promisify(execFile);

const MAX_VIDEO_BYTES = 220 * 1024 * 1024;
/** 长素材（如 1h+）在慢机上转码可能接近实时数倍；过短会导致 ffmpeg 被杀死、MP3 只有前面一段 */
const FFMPEG_TIMEOUT_MS = 4 * 60 * 60 * 1000;

type VideoExtractItem = {
  id: string;
  sourceName: string;
  mp3Url: string;
  pathParam: string;
  size: number;
  createdAt: string;
  /** 缺省或 ready：可播放；processing：已落盘、后台转码中；failed：转码失败 */
  status?: "processing" | "ready" | "failed";
  processError?: string;
  /** 转码中：仅文件名 `id+ext`，位于 `.data/video-extract-pending/{authorLower}/` */
  pendingFileName?: string;
};

type VideoExtractIndex = {
  authorId: string;
  items: VideoExtractItem[];
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function formDataFailurePayload(detail: string, hint: string) {
  return NextResponse.json(
    {
      error: "无效的表单数据",
      detail: detail.slice(0, 500),
      hint,
    },
    { status: 400 },
  );
}

function parseUnknownErrorMessage(e: unknown, maxLen: number): string {
  if (e instanceof Error) return e.message.slice(0, maxLen);
  return String(e).slice(0, maxLen);
}

function primaryHttpContentType(headerVal: string): string {
  return headerVal.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** 浏览器用 UTF-8 文件名经 base64 放在 x-upload-filename-b64，避免 multipart 解析问题 */
function decodeFilenameFromB64Header(headerVal: string | null): string {
  const raw = headerVal?.trim() ?? "";
  if (!raw) return "upload";
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const one = decoded.replace(/\0/g, "").trim();
    if (!one) return "upload";
    const base = path.basename(one);
    if (!base || base.length > 512) return "upload";
    return base;
  } catch {
    return "upload";
  }
}

/** 请求体为原始字节流，无 multipart；兼容 Next/Undici 下大文件上传不稳定问题 */
async function readUploadFromOctetStream(
  req: NextRequest,
): Promise<{ ok: true; file: File } | { ok: false; res: NextResponse }> {
  let raw: ArrayBuffer;
  try {
    raw = await req.arrayBuffer();
  } catch (e: unknown) {
    const detail = parseUnknownErrorMessage(e, 500);
    console.error("[video/extract] octet-stream arrayBuffer failed:", e);
    return {
      ok: false,
      res: formDataFailurePayload(
        detail,
        "读取请求体失败。若经反代，请检查 client_max_body_size、proxy 超时与磁盘空间。",
      ),
    };
  }
  if (raw.byteLength <= 0) {
    return { ok: false, res: badRequest("请求体为空") };
  }
  if (raw.byteLength > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      res: badRequest(`文件过大（>${MAX_VIDEO_BYTES / (1024 * 1024)}MB）`),
    };
  }

  const filename = decodeFilenameFromB64Header(req.headers.get("x-upload-filename-b64"));
  const mimeHdr = req.headers.get("x-upload-mime")?.trim() ?? "";
  const mimePrimary = (mimeHdr.split(";")[0]?.trim() || "application/octet-stream").slice(
    0,
    200,
  );

  try {
    const file = new File([new Uint8Array(raw)], filename, { type: mimePrimary });
    return { ok: true, file };
  } catch (e: unknown) {
    const detail = parseUnknownErrorMessage(e, 500);
    return {
      ok: false,
      res: formDataFailurePayload(detail, "无法构建上传文件对象。"),
    };
  }
}

/**
 * Next 内置 `req.formData()` 对部分 multipart 会抛 `Failed to parse body as FormData`。
 * 用 busboy 解析 multipart；**先 `arrayBuffer()` 再 `Readable.from`**，避免
 * `Readable.fromWeb(req.body)` 与 Undici/Next 请求体流组合时出现流提前结束
 *（busboy 报 `Unexpected end of form`）。
 */
async function readUploadFileFromMultipart(
  req: NextRequest,
  contentType: string,
): Promise<{ ok: true; file: File } | { ok: false; res: NextResponse }> {
  let raw: ArrayBuffer;
  try {
    raw = await req.arrayBuffer();
  } catch (e: unknown) {
    const detail = parseUnknownErrorMessage(e, 500);
    console.error("[video/extract] req.arrayBuffer() failed:", e);
    return {
      ok: false,
      res: formDataFailurePayload(
        detail,
        "读取请求体失败。若经反代，请检查 client_max_body_size、proxy 超时与磁盘空间。",
      ),
    };
  }
  if (raw.byteLength <= 0) {
    return { ok: false, res: badRequest("请求体为空") };
  }
  if (raw.byteLength > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      res: badRequest(`文件过大（>${MAX_VIDEO_BYTES / (1024 * 1024)}MB）`),
    };
  }

  const rawBuf = Buffer.from(raw);

  return await new Promise((resolve) => {
    let settled = false;
    const done = (out: { ok: true; file: File } | { ok: false; res: NextResponse }) => {
      if (settled) return;
      settled = true;
      resolve(out);
    };

    let sawFileField = false;

    const bb = busboy({
      headers: { "content-type": contentType },
      limits: { files: 8, fileSize: MAX_VIDEO_BYTES },
    });

    bb.on("file", (fieldname, fileStream, info) => {
      if (fieldname !== "file") {
        fileStream.resume();
        return;
      }
      if (sawFileField) {
        fileStream.resume();
        return;
      }
      sawFileField = true;

      const chunks: Buffer[] = [];
      let received = 0;

      fileStream.on("data", (chunk: Buffer) => {
        if (settled) return;
        received += chunk.length;
        if (received > MAX_VIDEO_BYTES) {
          fileStream.destroy();
          done({
            ok: false,
            res: badRequest(`文件过大（>${MAX_VIDEO_BYTES / (1024 * 1024)}MB）`),
          });
          return;
        }
        chunks.push(chunk);
      });

      fileStream.on("limit", () => {
        fileStream.destroy();
        if (!settled) {
          done({
            ok: false,
            res: badRequest(`文件过大（>${MAX_VIDEO_BYTES / (1024 * 1024)}MB）`),
          });
        }
      });

      fileStream.on("error", (err: unknown) => {
        const detail = parseUnknownErrorMessage(err, 500);
        console.error("[video/extract] multipart file stream error:", err);
        done({
          ok: false,
          res: formDataFailurePayload(
            detail,
            "解析 multipart 文件字段失败。若仍报 Unexpected end of form，多为请求体不完整（网络中断或反代截断）。",
          ),
        });
      });

      fileStream.on("end", () => {
        if (settled) return;
        const buf = Buffer.concat(chunks);
        if (buf.length <= 0) {
          done({ ok: false, res: badRequest("空文件") });
          return;
        }
        const filename = info.filename || "upload";
        const mime = info.mimeType || "application/octet-stream";
        try {
          const file = new File([buf], filename, { type: mime });
          done({ ok: true, file });
        } catch (e: unknown) {
          const detail = parseUnknownErrorMessage(e, 500);
          done({
            ok: false,
            res: formDataFailurePayload(detail, "无法构建上传文件对象。"),
          });
        }
      });
    });

    bb.on("error", (err: unknown) => {
      const detail = parseUnknownErrorMessage(err, 500);
      console.error("[video/extract] busboy parse error:", err);
      done({
        ok: false,
        res: formDataFailurePayload(
          detail,
          "multipart 解析失败。若请求经反代，请检查 client_max_body_size 与超时。",
        ),
      });
    });

    bb.on("finish", () => {
      queueMicrotask(() => {
        if (settled) return;
        if (!sawFileField) {
          done({
            ok: false,
            res: badRequest(
              "请上传单个文件（字段名 file）：MP4、MP3、WAV、Opus（.opus）或 Ogg（.ogg）",
            ),
          });
        }
      });
    });

    try {
      const nodeReadable = Readable.from(rawBuf);
      nodeReadable.on("error", (err: unknown) => {
        const detail = parseUnknownErrorMessage(err, 500);
        console.error("[video/extract] buffer read stream error:", err);
        done({
          ok: false,
          res: formDataFailurePayload(detail, "无法从已缓冲的请求体建立可读流。"),
        });
      });
      nodeReadable.pipe(bb);
    } catch (e: unknown) {
      const detail = parseUnknownErrorMessage(e, 500);
      console.error("[video/extract] pipe buffer to busboy failed:", e);
      done({
        ok: false,
        res: formDataFailurePayload(detail, "无法将请求体送入解析器。"),
      });
    }
  });
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
    const data = parseLeadingJsonValue(raw) as VideoExtractIndex;
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

function pendingExtractAbsPath(authorLower: string, pendingFileName: string) {
  return path.join(process.cwd(), ".data", "video-extract-pending", authorLower, pendingFileName);
}

async function markExtractJobFailed(
  authorLower: string,
  id: string,
  message: string,
  pendingAbs: string,
) {
  try {
    const index = await readIndex(authorLower);
    const it = index.items.find((x) => x.id === id);
    if (it) {
      it.status = "failed";
      it.processError = message.slice(0, 500);
      delete it.pendingFileName;
      await writeIndex(index);
    }
  } catch (e) {
    console.error("[video/extract] markExtractJobFailed:", e);
  }
  await fs.unlink(pendingAbs).catch(() => undefined);
}

async function runVideoExtractJob(args: {
  authorLower: string;
  id: string;
  ext: string;
  publicBase: string;
  month: string;
  pendingAbs: string;
}) {
  const { authorLower, id, ext, publicBase, month, pendingAbs } = args;
  try {
    await fs.access(pendingAbs);
  } catch {
    console.error("[video/extract] pending source missing:", pendingAbs);
    return;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-video-"));
  const inPath = path.join(tmpDir, `in${ext}`);
  const outPath = path.join(tmpDir, "out.mp3");
  try {
    await fs.copyFile(pendingAbs, inPath);
    try {
      await execFileAsync(
        "ffmpeg",
        [
          "-nostdin",
          "-loglevel",
          "error",
          "-y",
          "-i",
          inPath,
          "-vn",
          "-acodec",
          "libmp3lame",
          "-b:a",
          "160k",
          "-f",
          "mp3",
          outPath,
        ],
        { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ffmpeg 失败";
      await markExtractJobFailed(authorLower, id, `提取音频失败：${msg}`, pendingAbs);
      return;
    }

    let mp3Stat;
    try {
      mp3Stat = await fs.stat(outPath);
    } catch {
      await markExtractJobFailed(authorLower, id, "未生成 MP3 文件", pendingAbs);
      return;
    }
    if (mp3Stat.size <= 0) {
      await markExtractJobFailed(authorLower, id, "生成的 MP3 为空", pendingAbs);
      return;
    }

    const hostedName = `${id}.mp3`;
    const absDir = path.join(process.cwd(), ".data", "audio-bed", authorLower, month);
    const absHosted = path.join(absDir, hostedName);
    await fs.mkdir(absDir, { recursive: true });
    await fs.copyFile(outPath, absHosted);

    const pathParam = `${authorLower}/${month}/${hostedName}`;
    const mp3Url = `${publicBase}/api/v1/audio-host?path=${encodeURIComponent(pathParam)}`;

    const index = await readIndex(authorLower);
    const it = index.items.find((x) => x.id === id);
    if (!it) {
      await fs.unlink(pendingAbs).catch(() => undefined);
      return;
    }
    it.mp3Url = mp3Url;
    it.pathParam = pathParam;
    it.size = mp3Stat.size;
    it.status = "ready";
    delete it.processError;
    delete it.pendingFileName;
    await writeIndex(index);
    await fs.unlink(pendingAbs).catch(() => undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markExtractJobFailed(authorLower, id, msg, pendingAbs);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
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

/** 上传：MP4（抽音轨）、WAV/Opus/Ogg（转 MP3）、已是 MP3 则直存（不转码） */
function isSupportedMediaFile(file: File) {
  const ext = path.extname(file.name || "").toLowerCase();
  const mime = primaryMime(file);
  if (ext === ".mp4" || mime === "video/mp4") return true;
  if (ext === ".opus" || mime === "audio/opus") return true;
  if (ext === ".ogg" || mime === "audio/ogg" || mime === "application/ogg") return true;
  if (
    ext === ".wav" ||
    mime === "audio/wav" ||
    mime === "audio/x-wav" ||
    mime === "audio/wave"
  )
    return true;
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
  if (ext === ".mp4" || ext === ".opus" || ext === ".ogg" || ext === ".mp3" || ext === ".wav")
    return ext;
  const mime = primaryMime(file);
  if (mime === "video/mp4") return ".mp4";
  if (mime === "audio/opus") return ".opus";
  if (mime === "audio/ogg" || mime === "application/ogg") return ".ogg";
  if (mime === "audio/wav" || mime === "audio/x-wav" || mime === "audio/wave") return ".wav";
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

  if (removed?.pendingFileName) {
    const pAbs = pendingExtractAbsPath(wh.walletLower, removed.pendingFileName);
    await fs.unlink(pAbs).catch(() => undefined);
  }

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

  const contentTypeFull = req.headers.get("content-type")?.trim() ?? "";
  const primaryCt = primaryHttpContentType(contentTypeFull);

  let file: File;
  if (primaryCt === "application/octet-stream") {
    const oct = await readUploadFromOctetStream(req);
    if (!oct.ok) return oct.res;
    file = oct.file;
  } else if (contentTypeFull.toLowerCase().includes("multipart/form-data")) {
    if (!/boundary=/i.test(contentTypeFull)) {
      return formDataFailurePayload(
        "multipart 请求头中缺少 boundary=",
        "使用 FormData 时浏览器会自动带 boundary；若用 curl/脚本，需形如：Content-Type: multipart/form-data; boundary=----...",
      );
    }
    const parsed = await readUploadFileFromMultipart(req, contentTypeFull);
    if (!parsed.ok) return parsed.res;
    file = parsed.file;
  } else {
    return badRequest(
      "不支持的 Content-Type。工作台应使用 application/octet-stream；脚本可使用 multipart/form-data（字段名 file）。",
    );
  }
  if (!isSupportedMediaFile(file)) {
    return badRequest(
      "仅支持 MP4、MP3、WAV，或 Opus（.opus）/ Ogg（.ogg）；非 MP3 将转码为 MP3 后入库",
    );
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength <= 0) return badRequest("空文件");
  if (buf.byteLength > MAX_VIDEO_BYTES) {
    return badRequest(`文件过大（>${MAX_VIDEO_BYTES / (1024 * 1024)}MB）`);
  }

  const month = new Date().toISOString().slice(0, 7).replace("-", "");
  const publicBase = getPublicBaseUrl(req);

  const rawBase =
    path.basename(file.name || "").replace(/[^\w.-]+/g, "_").replace(/\.+$/, "") || "upload";
  const stem = rawBase.replace(/\.[^.]+$/, "") || "upload";
  const ext = inferUploadExt(file);
  const displaySourceName = file.name || `${stem}${ext}`;

  const now = new Date().toISOString();
  const id = `vex-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;

  if (isRawMp3Upload(file)) {
    const hostedName = `vex-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}.mp3`;
    const absDir = path.join(process.cwd(), ".data", "audio-bed", wh.walletLower, month);
    const absHosted = path.join(absDir, hostedName);
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(absHosted, buf);
    const mp3Size = buf.byteLength;
    const pathParam = `${wh.walletLower}/${month}/${hostedName}`;
    const mp3Url = `${publicBase}/api/v1/audio-host?path=${encodeURIComponent(pathParam)}`;
    const item: VideoExtractItem = {
      id,
      sourceName: displaySourceName,
      mp3Url,
      pathParam,
      size: mp3Size,
      createdAt: now,
      status: "ready",
    };
    const index = await readIndex(wh.walletLower);
    index.items.unshift(item);
    await writeIndex(index);
    return NextResponse.json({ item });
  }

  const pendingFileName = `${id}${ext}`;
  const pendingDir = path.join(process.cwd(), ".data", "video-extract-pending", wh.walletLower);
  await fs.mkdir(pendingDir, { recursive: true });
  const pendingAbs = path.join(pendingDir, pendingFileName);
  await fs.writeFile(pendingAbs, buf);

  const item: VideoExtractItem = {
    id,
    sourceName: displaySourceName,
    mp3Url: "",
    pathParam: "",
    size: buf.byteLength,
    createdAt: now,
    status: "processing",
    pendingFileName,
  };
  const index = await readIndex(wh.walletLower);
  index.items.unshift(item);
  await writeIndex(index);

  after(() => {
    void runVideoExtractJob({
      authorLower: wh.walletLower,
      id,
      ext,
      publicBase,
      month,
      pendingAbs,
    });
  });

  return NextResponse.json({ item, asyncAccepted: true });
}
