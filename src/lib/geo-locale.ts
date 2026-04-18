/**
 * Map ISO 3166-1 alpha-2 country (uppercase) to UI locale for geo-based defaults.
 * CN → 简体；HK / TW / MO → 繁体（zh-TW，走机翻 UI + 进度条暂用简体时间线副本）。
 */
export function countryCodeToUiLocale(countryCode: string): string | null {
  const c = countryCode.trim().toUpperCase();
  if (!c || c.length !== 2 || c === "XX") return null;
  if (c === "CN") return "zh-CN";
  if (c === "HK" || c === "TW" || c === "MO") return "zh-TW";
  return null;
}
