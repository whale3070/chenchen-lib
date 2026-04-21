import fs from "node:fs/promises";
import path from "node:path";

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { isAddress } from "viem";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

const MAX_MP3_BYTES = 100 * 1024 * 1024;

function resolveSttModelId(): "scribe_v1" | "scribe_v2" {
  const raw = process.env.ELEVENLABS_STT_MODEL_ID?.trim().toLowerCase() ?? "";
  return raw === "scribe_v1" ? "scribe_v1" : "scribe_v2";
}

type VideoExtractItem = {
  id: string;
  sourceName: string;
  mp3Url: string;
  pathParam: string;
  size: number;
  createdAt: string;
  status?: "processing" | "ready" | "failed";
  processError?: string;
  pendingFileName?: string;
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

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
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

function sanitizeSegment(seg: string) {
  return seg.replace(/[^\w.-]+/g, "_");
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

function resolveHostedMp3AbsPath(
  authorLower: string,
  pathParam: string,
): { ok: true; absPath: string } | { ok: false; message: string } {
  const parts = pathParam
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(sanitizeSegment);
  if (parts.length < 3) {
    return { ok: false, message: "无效的音频路径" };
  }
  if (parts[0]?.toLowerCase() !== authorLower) {
    return { ok: false, message: "无权访问该音频" };
  }
  const ext = path.extname(parts[parts.length - 1] ?? "").toLowerCase();
  if (ext !== ".mp3") {
    return { ok: false, message: "仅支持对已提取的 MP3 转写" };
  }

  const dataPath = path.join(process.cwd(), ".data", "audio-bed", ...parts);
  const root = path.join(process.cwd(), ".data", "audio-bed");
  const rel = path.relative(root, dataPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, message: "无效的音频路径" };
  }
  return { ok: true, absPath: dataPath };
}

type TranscribeBody = {
  extractId?: unknown;
};

export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "服务器未配置 ELEVENLABS_API_KEY，无法语音转文字" },
      { status: 503 },
    );
  }

  let body: TranscribeBody;
  try {
    body = (await req.json()) as TranscribeBody;
  } catch {
    return badRequest("无效的 JSON 请求体");
  }
  const extractId = typeof body.extractId === "string" ? body.extractId.trim() : "";
  if (!extractId) {
    return badRequest("请提供 extractId");
  }

  const index = await readIndex(wh.walletLower);
  const item = index.items.find((x) => x.id === extractId);
  if (!item) {
    return notFound("未找到该提取记录");
  }
  if (item.status === "processing") {
    return badRequest("该文件正在后台转码为 MP3，请稍候再试语音转文字");
  }
  if (item.status === "failed") {
    return badRequest(
      item.processError?.trim()
        ? `转码失败：${item.processError.trim().slice(0, 400)}`
        : "转码失败，请删除该记录后重新上传",
    );
  }
  if (!item.pathParam) {
    return badRequest("该记录缺少音频存储路径，请重新上传文件生成新记录后再试");
  }

  const resolved = resolveHostedMp3AbsPath(wh.walletLower, item.pathParam);
  if (!resolved.ok) {
    return badRequest(resolved.message);
  }

  let stat;
  try {
    stat = await fs.stat(resolved.absPath);
  } catch {
    return notFound("音频文件不存在或已删除");
  }
  if (!stat.isFile() || stat.size <= 0) {
    return badRequest("音频文件无效");
  }
  if (stat.size > MAX_MP3_BYTES) {
    return badRequest(`音频过大（>${MAX_MP3_BYTES / (1024 * 1024)}MB），暂不支持转写`);
  }

  const client = new ElevenLabsClient({ apiKey });
  try {
    const transcription = await client.speechToText.convert({
      modelId: resolveSttModelId(),
      file: {
        path: resolved.absPath,
        filename: path.basename(resolved.absPath) || "extract.mp3",
        contentType: "audio/mpeg",
        contentLength: stat.size,
      },
      tagAudioEvents: false,
      diarize: false,
    });

    const text =
      transcription && typeof transcription === "object" && "text" in transcription
        ? String((transcription as { text?: string }).text ?? "")
        : "";

    return NextResponse.json({
      text,
      languageCode:
        transcription && typeof transcription === "object" && "languageCode" in transcription
          ? String((transcription as { languageCode?: string }).languageCode ?? "")
          : "",
      languageProbability:
        transcription && typeof transcription === "object" && "languageProbability" in transcription
          ? (transcription as { languageProbability?: number }).languageProbability
          : undefined,
      audioDurationSecs:
        transcription && typeof transcription === "object" && "audioDurationSecs" in transcription
          ? (transcription as { audioDurationSecs?: number }).audioDurationSecs
          : undefined,
      transcriptionId:
        transcription && typeof transcription === "object" && "transcriptionId" in transcription
          ? (transcription as { transcriptionId?: string }).transcriptionId
          : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ElevenLabs 转写失败";
    return NextResponse.json({ error: msg.slice(0, 500) }, { status: 502 });
  }
}
