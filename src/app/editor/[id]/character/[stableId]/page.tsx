import { Suspense } from "react";

import { CharacterArcPage } from "@/components/character-arc-page";

function Fallback() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-neutral-100 text-sm text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
      加载人物档案…
    </div>
  );
}

export default async function EditorCharacterArcPage({
  params,
}: {
  params: Promise<{ id: string; stableId: string }>;
}) {
  const { id, stableId } = await params;
  return (
    <Suspense fallback={<Fallback />}>
      <CharacterArcPage novelId={id} stableId={stableId} />
    </Suspense>
  );
}
