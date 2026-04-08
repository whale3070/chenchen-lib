/**
 * Fast heuristic for common answers to “what is your native language?”.
 * Returns a normalized BCP-47 tag, or null (caller may fall back to API detect).
 */
export function inferSiteLocaleFromUserText(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const lower = s.toLowerCase();

  if (/(英语|英文)/.test(s)) return "en";
  if (/^en$/i.test(s)) return "en";
  if (/\benglish\b/.test(lower)) return "en";

  if (/[\u4e00-\u9fff]/.test(s)) return "zh-CN";
  if (/(中文|汉语|简体|繁体|国语|普通话|中国)/.test(s)) return "zh-CN";
  if (/\bchinese\b|\bmandarin\b/.test(lower)) return "zh-CN";

  if (/(日语|日本語)/.test(s) || /\bjapanese\b|\bjapan\b/.test(lower) || /^ja$/i.test(s))
    return "ja";
  if (/(韩语|한국어)/.test(s) || /\bkorean\b/.test(lower) || /^ko$/i.test(s)) return "ko";
  if (
    /español|espanol|西班牙语/i.test(s) ||
    /\bspanish\b/.test(lower) ||
    /^es$/i.test(s)
  )
    return "es";
  if (
    /\bfrench\b|français|francais|法语/i.test(s) ||
    /\bfrench\b/.test(lower) ||
    /^fr$/i.test(s)
  )
    return "fr";
  if (/\bgerman\b|deutsch|德语/.test(lower + s) || /^de$/i.test(s)) return "de";
  if (/\bportuguese\b|português|葡萄牙语/.test(lower + s) || /^pt$/i.test(s)) return "pt";
  if (/\bitalian\b|italiano|意大利语/.test(lower + s) || /^it$/i.test(s)) return "it";
  if (/\brussian\b|русск|俄语/.test(lower + s) || /^ru$/i.test(s)) return "ru";
  if (/\barabic\b|العربية|阿拉伯语/.test(lower + s) || /^ar$/i.test(s)) return "ar";
  if (/\bhindi\b|हिन्दी|印地语/.test(lower + s) || /^hi$/i.test(s)) return "hi";
  if (/\bvietnamese\b|tiếng việt|越南语/.test(lower + s) || /^vi$/i.test(s)) return "vi";
  if (/\bthai\b|ไทย|泰语/.test(lower + s) || /^th$/i.test(s)) return "th";
  if (/\bindonesian\b|bahasa|印尼语/.test(lower + s) || /^id$/i.test(s)) return "id";
  if (/\bturkish\b|türkçe|土耳其语/.test(lower + s) || /^tr$/i.test(s)) return "tr";
  if (/\bpolish\b|polski|波兰语/.test(lower + s) || /^pl$/i.test(s)) return "pl";
  if (/\bdutch\b|nederlands|荷兰语/i.test(s) || /\bdutch\b/.test(lower) || /^nl$/i.test(s))
    return "nl";

  return null;
}
