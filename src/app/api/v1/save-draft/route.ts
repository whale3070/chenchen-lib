import { isAddress } from "viem";
import fs from "node:fs/promises";
import path from "node:path";

import { getDraftFilePath } from "@/lib/draft-path";
import { trackWalletEvent } from "@/lib/server/wallet-analytics";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const DEFAULT_DOC_ID = "default";

type DraftPayload = {
  authorId: string;
  docId: string;
  html: string;
  json: unknown;
  chapterId?: string | null;
  chapterHash?: string | null;
  selection: { from: number; to: number };
  updatedAt: string;
  /** ProseMirror Selection.toJSON() */
  selectionJson?: unknown;
  lastActionTimestamp?: number;
  viewportScroll?: number;
  writingSnippet?: string;
};

type SaveDraftMode = "full" | "patch_lite";

async function draftPath(authorId: string, docId: string) {
  const fp = getDraftFilePath(process.cwd(), authorId, docId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  return fp;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function readDraftPayload(fp: string): Promise<DraftPayload | null> {
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as DraftPayload;
    if (!data || typeof data !== "object") return null;
    return data;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return null;
    throw e;
  }
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
  const mode: SaveDraftMode = b.mode === "patch_lite" ? "patch_lite" : "full";
  const authorId = typeof b.authorId === "string" ? b.authorId : "";
  if (!isAddress(authorId)) {
    return badRequest("Invalid authorId (Ethereum address)");
  }

  const docId =
    typeof b.docId === "string" && b.docId.length > 0 ? b.docId : DEFAULT_DOC_ID;
  const hasHtml = typeof b.html === "string";
  const hasJson = Object.prototype.hasOwnProperty.call(b, "json");
  const chapterIdRaw = typeof b.chapterId === "string" ? b.chapterId.trim() : "";
  const chapterId = chapterIdRaw.length > 0 ? chapterIdRaw : null;
  const chapterHashRaw = typeof b.chapterHash === "string" ? b.chapterHash.trim() : "";
  const chapterHash = chapterHashRaw.length > 0 ? chapterHashRaw : null;
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

  const fp = await draftPath(authorId.toLowerCase(), docId);
  const previous = mode === "patch_lite" ? await readDraftPayload(fp) : null;

  const payload: DraftPayload = {
    authorId: authorId.toLowerCase(),
    docId,
    html: hasHtml ? (b.html as string) : (previous?.html ?? ""),
    json: hasJson ? b.json : (previous?.json ?? null),
    chapterId,
    chapterHash,
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

  await fs.writeFile(fp, JSON.stringify(payload), "utf8");
  try {
    await trackWalletEvent({
      wallet: payload.authorId,
      eventType: "save_draft",
      meta: { novelId: docId },
    });
  } catch {
    // analytics should not block core flow
  }

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
      chapterId: data.chapterId ?? null,
      chapterHash: data.chapterHash ?? null,
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
