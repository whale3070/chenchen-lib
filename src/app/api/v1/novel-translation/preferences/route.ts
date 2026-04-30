import { isAddress } from "viem";

import {
  canonicalTranslationPreferenceValue,
  getTranslationModelOptions,
  isValidTranslationPreferenceValue,
  normalizeTranslationPreferenceInput,
  resolveTranslationBackend,
} from "@/lib/novel-translation-models";
import {
  readTranslationPreferencesData,
  writeTranslationPreferencesData,
  normalizeLangList,
} from "@/lib/server/translation-preferences-store";
import { NextResponse, type NextRequest } from "next/server";

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

export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const authorIdParam = req.nextUrl.searchParams.get("authorId") ?? "";
  if (!isAddress(authorIdParam)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorIdParam) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }

  const prefs = await readTranslationPreferencesData(wh.walletLower);
  const translationModelOptions = getTranslationModelOptions();
  const backend = resolveTranslationBackend(prefs?.translationModel ?? null);
  const translationModel = canonicalTranslationPreferenceValue(backend);
  return NextResponse.json({
    preferredLanguages: prefs?.preferredLanguages ?? ["en", "ja"],
    defaultTargetLanguage: prefs?.defaultTargetLanguage ?? "en",
    translationModel,
    modelChoices: translationModelOptions.map((o) => o.value),
    translationModelOptions,
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
  const existing = await readTranslationPreferencesData(wh.walletLower);

  const incomingPref = normalizeTranslationPreferenceInput(o.translationModel);
  let translationModel: string;
  if (incomingPref && isValidTranslationPreferenceValue(incomingPref)) {
    translationModel = incomingPref;
  } else if (
    existing?.translationModel &&
    isValidTranslationPreferenceValue(existing.translationModel)
  ) {
    translationModel = existing.translationModel;
  } else {
    const b = resolveTranslationBackend(null);
    translationModel = canonicalTranslationPreferenceValue(b);
  }

  const payload = {
    authorId: wh.walletLower,
    preferredLanguages,
    defaultTargetLanguage:
      defaultTargetLanguage || preferredLanguages[0] || "en",
    translationModel,
    updatedAt: new Date().toISOString(),
  };
  await writeTranslationPreferencesData(payload);

  const translationModelOptions = getTranslationModelOptions();
  return NextResponse.json({
    ok: true,
    preferredLanguages: payload.preferredLanguages,
    defaultTargetLanguage: payload.defaultTargetLanguage,
    translationModel: payload.translationModel,
    modelChoices: translationModelOptions.map((o) => o.value),
    translationModelOptions,
  });
}
