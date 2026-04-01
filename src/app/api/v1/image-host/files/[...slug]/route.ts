import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await ctx.params;
  if (!Array.isArray(slug) || slug.length < 3) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const safeParts = slug.map(sanitizeSegment);
  const dataRoot = path.join(process.cwd(), ".data", "image-bed");
  const publicRoot = path.join(process.cwd(), "public", "image-bed");
  const dataPath = path.join(dataRoot, ...safeParts);
  const rel = path.relative(dataRoot, dataPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  let bytes: Buffer | null = null;
  let ext = "";
  try {
    bytes = await fs.readFile(dataPath);
    ext = path.extname(dataPath).toLowerCase();
  } catch {
    // fallback for old uploads saved under public/image-bed
    const publicPath = path.join(publicRoot, ...safeParts);
    try {
      bytes = await fs.readFile(publicPath);
      ext = path.extname(publicPath).toLowerCase();
    } catch {
      return new NextResponse("Not Found", { status: 404 });
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
