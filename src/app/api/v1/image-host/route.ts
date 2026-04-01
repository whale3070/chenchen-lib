import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";
import { isAddress } from "viem";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB per image

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
    .slice(0, 48);
  return { base: base || "image", ext };
}

function makeHostedFileName(originalName: string) {
  const { base, ext } = sanitizeFilename(originalName);
  const safeExt = ALLOWED_EXT.has(ext) ? ext : ".png";
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
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function sanitizeSegment(seg: string) {
  return seg.replace(/[^\w.-]+/g, "_");
}

async function saveImageBytes(
  bytes: Uint8Array,
  fileName: string,
  authorLower: string,
  req: NextRequest,
) {
  const month = new Date().toISOString().slice(0, 7).replace("-", "");
  const relDir = path.posix.join("image-bed", authorLower, month);
  const absDir = path.join(process.cwd(), ".data", relDir);
  await fs.mkdir(absDir, { recursive: true });
  const hostedName = makeHostedFileName(fileName);
  const absPath = path.join(absDir, hostedName);
  await fs.writeFile(absPath, bytes);
  const base = getPublicBaseUrl(req);
  const pathParam = `${authorLower}/${month}/${hostedName}`;
  const url = `${base}/api/v1/image-host?path=${encodeURIComponent(pathParam)}`;
  return { url, path: absPath };
}

async function handleImageFile(
  file: File,
  authorLower: string,
  req: NextRequest,
): Promise<{ name: string; url: string }> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(`不支持的图片类型: ${file.type || "unknown"}`);
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength <= 0) throw new Error("空文件");
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`图片过大（>${MAX_IMAGE_BYTES / (1024 * 1024)}MB）`);
  }
  const saved = await saveImageBytes(buf, file.name || "image.png", authorLower, req);
  return { name: file.name || "image.png", url: saved.url };
}

async function handleZipFile(
  zipFile: File,
  authorLower: string,
  req: NextRequest,
): Promise<Array<{ name: string; url: string }>> {
  const out: Array<{ name: string; url: string }> = [];
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  for (const entry of entries) {
    try {
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      const bytes = await entry.async("uint8array");
      if (bytes.byteLength <= 0 || bytes.byteLength > MAX_IMAGE_BYTES) continue;
      const saved = await saveImageBytes(bytes, path.basename(entry.name), authorLower, req);
      out.push({ name: entry.name, url: saved.url });
    } catch {
      // Skip broken zip entries instead of failing whole upload.
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const wallet = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(wallet)) {
    return unauthorized("请先连接钱包后再上传图片");
  }
  const authorLower = normalizeAuthor(wallet);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("无效的表单数据");
  }

  const uploads = form.getAll("files");
  const zip = form.get("zip");
  if (uploads.length === 0 && !(zip instanceof File)) {
    return badRequest("请上传图片文件或 zip 压缩包");
  }

  const results: Array<{ name: string; url: string }> = [];

  for (const item of uploads) {
    if (!(item instanceof File)) continue;
    const lowerName = item.name.toLowerCase();
    if (lowerName.endsWith(".zip")) {
      const fromZip = await handleZipFile(item, authorLower, req);
      results.push(...fromZip);
      continue;
    }
    results.push(await handleImageFile(item, authorLower, req));
  }

  if (zip instanceof File) {
    const zipName = zip.name.toLowerCase();
    if (!zipName.endsWith(".zip")) return badRequest("zip 文件格式不正确");
    const fromZip = await handleZipFile(zip, authorLower, req);
    results.push(...fromZip);
  }

  if (results.length === 0) {
    return badRequest("没有找到可处理的图片（支持 png/jpg/webp/gif/svg）");
  }

  return NextResponse.json({ items: results });
}

export async function GET(req: NextRequest) {
  const rawPath = req.nextUrl.searchParams.get("path")?.trim() ?? "";
  if (!rawPath) return badRequest("Missing path");
  const parts = rawPath
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(sanitizeSegment);
  if (parts.length < 3) {
    return badRequest("Invalid path");
  }
  const dataPath = path.join(process.cwd(), ".data", "image-bed", ...parts);
  const publicPath = path.join(process.cwd(), "public", "image-bed", ...parts);
  const root = path.join(process.cwd(), ".data", "image-bed");
  const rel = path.relative(root, dataPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 404 });
  }

  let bytes: Buffer | null = null;
  let ext = "";
  try {
    bytes = await fs.readFile(dataPath);
    ext = path.extname(dataPath).toLowerCase();
  } catch {
    try {
      bytes = await fs.readFile(publicPath);
      ext = path.extname(publicPath).toLowerCase();
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const body = new Uint8Array(bytes);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
