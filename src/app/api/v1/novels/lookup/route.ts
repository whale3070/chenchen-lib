import { isAddress } from "viem";
import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import type { NovelMeta } from "@/app/api/v1/novels/route";

export const runtime = "nodejs";

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function safeAuthorId(id: string) {
  return id.toLowerCase();
}

function parseWalletHeader(req: NextRequest):
  | { ok: true; walletLower: string }
  | { ok: false; res: NextResponse } {
  const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(headerAddr)) {
    return { ok: false, res: unauthorized("缺少或无效的 x-wallet-address") };
  }
  return { ok: true, walletLower: safeAuthorId(headerAddr) };
}

async function readAuthorNovels(
  authorLower: string,
): Promise<NovelMeta[] | null> {
  const fp = path.join(
    process.cwd(),
    ".data",
    "novels",
    "authors",
    `${authorLower}.json`,
  );
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as { novels?: NovelMeta[] };
    if (data && Array.isArray(data.novels)) return data.novels;
    return [];
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return [];
    throw e;
  }
}

/** 查询当前钱包名下单本书的标题与简介（用于编辑器初始化）。 */
export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const authorIdParam = req.nextUrl.searchParams.get("authorId") ?? "";
  if (!isAddress(authorIdParam)) {
    return badRequest("Invalid authorId");
  }
  if (safeAuthorId(authorIdParam) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }

  const novelId = req.nextUrl.searchParams.get("novelId")?.trim() ?? "";
  if (!novelId) {
    return badRequest("Missing novelId");
  }

  const novels = await readAuthorNovels(wh.walletLower);
  const novel = novels?.find((n) => n.id === novelId) ?? null;
  if (!novel) {
    return NextResponse.json({ error: "未找到该小说" }, { status: 404 });
  }

  return NextResponse.json({
    novel: {
      id: novel.id,
      authorId: novel.authorId,
      title: novel.title,
      description: novel.description,
      createdAt: novel.createdAt,
      updatedAt: novel.updatedAt,
    } satisfies NovelMeta,
  });
}
