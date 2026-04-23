/** 与 `video/extract` 路由一致：单文件与分片合并后的上限 */
export const VIDEO_EXTRACT_MAX_BYTES = 220 * 1024 * 1024;

/**
 * 单片大小：取 4MiB，在常见 `client_max_body_size 10m` 反代下仍有余量（含 HTTP 头）。
 * 大于该阈值的源文件走分片上传，避免单次 POST 被截断。
 */
export const VIDEO_EXTRACT_CHUNK_BYTES = 4 * 1024 * 1024;
