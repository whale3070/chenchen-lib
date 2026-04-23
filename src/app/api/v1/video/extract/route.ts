import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import busboy from "busboy";
import { isAddress } from "viem";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import { VIDEO_EXTRACT_MAX_BYTES } from "@/lib/video-extract-constants";
import { after, NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * 整条路由墙钟上限（含上传 + 长音频转码）。长 Opus/WAV/MP4 转 MP3 可能远超 15 分钟；
 * 自建可拉大；Vercel 等以平台文档上限为准。
 */
export const maxDuration = 7200;

const execFileAsync = promisify(execFile);

const MAX_VIDEO_BYTES = VIDEO_EXTRACT_MAX_BYTES;
/** 长素材（如 1h+）在慢机上转码可能接近实时数倍；过短会导致 ffmpeg 被杀死、MP3 只有前面一段 */
const FFMPEG_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/**
 * 长任务勿用 execFile：stdout/stderr 超过 maxBuffer 时 Node 会杀掉子进程，ffmpeg 可能只生成前面十几分钟。
 * spawn + 仅保留 stderr 尾部，避免该截断。
 */
function runFfmpegSpawn(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderrTail = "";
    const maxTail = 24_576;
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (ch: string) => {
      stderrTail = (stderrTail + ch).slice(-maxTail);
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
      reject(
        new Error(
          `ffmpeg 超时（>${Math.round(timeoutMs / 60000)} 分钟）。${stderrTail ? `stderr 尾部：${stderrTail}` : ""}`,
        ),
      );
    }, timeoutMs);
    child.once("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `ffmpeg 被终止（${signal}）${stderrTail ? `：${stderrTail}` : ""}`
            : `ffmpeg 退出码 ${code}${stderrTail ? `：${stderrTail}` : ""}`,
        ),
      );
    });
  });
}

/** ffprobe 输出很小，可用 execFile */
async function ffprobeDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        /** 默认探测较短时，部分 Ogg/Opus 的 format.duration 不可靠；拉大以便与解码结果对照 */
        "-analyzeduration",
        "100000000",
        "-probesize",
        String(100 * 1024 * 1024),
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { maxBuffer: 16_384, timeout: 120_000 },
    );
    const n = parseFloat(String(stdout).trim());
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export type VideoExtractItem = {
  id: string;
  sourceName: string;
  mp3Url: string;
  pathParam: string;
  /** 入库的 MP3 字节数；转码完成前与「已上传源文件」相同，见 sourceSize */
  size: number;
  createdAt: string;
  /** 上传的源音/视频大小（字节）；转码完成后仍保留，便于与 MP3 区分 */
  sourceSize?: number;
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

function parsePositiveSafeIntHeader(v: string | null): number | null {
  const raw = v?.trim() ?? "";
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER) return null;
  if (Math.floor(n) !== n) return null;
  return n;
}

/**
 * 工作台 octet-stream 上传会带 `x-upload-byte-length`（即浏览器 File.size）。
 * 若反代将 client_max_body_size 卡在约 10MB，请求体常被静默截断，FFmpeg 只能解出十几分钟音频。
 */
