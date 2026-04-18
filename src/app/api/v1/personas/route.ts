import { isAddress } from "viem";
import fs from "node:fs/promises";
import path from "node:path";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import { NextResponse, type NextRequest } from "next/server";

import type { Persona } from "@chenchen/shared/types";

export const runtime = "nodejs";

type PersonasFile = {
  authorId: string;
  personas: Persona[];
  updatedAt: string;
};

function safeNovelSegment(novelId: string): string {
  const s = novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
  return s || "work";
}

async function personasFilePath(authorId: string, novelId?: string | null) {
  const dir = path.join(process.cwd(), ".data", "personas");
  await fs.mkdir(dir, { recursive: true });
  const aid = authorId.toLowerCase();
  if (novelId && novelId.length > 0) {
    return path.join(dir, `${aid}_${safeNovelSegment(novelId)}.json`);
  }
  return path.join(dir, `${aid}.json`);
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** 宽松校验：避免恶意写入；完整结构由前端 TypeScript 保证。 */
function parsePersonasList(raw: unknown): Persona[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Persona[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const id = item.id;
    const name = item.name;
    const drama = item.drama;
    if (typeof id !== "string" || id.length === 0 || id.length > 128) return null;
    if (typeof name !== "string" || name.length > 256) return null;
    if (!isPlainObject(drama)) return null;
    out.push(item as unknown as Persona);
  }
  if (out.length > 200) return null;
  return out;
}

export async function GET(req: NextRequest) {
  const authorId = req.nextUrl.searchParams.get("authorId") ?? "";
  if (!isAddress(authorId)) {
    return badRequest("Invalid authorId");
  }

  const novelId = req.nextUrl.searchParams.get("novelId")?.trim() || null;
  const fp = await personasFilePath(authorId, novelId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = parseLeadingJsonValue(raw) as PersonasFile;
    if (!data || !Array.isArray(data.personas)) {
      return NextResponse.json({
        personas: null,
        updatedAt: null,
      });
    }
    return NextResponse.json({
      personas: data.personas,
      updatedAt: data.updatedAt ?? null,
    });
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") {
      return NextResponse.json({
        personas: null,
        updatedAt: null,
      });
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

  const personas = parsePersonasList(o.personas);
  if (!personas) {
    return badRequest("Invalid personas array");
  }

  const novelIdRaw = o.novelId;
  const novelId =
    typeof novelIdRaw === "string" && novelIdRaw.length > 0
      ? novelIdRaw
      : null;

  const payload: PersonasFile = {
    authorId: authorId.toLowerCase(),
    personas,
    updatedAt: new Date().toISOString(),
  };

  const fp = await personasFilePath(authorId, novelId);
  await fs.writeFile(fp, JSON.stringify(payload, null, 2), "utf8");

  return NextResponse.json({ ok: true, updatedAt: payload.updatedAt });
}
