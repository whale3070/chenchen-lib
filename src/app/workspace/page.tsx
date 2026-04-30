import { Suspense } from "react";

import { AuthorDashboard } from "@/components/author-dashboard";

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-zinc-500 dark:text-zinc-400">
          加载工作台…
        </div>
      }
    >
      <AuthorDashboard />
    </Suspense>
  );
}
