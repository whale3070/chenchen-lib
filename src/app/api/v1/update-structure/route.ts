import { isAddress } from "viem";
import fs from "node:fs/promises";
import path from "node:path";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import { NextResponse, type NextRequest } from "next/server";

import type { PlotNode } from "@chenchen/shared/types";

export const runtime = "nodejs";

const DEFAULT_DOC_ID = "default";

/** 与 ai/chapterize 的 MAX_CHAPTERS（2000）+ 卷/顶层节点对齐，避免工作台「上传小说素材」保存失败 */
const MAX_STRUCTURE_NODES = 2500;

type StructurePayload = {
  authorId: string;
  docId: string;
  nodes: PlotNode[];
  updatedAt: string;
};

const STRUCTURE_METADATA_BLOCKLIST = new Set([
  "chapterMarkdown",
  "chapterHtml",
  "chapterHtmlDesktop",
  "chapterHtmlMobile",
  "chapterMarkdownEditorDraft",
  "chapterBodySource",
]);

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

function parseNodesArray(raw: unknown): PlotNode[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PlotNode[] = [];
  for (const item of raw) {
    const parsed = parseNode(item);
    if (!parsed) return null;
    out.push(sanitizeStructureNode(parsed));
  }
  return out;
}

function parseNode(raw: unknown): PlotNode | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.id !== "string" || raw.id.length === 0) return null;
  if (typeof raw.kind !== "string") return null;
  if (typeof raw.title !== "string") return null;
  return raw as unknown as PlotNode;
}

function sanitizeStructureNode(node: PlotNode): PlotNode {
  if (!node.metadata || typeof node.metadata !== "object") return node;
  const metadata = { ...(node.metadata as Record<string, unknown>) };
  for (const key of STRUCTURE_METADATA_BLOCKLIST) {
    delete metadata[key];
  }
  if (Object.keys(metadata).length === 0) {
    const { metadata: _ignored, ...rest } = node;
    return rest as PlotNode;
  }
  return { ...node, metadata };
}

function sanitizeStructureNodes(nodes: PlotNode[]): PlotNode[] {
  return nodes.map(sanitizeStructureNode);
}

async function readStructureNodes(authorId: string, docId: string): Promise<PlotNode[] | null> {
  const fp = await structurePath(authorId, docId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = parseLeadingJsonValue(raw) as StructurePayload;
    return Array.isArray(data?.nodes) ? sanitizeStructureNodes(data.nodes) : null;
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
    const data = parseLeadingJsonValue(raw) as StructurePayload;
    if (!data || !Array.isArray(data.nodes)) {
      return NextResponse.json({ nodes: null, updatedAt: null });
    }
    return NextResponse.json({
      nodes: sanitizeStructureNodes(data.nodes),
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

  let nextNodes: PlotNode[];

  if (Array.isArray(o.nodes)) {
    if (o.nodes.length > MAX_STRUCTURE_NODES) {
      return badRequest(
        `节点数量超过上限（最多 ${MAX_STRUCTURE_NODES} 个，当前 ${o.nodes.length} 个）`,
      );
    }
    const nodes = parseNodesArray(o.nodes);
    if (!nodes) {
      return badRequest("nodes 无效：每项需含 id、kind、title");
    }
    nextNodes = nodes;
  } else {
    const chapterId = typeof o.chapterId === "string" ? o.chapterId.trim() : "";
    const chapterNodeRaw = parseNode(o.chapterNode);
    const chapterNode = chapterNodeRaw ? sanitizeStructureNode(chapterNodeRaw) : null;
    if (!chapterId || !chapterNode || chapterNode.kind !== "chapter") {
      return badRequest(
        "请传入 nodes 数组（整本保存），或提供有效的 chapterId + chapterNode（单章补丁）",
      );
    }
    if (chapterNode.id !== chapterId) {
      return badRequest("chapterId and chapterNode.id mismatch");
    }
    const currentNodes = (await readStructureNodes(authorId, docId)) ?? [];
    const found = currentNodes.some((n) => n.id === chapterId);
    nextNodes = found
      ? currentNodes.map((n) => (n.id === chapterId ? chapterNode : n))
      : [...currentNodes, chapterNode];
    if (nextNodes.length > MAX_STRUCTURE_NODES) {
      return badRequest(
        `节点数量超过上限（最多 ${MAX_STRUCTURE_NODES} 个，当前 ${nextNodes.length} 个）`,
      );
    }
  }

  const payload: StructurePayload = {
    authorId: authorId.toLowerCase(),
    docId,
    nodes: sanitizeStructureNodes(nextNodes),
    updatedAt: new Date().toISOString(),
  };

  const fp = await structurePath(authorId, docId);
  await fs.writeFile(fp, JSON.stringify(payload, null, 2), "utf8");

  return NextResponse.json({ ok: true, updatedAt: payload.updatedAt });
}
