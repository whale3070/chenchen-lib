/**
 * AI 排版后台 worker：与 Next.js `next start` 分离进程，消费 Redis 队列。
 *
 * 启动（在 apps/web 目录）：
 *   REDIS_URL=redis://127.0.0.1:6379 npm run worker:ai-reflow
 */

import { Worker } from "bullmq";

import type { AiReflowJobData } from "../lib/server/ai-reflow-queue";
import { AI_REFLOW_QUEUE_NAME } from "../lib/server/ai-reflow-queue";
import { createRedisConnection } from "../lib/server/ai-reflow-redis";
import { autoFormatChaptersForPublish } from "../lib/server/deepseek-publish-format";
import {
  readPublishRecordFs,
  writePublishRecordFs,
} from "../lib/server/publish-record-fs";

async function processReflow(data: AiReflowJobData) {
  const { authorLower, novelId, chapterIds, expectedGeneration } = data;
  let cur = await readPublishRecordFs(authorLower, novelId);
  if (!cur || (cur.aiReflowGeneration ?? 0) !== expectedGeneration) return;
  if (cur.aiReflowStatus !== "pending") return;

  await writePublishRecordFs({
    ...cur,
    aiReflowStatus: "running",
    aiReflowError: undefined,
  });

  try {
    await autoFormatChaptersForPublish({
      authorLower,
      novelId,
      chapterIds,
    });
    cur = await readPublishRecordFs(authorLower, novelId);
    if (!cur || (cur.aiReflowGeneration ?? 0) !== expectedGeneration) return;
    await writePublishRecordFs({
      ...cur,
      aiReflowStatus: "done",
      aiReflowError: undefined,
      aiReflowFinishedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    cur = await readPublishRecordFs(authorLower, novelId);
    if (!cur || (cur.aiReflowGeneration ?? 0) !== expectedGeneration) return;
    await writePublishRecordFs({
      ...cur,
      aiReflowStatus: "error",
      aiReflowError: msg.slice(0, 500),
      aiReflowFinishedAt: new Date().toISOString(),
    });
  }
}

const connection = createRedisConnection();

const worker = new Worker<AiReflowJobData>(
  AI_REFLOW_QUEUE_NAME,
  async (job) => {
    await processReflow(job.data);
  },
  {
    connection,
    prefix: "chenchen",
    concurrency: 1,
  },
);

worker.on("failed", (job, err) => {
  // eslint-disable-next-line no-console
  console.error(
    "[ai-reflow-worker] job failed",
    job?.id,
    err instanceof Error ? err.message : err,
  );
});

worker.on("completed", (job) => {
  // eslint-disable-next-line no-console
  console.log("[ai-reflow-worker] completed", job.id);
});

function shutdown() {
  void worker
    .close()
    .then(() => connection.quit())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// eslint-disable-next-line no-console
console.log(
  `[ai-reflow-worker] listening queue=${AI_REFLOW_QUEUE_NAME} prefix=chenchen`,
);
