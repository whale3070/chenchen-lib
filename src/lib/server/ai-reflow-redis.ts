import IORedis from "ioredis";

/** BullMQ 要求 Redis 客户端不把请求失败无限重试（需 null） */
export function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379";
  return new IORedis(url, {
    maxRetriesPerRequest: null,
  });
}
