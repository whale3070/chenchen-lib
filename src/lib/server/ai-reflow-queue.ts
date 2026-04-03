import { Queue } from "bullmq";

import { createRedisConnection } from "@/lib/server/ai-reflow-redis";

export const AI_REFLOW_QUEUE_NAME =
  process.env.AI_REFLOW_QUEUE_NAME?.trim() || "aiReflow";

export type AiReflowJobData = {
  authorLower: string;
  novelId: string;
  chapterIds: string[];
  expectedGeneration: number;
};

let queueSingleton: Queue<AiReflowJobData> | null = null;

function getQueue(): Queue<AiReflowJobData> {
  if (!queueSingleton) {
    queueSingleton = new Queue<AiReflowJobData>(AI_REFLOW_QUEUE_NAME, {
      connection: createRedisConnection(),
      prefix: "chenchen",
    });
  }
  return queueSingleton;
}

/**
 * 将 AI 排版任务投入 Redis 队列（由独立 worker 消费）。
 * jobId 含 generation，避免同一波任务重复入队。
 */
export async function enqueueAiReflowJob(data: AiReflowJobData) {
  const { authorLower, novelId, expectedGeneration } = data;
  const jobId = `${authorLower}:${safeJobIdPart(novelId)}:g${expectedGeneration}`;
  const queue = getQueue();
  await queue.add("format", data, {
    jobId,
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
    attempts: 1,
  });
}

function safeJobIdPart(novelId: string) {
  return novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}
