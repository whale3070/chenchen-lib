/**
 * True when the user is clearly asking to change the **site UI** language,
 * not e.g. “Arabic fantasy novels”.
 */
export function wantsUiLanguageChange(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  const lower = s.toLowerCase();

  if (
    /(?:网站|網站|网页|界面|介面|页面|頁面)\s*(?:语言|語言)?\s*(?:设为|設為|切成|改成|換成|切换|切換|换为|換為|用|要)/.test(
      s,
    )
  ) {
    return true;
  }

  if (
    /\b(?:switch|change)\s+(?:the\s+)?(?:site|web|web\s*site|ui|interface|app)\s*(?:language|locale)?\s*(?:to)?\b/i.test(
      lower,
    )
  ) {
    return true;
  }

  if (/\b(?:set|use)\s+(?:the\s+)?(?:ui|interface|site)\s+to\b/i.test(lower)) {
    return true;
  }

  if (/\b(?:change|switch)\s+language\s+to\b/i.test(lower)) {
    return true;
  }

  if (/\binterface\s+language\b.*\b(?:to|into)\b/i.test(lower)) {
    return true;
  }

  return false;
}