function verifyReceivedBodyMatchesDeclared(
  req: NextRequest,
  receivedBytes: number,
): NextResponse | null {
  const declared = parsePositiveSafeIntHeader(req.headers.get("x-upload-byte-length"));
  if (declared != null) {
    if (declared > MAX_VIDEO_BYTES) {
      return badRequest(`文件过大（>${MAX_VIDEO_BYTES / (1024 * 1024)}MB）`);
    }
    if (declared !== receivedBytes) {
      return badRequest(
        `上传体不完整：服务端收到 ${receivedBytes} 字节，与浏览器声明的文件大小 ${declared} 字节不一致。` +
          "若原文件明显大于约 10MB，多为反向代理将 client_max_body_size 限制过小（如 10m），只转发了首段请求体，转码结果会只有十几分钟。请将 nginx 等对 /api/v1/video/ 的 client_max_body_size 调至 ≥240m，并提高 client_body_timeout、proxy 读写超时；参考 apps/web/nginx-long-api.example.conf。",
      );
    }
    return null;
  }
  const cl = parsePositiveSafeIntHeader(req.headers.get("content-length"));
  if (cl != null && cl <= MAX_VIDEO_BYTES && receivedBytes < cl) {
    return badRequest(
      `上传体不完整：Content-Length 为 ${cl}，实际仅收到 ${receivedBytes} 字节。请检查反向代理的 client_max_body_size 与超时配置（参见 apps/web/nginx-long-api.example.conf）。`,
    );
  }
  return null;
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

export function getPublicBaseUrl(req: NextRequest): string {
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

export async function readIndex(authorLower: string): Promise<VideoExtractIndex> {
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

export async function writeIndex(index: VideoExtractIndex) {
  const fp = indexPath(index.authorId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(index, null, 2), "utf8");
}

export function pendingExtractAbsPath(authorLower: string, pendingFileName: string) {
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

export async function runVideoExtractJob(args: {
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
    if (ext === ".opus" || ext === ".ogg") {
      const pendingBody = await fs.readFile(pendingAbs);
      if (isChainedOpusOggUpload(pendingBody, ext)) {
        await markExtractJobFailed(
          authorLower,
          id,
          "链式 Ogg/Opus（多个 OpusHead）：FFmpeg 通常只解码第一段，已中止转码。请导出为单一流、转 WAV 或分段上传。",
          pendingAbs,
        );
        return;
      }
      await fs.writeFile(inPath, pendingBody);
    } else {
      await fs.copyFile(pendingAbs, inPath);
    }
    try {
      await runFfmpegSpawn(
        [
          "-hide_banner",
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
        FFMPEG_TIMEOUT_MS,
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

    const inDur = await ffprobeDurationSeconds(inPath);
    const outDur = await ffprobeDurationSeconds(outPath);
    if (
      inDur != null &&
      outDur != null &&
      inDur >= 180 &&
      outDur < inDur * 0.85
    ) {
      const hint =
        "输出时长明显短于源文件，常见原因：此前 ffmpeg 被 Node maxBuffer 截断（已改为 spawn）、上传不完整、或源文件元数据异常。请删除本条后重新上传。";
      await markExtractJobFailed(
        authorLower,
        id,
        `${hint}（ffprobe：源约 ${Math.round(inDur)}s，MP3 约 ${Math.round(outDur)}s）`,
        pendingAbs,
      );
      await fs.unlink(outPath).catch(() => undefined);
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
    /** 转码前列表里 size 为已上传源文件字节数；写入 MP3 大小并保留 sourceSize 供列表展示 */
    if (typeof it.sourceSize !== "number") {
      it.sourceSize = it.size;
    }
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

/** Opus 识别头（RFC 7845）；链式 Ogg 中每一段逻辑流都会再次出现，FFmpeg 常只解码第一段。 */
const OPUS_HEAD_MAGIC = Buffer.from("OpusHead");

function countOpusHeadMarkers(data: Uint8Array): number {
  if (data.byteLength < OPUS_HEAD_MAGIC.length) return 0;
  let count = 0;
  for (let i = 0; i <= data.byteLength - OPUS_HEAD_MAGIC.length; i++) {
    let match = true;
    for (let j = 0; j < OPUS_HEAD_MAGIC.length; j++) {
      if (data[i + j] !== OPUS_HEAD_MAGIC[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      count++;
      i += OPUS_HEAD_MAGIC.length - 1;
    }
  }
  return count;
}

/** 是否为 FFmpeg 易截断的链式 Opus-in-Ogg（多个 OpusHead）。纯 Vorbis 的 .ogg 不含该魔数，计数为 0。 */
export function isChainedOpusOggUpload(data: Uint8Array, ext: string): boolean {
  if (ext !== ".opus" && ext !== ".ogg") return false;
  return countOpusHeadMarkers(data) > 1;
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

  if (primaryCt === "application/octet-stream") {
    const lengthMismatch = verifyReceivedBodyMatchesDeclared(req, buf.byteLength);
    if (lengthMismatch) return lengthMismatch;
  }

  const ext = inferUploadExt(file);
  if (isChainedOpusOggUpload(buf, ext)) {
    return badRequest(
      "检测到链式 Ogg/Opus（文件内出现多个 Opus 逻辑流头 OpusHead）。部分录音/拼接软件会生成此类文件；" +
        "当前服务端使用的 FFmpeg 通常只会解码其中第一段，导致 MP3 时长远短于本地完整播放。请改用软件的「单文件/单流」导出，或先用 opus-tools 等能完整解链式 Ogg 的工具转为 WAV 再上传，或将多段拆开分别上传。",
    );
  }

  const month = new Date().toISOString().slice(0, 7).replace("-", "");
  const publicBase = getPublicBaseUrl(req);

  const rawBase =
    path.basename(file.name || "").replace(/[^\w.-]+/g, "_").replace(/\.+$/, "") || "upload";
  const stem = rawBase.replace(/\.[^.]+$/, "") || "upload";
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
      sourceSize: mp3Size,
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
    sourceSize: buf.byteLength,
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
