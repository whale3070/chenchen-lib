import { isAddress } from "viem";
import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import type { PlotNode } from "@chenchen/shared/types";

export const runtime = "nodejs";

const DEFAULT_DOC_ID = "default";

type StructurePayload = {
  authorId: string;
  docId: string;
  nodes: PlotNode[];
  updatedAt: string;
};

async function structurePath(authorId: string, docId: string) {
  const dir = path.join(process.cwd(), ".data", "structure");
  await fs.mkdir(dir, { recursive: true });
  const safeDoc = docId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(dir, `${authorId.toLowerCase()}_${safeDoc}.json`);
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function parseNodes(raw: unknown): PlotNode[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > 500) return null;
  for (const item of raw) {
    if (!parseNode(item)) return null;
  }
  return raw as PlotNode[];
}

function parseNode(raw: unknown): PlotNode | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.id !== "string" || raw.id.length === 0) return null;
  if (typeof raw.kind !== "string") return null;
  if (typeof raw.title !== "string") return null;
  return raw as unknown as PlotNode;
}

async function readStructureNodes(authorId: string, docId: string): Promise<PlotNode[] | null> {
  const fp = await structurePath(authorId, docId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as StructurePayload;
    return Array.isArray(data?.nodes) ? data.nodes : null;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return null;
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const authorId = req.nextUrl.searchParams.get("authorId") ?? "";
  if (!isAddress(authorId)) {
    return badRequest("Invalid authorId");
  }

  const docId =
    req.nextUrl.searchParams.get("docId")?.trim() || DEFAULT_DOC_ID;

  const fp = await structurePath(authorId, docId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as StructurePayload;
    if (!data || !Array.isArray(data.nodes)) {
      return NextResponse.json({ nodes: null, updatedAt: null });
    }
    return NextResponse.json({
      nodes: data.nodes,
      updatedAt: data.updatedAt ?? null,
    });
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") {
      return NextResponse.json({ nodes: null, updatedAt: null });
    }
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

  const o = body as Record<string, unknown>;
  const authorId = typeof o.authorId === "string" ? o.authorId : "";
  if (!isAddress(authorId)) {
    return badRequest("Invalid authorId");
  }

  const docId =
    typeof o.docId === "string" && o.docId.length > 0 ? o.docId : DEFAULT_DOC_ID;

  const nodes = parseNodes(o.nodes);
  let nextNodes: PlotNode[] | null = null;

  if (nodes) {
    nextNodes = nodes;
  } else {
    const chapterId = typeof o.chapterId === "string" ? o.chapterId.trim() : "";
    const chapterNode = parseNode(o.chapterNode);
    if (!chapterId || !chapterNode || chapterNode.kind !== "chapter") {
      return badRequest("Invalid nodes array");
    }
    if (chapterNode.id !== chapterId) {
      return badRequest("chapterId and chapterNode.id mismatch");
    }
    const currentNodes = (await readStructureNodes(authorId, docId)) ?? [];
    const found = currentNodes.some((n) => n.id === chapterId);
    nextNodes = found
      ? currentNodes.map((n) => (n.id === chapterId ? chapterNode : n))
      : [...currentNodes, chapterNode];
  }

  const payload: StructurePayload = {
    authorId: authorId.toLowerCase(),
    docId,
    nodes: nextNodes,
    updatedAt: new Date().toISOString(),
  };

  const fp = await structurePath(authorId, docId);
  await fs.writeFile(fp, JSON.stringify(payload, null, 2), "utf8");

  return NextResponse.json({ ok: true, updatedAt: payload.updatedAt });
}
