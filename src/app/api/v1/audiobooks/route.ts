import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import { getLocalDataSubpath } from "@/lib/server/local-data-path";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AudiobookItem = {
  id: string;
  authorId: string;
  novelId: string;
  fileName: string;
  displayName: string;
  synopsis: string;
  details: string;
  mimeType: string;
  size: number;
  pathParam: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

type AudiobookIndex = {
  authorId: string;
  items: AudiobookItem[];
};

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
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
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

function trimTrailingSlash(s: string) {
  return s.replace(/\/+$/, "");
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

function audiobookIndexPath(authorLower: string) {
  return getLocalDataSubpath("audiobooks", "authors", `${authorLower}.json`);
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

function isAllowedAudio(file: File) {
  const ext = path.extname(file.name || "").toLowerCase();
  const mime = (file.type || "").toLowerCase();
  return ALLOWED_MIME.has(mime) || ALLOWED_EXT.has(ext);
}

async function readIndex(authorLower: string): Promise<AudiobookIndex> {
  const fp = audiobookIndexPath(authorLower);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = parseLeadingJsonValue(raw) as AudiobookIndex;
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

async function writeIndex(index: AudiobookIndex) {
  const fp = audiobookIndexPath(index.authorId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(index, null, 2), "utf8");
}

function normalizeNovelId(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 120);
}

function normalizeTextField(raw: unknown, max: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  return raw.trim().slice(0, max);
}

export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;
  const authorId = req.nextUrl.searchParams.get("authorId") ?? "";
  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorId) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }
  const index = await readIndex(wh.walletLower);
  const items = [...index.items]
    .map((x) => ({
      ...x,
      synopsis: typeof x.synopsis === "string" ? x.synopsis : "",
      details: typeof x.details === "string" ? x.details : "",
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
  const authorId = form.get("authorId");
  if (typeof authorId !== "string" || !isAddress(authorId)) {
    return badRequest("Invalid authorId");
  }
  if (safeAuthorId(authorId) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }

  const novelId = normalizeNovelId(form.get("novelId"));
  const files = form.getAll("files");
  if (files.length === 0) return badRequest("请上传音频文件");

  const index = await readIndex(wh.walletLower);
  const month = new Date().toISOString().slice(0, 7).replace("-", "");
  const relDir = path.posix.join("audio-bed", wh.walletLower, month);
  const absDir = getLocalDataSubpath(relDir);
  await fs.mkdir(absDir, { recursive: true });
  const base = getPublicBaseUrl(req);

  const created: AudiobookItem[] = [];
  for (const file of files) {
    if (!(file instanceof File)) continue;
    if (!isAllowedAudio(file)) {
      return badRequest(`不支持的音频类型: ${file.type || file.name || "unknown"}`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength <= 0) return badRequest("存在空音频文件");
    if (bytes.byteLength > MAX_AUDIO_BYTES) {
      return badRequest(`音频文件过大（>${MAX_AUDIO_BYTES / (1024 * 1024)}MB）`);
    }
    const now = new Date().toISOString();
    const id = `abk-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
    const hostedName = makeHostedFileName(file.name || "audio.mp3");
    const absPath = path.join(absDir, hostedName);
    await fs.writeFile(absPath, bytes);
    const pathParam = `${wh.walletLower}/${month}/${hostedName}`;
    const url = `${base}/api/v1/audio-host?path=${encodeURIComponent(pathParam)}`;
    const item: AudiobookItem = {
      id,
      authorId: wh.walletLower,
      novelId,
      fileName: file.name || hostedName,
      displayName: (path.basename(file.name || hostedName, path.extname(file.name || hostedName)) || "未命名音频").slice(0, 120),
      synopsis: "",
      details: "",
      mimeType: file.type || "audio/mpeg",
      size: bytes.byteLength,
      pathParam,
      url,
      createdAt: now,
      updatedAt: now,
    };
    created.push(item);
    index.items.unshift(item);
  }

  await writeIndex(index);
  return NextResponse.json({ items: created });
}

export async function PATCH(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const o = body as Record<string, unknown>;
  const authorId = typeof o.authorId === "string" ? o.authorId : "";
  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorId) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return badRequest("Missing id");
  const displayNameRaw =
    typeof o.displayName === "string"
      ? o.displayName
      : typeof o.title === "string"
        ? o.title
        : undefined;
  const displayName =
    typeof displayNameRaw === "string" ? displayNameRaw.trim().slice(0, 120) : undefined;
  const synopsis = normalizeTextField(o.synopsis, 20000);
  const details = normalizeTextField(o.details, 20000);
  const novelId = o.novelId === null ? "" : normalizeNovelId(o.novelId);
  if (displayName !== undefined && !displayName) return badRequest("Invalid displayName");

  const index = await readIndex(wh.walletLower);
  const idx = index.items.findIndex((x) => x.id === id);
  if (idx < 0) return notFound("未找到该有声书条目");
  const prev = index.items[idx];
  const next: AudiobookItem = {
    ...prev,
    displayName: displayName ?? prev.displayName,
    synopsis: synopsis ?? (typeof prev.synopsis === "string" ? prev.synopsis : ""),
    details: details ?? (typeof prev.details === "string" ? prev.details : ""),
    novelId: o.novelId === undefined ? prev.novelId : novelId,
    updatedAt: new Date().toISOString(),
  };
  index.items[idx] = next;
  await writeIndex(index);
  return NextResponse.json({ item: next, ok: true });
}
