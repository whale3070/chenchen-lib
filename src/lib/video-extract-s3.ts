/**
 * 视频提取：S3 兼容对象存储（AWS S3 / Cloudflare R2 等）预签名上传 + 服务端拉取转码。
 *
 * 环境变量（均仅服务端读取）：
 * - VIDEO_EXTRACT_S3_BUCKET（必填以启用）
 * - VIDEO_EXTRACT_S3_ACCESS_KEY_ID / VIDEO_EXTRACT_S3_SECRET_ACCESS_KEY
 *   （未设时可回退到 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY）
 * - VIDEO_EXTRACT_S3_REGION（默认 auto，R2 常用）
 * - VIDEO_EXTRACT_S3_ENDPOINT（R2 等自定义端点，例如 https://<account>.r2.cloudflarestorage.com）
 * - VIDEO_EXTRACT_S3_PUT_TTL_SEC（预签名 PUT 有效期秒数，默认 3600，范围 60–86400）
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

export type VideoExtractS3StagingMeta = {
  authorLower: string;
  uploadId: string;
  key: string;
  fileName: string;
  displaySourceName: string;
  ext: string;
  mime: string;
  totalSize: number;
  createdAt: string;
};

function resolveS3VideoCredentials(): { accessKeyId?: string; secretAccessKey?: string } {
  const accessKeyId =
    process.env.VIDEO_EXTRACT_S3_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey =
    process.env.VIDEO_EXTRACT_S3_SECRET_ACCESS_KEY?.trim() ||
    process.env.AWS_SECRET_ACCESS_KEY?.trim();
  return { accessKeyId, secretAccessKey };
}

export function isVideoExtractS3Configured(): boolean {
  const bucket = process.env.VIDEO_EXTRACT_S3_BUCKET?.trim();
  const { accessKeyId, secretAccessKey } = resolveS3VideoCredentials();
  return Boolean(bucket && accessKeyId && secretAccessKey);
}

export function videoExtractS3Bucket(): string {
  const b = process.env.VIDEO_EXTRACT_S3_BUCKET?.trim();
  if (!b) throw new Error("VIDEO_EXTRACT_S3_BUCKET 未配置");
  return b;
}

export function createVideoExtractS3Client(): S3Client {
  const region =
    process.env.VIDEO_EXTRACT_S3_REGION?.trim() || process.env.AWS_REGION?.trim() || "auto";
  const endpoint = process.env.VIDEO_EXTRACT_S3_ENDPOINT?.trim();
  const { accessKeyId, secretAccessKey } = resolveS3VideoCredentials();
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("S3 凭证未配置（VIDEO_EXTRACT_S3_ACCESS_KEY_ID / SECRET 或 AWS_*）");
  }
  return new S3Client({
    region,
    endpoint: endpoint || undefined,
    credentials: { accessKeyId, secretAccessKey },
    /** R2 / MinIO 等自定义端点通常需要 path-style */
    forcePathStyle: Boolean(endpoint),
  });
}

export function videoExtractS3PutExpiresSec(): number {
  const n = Number(process.env.VIDEO_EXTRACT_S3_PUT_TTL_SEC);
  if (Number.isFinite(n) && n >= 60 && n <= 86400) return Math.floor(n);
  return 3600;
}

export async function presignVideoExtractPut(args: {
  key: string;
  contentType: string;
  contentLength: number;
}): Promise<string> {
  const client = createVideoExtractS3Client();
  const bucket = videoExtractS3Bucket();
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: args.key,
    ContentType: args.contentType,
    ContentLength: args.contentLength,
  });
  return getSignedUrl(client, cmd, { expiresIn: videoExtractS3PutExpiresSec() });
}

export async function headVideoExtractObject(
  key: string,
): Promise<{ contentLength: number; contentType?: string }> {
  const client = createVideoExtractS3Client();
  const bucket = videoExtractS3Bucket();
  const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const len = Number(out.ContentLength ?? 0);
  return { contentLength: len, contentType: out.ContentType };
}

export async function downloadVideoExtractObjectToFile(key: string, destAbs: string): Promise<void> {
  const client = createVideoExtractS3Client();
  const bucket = videoExtractS3Bucket();
  const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!out.Body) throw new Error("GetObject 返回无正文");
  await pipeline(out.Body as Readable, createWriteStream(destAbs));
}

export async function deleteVideoExtractObject(key: string): Promise<void> {
  const client = createVideoExtractS3Client();
  const bucket = videoExtractS3Bucket();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function videoExtractS3MetaPath(authorLower: string, uploadId: string): string {
  return path.join(process.cwd(), ".data", "video-s3-staging-meta", authorLower, `${uploadId}.json`);
}
