import { Suspense } from "react";

import { ChapterCastFullPage } from "@/components/chapter-cast-full-page";

function ChapterCastFallback() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-neutral-100 text-sm text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
      加载人物信息页…
    </div>
  );
}

export default async function ChapterCastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<ChapterCastFallback />}>
      <ChapterCastFullPage novelId={id} />
    </Suspense>
  );
}
