import { NextResponse, type NextRequest } from "next/server";

import {
  ChapterizeHttpError,
  chapterizeTextInternal,
  parseChapterizeMode,
} from "@/lib/server/chapterize-internal";

export const runtime = "nodejs";

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
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const text =
    typeof (body as { text?: unknown }).text === "string"
      ? (body as { text: string }).text
      : "";
  const mode = parseChapterizeMode((body as { mode?: unknown }).mode);

  try {
    const result = await chapterizeTextInternal(text, mode);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ChapterizeHttpError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "切章失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
