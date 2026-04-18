import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

type StructurePayload = {
  nodes?: Array<{
    kind?: string;
    metadata?: Record<string, unknown>;
  }>;
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

function safeNovelSegment(novelId: string) {
  return novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function structurePath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "structure",
    `${authorLower}_${safeNovelSegment(novelId)}.json`,
  );
}

function draftPath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "drafts",
    `${authorLower}_${safeNovelSegment(novelId)}.json`,
  );
}

function htmlToPlainText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim();
}

async function readFromStructure(authorLower: string, novelId: string): Promise<string> {
  const raw = await fs.readFile(structurePath(authorLower, novelId), "utf8");
  const structure = parseLeadingJsonValue(raw) as StructurePayload;
  const chapter = (structure.nodes ?? []).find((n) => n.kind === "chapter");
  const htmlCandidate =
    chapter?.metadata?.chapterHtmlMobile ??
    chapter?.metadata?.chapterHtmlDesktop ??
    chapter?.metadata?.chapterHtml;
  if (typeof htmlCandidate !== "string") return "";
  return htmlToPlainText(htmlCandidate).slice(0, 300);
}

async function readFromDraft(authorLower: string, novelId: string): Promise<string> {
  const raw = await fs.readFile(draftPath(authorLower, novelId), "utf8");
  const draft = parseLeadingJsonValue(raw) as { html?: unknown };
  const html = typeof draft.html === "string" ? draft.html : "";
  return htmlToPlainText(html).slice(0, 300);
}

export async function POST(req: NextRequest) {
  const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(headerAddr)) {
    return unauthorized("缺少或无效的 x-wallet-address");
  }
  const walletLower = safeAuthorId(headerAddr);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const o = body as Record<string, unknown>;
  const authorId = typeof o.authorId === "string" ? o.authorId : "";
  const novelId = typeof o.novelId === "string" ? o.novelId.trim() : "";
  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorId) !== walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }
  if (!novelId) return badRequest("Missing novelId");

  let snippet = "";
  try {
    snippet = await readFromStructure(walletLower, novelId);
  } catch {
    // fallback below
  }
  if (!snippet) {
    try {
      snippet = await readFromDraft(walletLower, novelId);
    } catch {
      // keep empty
    }
  }
  return NextResponse.json({ snippet: snippet.slice(0, 300) });
}
