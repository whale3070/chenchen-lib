import { isAddress } from "viem";
import fs from "node:fs/promises";
import path from "node:path";

import { getDraftFilePath } from "@/lib/draft-path";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const DEFAULT_DOC_ID = "default";

type DraftPayload = {
  authorId: string;
  docId: string;
  html: string;
  json: unknown;
  selection: { from: number; to: number };
  updatedAt: string;
  /** ProseMirror Selection.toJSON() */
  selectionJson?: unknown;
  lastActionTimestamp?: number;
  viewportScroll?: number;
  writingSnippet?: string;
};

async function draftPath(authorId: string, docId: string) {
  const fp = getDraftFilePath(process.cwd(), authorId, docId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  return fp;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  if (!body || typeof body !== "object") {
    return badRequest("Expected object body");
  }

  const b = body as Record<string, unknown>;
  const authorId = typeof b.authorId === "string" ? b.authorId : "";
  if (!isAddress(authorId)) {
    return badRequest("Invalid authorId (Ethereum address)");
  }

  const docId =
    typeof b.docId === "string" && b.docId.length > 0 ? b.docId : DEFAULT_DOC_ID;
  const html = typeof b.html === "string" ? b.html : "";
  const json = b.json;
  const sel = b.selection;
  let selection = { from: 0, to: 0 };
  if (sel && typeof sel === "object" && "from" in sel) {
    const o = sel as Record<string, unknown>;
    const from = Number(o.from);
    const to = Number(o.to ?? o.from);
    if (Number.isFinite(from) && Number.isFinite(to)) {
      selection = { from, to };
    }
  }

  const selectionJson = b.selectionJson;
  const lastActionRaw = b.lastActionTimestamp;
  const lastActionTimestamp =
    typeof lastActionRaw === "number" && Number.isFinite(lastActionRaw)
      ? lastActionRaw
      : Date.now();

  const viewportRaw = b.viewportScroll;
  const viewportScroll =
    typeof viewportRaw === "number" && Number.isFinite(viewportRaw)
      ? viewportRaw
      : 0;

  const writingSnippet =
    typeof b.writingSnippet === "string" ? b.writingSnippet.slice(0, 500) : "";

  const payload: DraftPayload = {
    authorId: authorId.toLowerCase(),
    docId,
    html,
    json,
    selection,
    updatedAt: new Date().toISOString(),
    selectionJson:
      selectionJson !== undefined && selectionJson !== null
        ? selectionJson
        : undefined,
    lastActionTimestamp,
    viewportScroll,
    writingSnippet,
  };

  const fp = await draftPath(payload.authorId, docId);
  await fs.writeFile(fp, JSON.stringify(payload), "utf8");

  return NextResponse.json({ ok: true, updatedAt: payload.updatedAt });
}

export async function GET(req: NextRequest) {
  const authorId = req.nextUrl.searchParams.get("authorId") ?? "";
  if (!isAddress(authorId)) {
    return badRequest("Invalid authorId");
  }

  const docId =
    req.nextUrl.searchParams.get("docId")?.trim() || DEFAULT_DOC_ID;

  const fp = await draftPath(authorId, docId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as DraftPayload;
    return NextResponse.json({
      html: data.html ?? null,
      json: data.json ?? null,
      selection: data.selection ?? null,
      updatedAt: data.updatedAt ?? null,
      selectionJson: data.selectionJson ?? null,
      lastActionTimestamp: data.lastActionTimestamp ?? null,
      viewportScroll: data.viewportScroll ?? null,
      writingSnippet: data.writingSnippet ?? null,
    });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      return NextResponse.json({
        html: null,
        json: null,
        selection: null,
        updatedAt: null,
        selectionJson: null,
        lastActionTimestamp: null,
        viewportScroll: null,
        writingSnippet: null,
      });
    }
    throw e;
  }
}
