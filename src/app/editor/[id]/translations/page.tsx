import { Suspense } from "react";

import { NovelTranslationManagePage } from "@/components/novel-translation-manage-page";

function TranslationsFallback() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-neutral-100 text-sm text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
      加载翻译管理…
    </div>
  );
}

export default async function EditorTranslationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<TranslationsFallback />}>
      <NovelTranslationManagePage novelId={id} />
    </Suspense>
  );
}
