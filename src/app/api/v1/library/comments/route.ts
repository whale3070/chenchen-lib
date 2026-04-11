import { isAddress } from "viem";

import { NextResponse, type NextRequest } from "next/server";

import { appendComment, canPostComment, deleteComment, listComments } from "@/lib/server/comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function readId(v: string | null) {
  const id = (v ?? "").trim();
  if (!id) return "";
  return id.slice(0, 120);
}

export async function GET(req: NextRequest) {
  const articleId = readId(req.nextUrl.searchParams.get("articleId"));
  const chapterId = readId(req.nextUrl.searchParams.get("chapterId"));
  if (!articleId || !chapterId) {
    return badRequest("缺少 articleId 或 chapterId");
  }
  const items = await listComments(articleId, chapterId, 100);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const wallet = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(wallet)) {
    return unauthorized("请先连接钱包后再评论");
  }
  const walletLower = wallet.toLowerCase();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const o = body as Record<string, unknown>;

  const articleId = typeof o.articleId === "string" ? readId(o.articleId) : "";
  const chapterId = typeof o.chapterId === "string" ? readId(o.chapterId) : "";
  const content = typeof o.content === "string" ? o.content.trim() : "";
  if (!articleId || !chapterId) return badRequest("缺少 articleId 或 chapterId");
  if (!content) return badRequest("评论内容不能为空");
  if (content.length > 800) return badRequest("评论最多 800 字");
  if (!canPostComment(walletLower, articleId, chapterId)) {
    return badRequest("评论过于频繁，请稍后再试");
  }

  const comment = await appendComment({
    articleId,
    chapterId,
    walletLower,
    content,
  });
  return NextResponse.json({ ok: true, comment });
}

export async function DELETE(req: NextRequest) {
  const wallet = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(wallet)) {
    return unauthorized("请先连接钱包后再操作");
  }
  const walletLower = wallet.toLowerCase();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const o = body as Record<string, unknown>;
  const articleId = typeof o.articleId === "string" ? readId(o.articleId) : "";
  const chapterId = typeof o.chapterId === "string" ? readId(o.chapterId) : "";
  const commentId = typeof o.commentId === "string" ? readId(o.commentId) : "";
  if (!articleId || !chapterId || !commentId) {
    return badRequest("缺少 articleId/chapterId/commentId");
  }
  const result = await deleteComment({
    articleId,
    chapterId,
    commentId,
    walletLower,
  });
  if (!result.ok) {
    if (result.reason === "forbidden") {
      return NextResponse.json({ error: "只能删除自己的评论" }, { status: 403 });
    }
    return NextResponse.json({ error: "评论不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, removedId: result.removed.id });
}
