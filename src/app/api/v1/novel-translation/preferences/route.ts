import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

type TranslationPreferences = {
  authorId: string;
  preferredLanguages: string[];
  defaultTargetLanguage: string;
  updatedAt: string;
};

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

function preferencesPath(authorLower: string) {
  return path.join(
    process.cwd(),
    ".data",
    "translation-preferences",
    `${authorLower}.json`,
  );
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

function normalizeLangList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = input
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(out)).slice(0, 8);
}

async function readPreferences(authorLower: string): Promise<TranslationPreferences | null> {
  const fp = preferencesPath(authorLower);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as Partial<TranslationPreferences>;
    const preferredLanguages = normalizeLangList(data.preferredLanguages);
    const defaultTargetLanguage =
      typeof data.defaultTargetLanguage === "string"
        ? data.defaultTargetLanguage.trim().toLowerCase()
        : "";
    return {
      authorId: authorLower,
      preferredLanguages,
      defaultTargetLanguage:
        defaultTargetLanguage || preferredLanguages[0] || "en",
      updatedAt:
        typeof data.updatedAt === "string"
          ? data.updatedAt
          : new Date().toISOString(),
    };
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return null;
    throw e;
  }
}

async function writePreferences(data: TranslationPreferences) {
  const fp = preferencesPath(data.authorId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf8");
}

export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const authorIdParam = req.nextUrl.searchParams.get("authorId") ?? "";
  if (!isAddress(authorIdParam)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorIdParam) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }

  const prefs = await readPreferences(wh.walletLower);
  return NextResponse.json({
    preferredLanguages: prefs?.preferredLanguages ?? ["en", "ja"],
    defaultTargetLanguage: prefs?.defaultTargetLanguage ?? "en",
  });
}

export async function POST(req: NextRequest) {
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

  const preferredLanguages = normalizeLangList(o.preferredLanguages);
  const defaultTargetLanguage =
    typeof o.defaultTargetLanguage === "string"
      ? o.defaultTargetLanguage.trim().toLowerCase()
      : "";
  const payload: TranslationPreferences = {
    authorId: wh.walletLower,
    preferredLanguages,
    defaultTargetLanguage:
      defaultTargetLanguage || preferredLanguages[0] || "en",
    updatedAt: new Date().toISOString(),
  };
  await writePreferences(payload);

  return NextResponse.json({
    ok: true,
    preferredLanguages: payload.preferredLanguages,
    defaultTargetLanguage: payload.defaultTargetLanguage,
  });
}
