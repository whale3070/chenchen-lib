import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AudiobookItem = {
  id: string;
  authorId: string;
  pathParam: string;
};

type AudiobookIndex = {
  authorId: string;
  items: AudiobookItem[];
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
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

function audiobookIndexPath(authorLower: string) {
  return path.join(process.cwd(), ".data", "audiobooks", "authors", `${authorLower}.json`);
}

async function readIndex(authorLower: string): Promise<AudiobookIndex> {
  const fp = audiobookIndexPath(authorLower);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as AudiobookIndex;
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

function toDataFilePath(pathParam: string) {
  const parts = pathParam
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/[^\w.-]+/g, "_"));
  return path.join(process.cwd(), ".data", "audio-bed", ...parts);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;
  const authorId = req.nextUrl.searchParams.get("authorId") ?? "";
  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorId) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }
  const params = await context.params;
  const id = params.id?.trim();
  if (!id) return badRequest("Missing id");

  const index = await readIndex(wh.walletLower);
  const target = index.items.find((x) => x.id === id);
  if (!target) {
    return NextResponse.json({ error: "未找到该有声书条目" }, { status: 404 });
  }
  index.items = index.items.filter((x) => x.id !== id);
  await writeIndex(index);

  const filePath = toDataFilePath(target.pathParam);
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore file deletion errors; metadata has been removed.
  }
  return NextResponse.json({ ok: true });
}
