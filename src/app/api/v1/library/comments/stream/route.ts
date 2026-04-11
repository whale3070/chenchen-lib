import { type NextRequest } from "next/server";

import { subscribeComments } from "@/lib/server/comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readId(v: string | null) {
  const id = (v ?? "").trim();
  if (!id) return "";
  return id.slice(0, 120);
}

export async function GET(req: NextRequest) {
  const articleId = readId(req.nextUrl.searchParams.get("articleId"));
  const chapterId = readId(req.nextUrl.searchParams.get("chapterId"));
  if (!articleId || !chapterId) {
    return new Response("missing articleId/chapterId", { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (payload: unknown) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      send({ type: "ready" });

      const unsubscribe = subscribeComments(articleId, chapterId, (comment) => {
        send({ type: "comment", comment });
      });

      const timer = setInterval(() => {
        send({ type: "ping", now: Date.now() });
      }, 15_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(timer);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
