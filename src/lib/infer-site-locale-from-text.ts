/**
 * Fast heuristic for answers to “what is your native language?” or short UI-locale replies.
 * Does **not** treat “Arabic novels” as UI locale `ar` (no bare \benglish\b / \barabic\b alone).
 */
export function inferSiteLocaleFromUserText(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const lower = s.toLowerCase();

  // --- English (before any Chinese-script heuristics) ---
  if (
    /\b(mother|native)\s+tongue\s+is\s+english\b/i.test(s) ||
    /\b(native|mother)\s+language\s+is\s+english\b/i.test(s) ||
    /\bmy\s+(native|first)\s+language\s+is\s+english\b/i.test(lower)
  ) {
    return "en";
  }
  if (/母语\s*是\s*英|母语\s*是\s*英文|我说英语|我的母语是英/i.test(s)) {
    return "en";
  }
  if (/(英语|英文)/.test(s)) return "en";
  if (/^en$/i.test(s.trim())) return "en";
  if (/\benglish\b/.test(lower)) {
    if (/(小说|小說|故事|书|書|novel|story|book|read|fantasy|romance|genre)/i.test(s)) {
      return null;
    }
    return "en";
  }

  // --- Traditional Chinese (before generic “中文” → simplified) ---
  if (
    /繁体中文|繁體中文|繁体|繁體|繁中|正體中文|正体中文/i.test(s) ||
    /\bzh-tw\b|\bzh-hk\b|\bzh-hant\b/i.test(lower) ||
    /(?:台|臺)灣(?:華語|中文)?|香港(?:繁)?|澳門繁|澳门繁/i.test(s)
  ) {
    const prefersSimplified =
      /简体|簡體|大陆简体|内地简体/.test(s) && !/繁/.test(s);
    if (!prefersSimplified) return "zh-TW";
  }

  // --- Arabic ---
  if (
    /阿拉伯语|阿拉伯文|阿语|العربية/.test(s) ||
    /\b(native|mother)\s+(language|tongue)\s+is\s+arabic\b/i.test(lower) ||
    /^ar$/i.test(s.trim())
  ) {
    return "ar";
  }

  // --- Simplified Chinese explicit ---
  if (/简体|簡體|大陆|內地|内地/.test(s) && !/繁/.test(s)) return "zh-CN";

  // --- Generic Chinese wording (keywords, not “any Han char”) ---
  if (
    /(中文|汉语|華語|华语|国语|國語|普通话|普通話)/.test(s) ||
    /\bchinese\b|\bmandarin\b|\bputonghua\b/i.test(lower)
  ) {
    return "zh-CN";
  }

  // --- Other languages (keep list; avoid matching inside long English prose) ---
  if (/(日语|日本語)/.test(s) || /\bjapanese\b|\bjapan\b/.test(lower) || /^ja$/i.test(s.trim()))
    return "ja";
  if (/(韩语|한국어)/.test(s) || /\bkorean\b/.test(lower) || /^ko$/i.test(s.trim())) return "ko";
  if (
    /español|espanol|西班牙语/i.test(s) ||
    /\bspanish\b/.test(lower) ||
    /^es$/i.test(s.trim())
  )
    return "es";
  if (
    /\bfrench\b|français|francais|法语/i.test(s) ||
    /\bfrench\b/.test(lower) ||
    /^fr$/i.test(s.trim())
  )
    return "fr";
  if (/\bgerman\b|deutsch|德语/.test(lower + s) || /^de$/i.test(s.trim())) return "de";
  if (/\bportuguese\b|português|葡萄牙语/.test(lower + s) || /^pt$/i.test(s.trim())) return "pt";
  if (/\bitalian\b|italiano|意大利语/.test(lower + s) || /^it$/i.test(s.trim())) return "it";
  if (/\brussian\b|русск|俄语/.test(lower + s) || /^ru$/i.test(s.trim())) return "ru";
  if (/\bhindi\b|हिन्दी|印地语/.test(lower + s) || /^hi$/i.test(s.trim())) return "hi";
  if (/\bvietnamese\b|tiếng việt|越南语/.test(lower + s) || /^vi$/i.test(s.trim())) return "vi";
  if (/\bthai\b|ไทย|泰语/.test(lower + s) || /^th$/i.test(s.trim())) return "th";
  if (/\bindonesian\b|bahasa|印尼语/.test(lower + s) || /^id$/i.test(s.trim())) return "id";
  if (/\bturkish\b|türkçe|土耳其语/.test(lower + s) || /^tr$/i.test(s.trim())) return "tr";
  if (/\bpolish\b|polski|波兰语/.test(lower + s) || /^pl$/i.test(s.trim())) return "pl";
  if (/\bdutch\b|nederlands|荷兰语/i.test(s) || /\bdutch\b/.test(lower) || /^nl$/i.test(s.trim()))
    return "nl";

  // --- Very short Han-only reply (e.g. “中文”) ---
  if (
    s.length <= 24 &&
    /^[\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+$/u.test(s) &&
    !/[a-zA-Z]{3,}/.test(s)
  ) {
    return "zh-CN";
  }

  return null;
}
