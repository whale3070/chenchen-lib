/**
 * Parse the first complete JSON object/array from text that may contain trailing
 * garbage (duplicate writes, merge markers, log lines). Root must be `{` or `[`
 * for recovery; otherwise delegates to JSON.parse on trimmed input.
 */
export function parseLeadingJsonValue(text: string): unknown {
  const s = text.replace(/^\uFEFF/, "").trim();
  if (!s) throw new SyntaxError("empty JSON");
  const first = s[0];
  if (first !== "{" && first !== "[") {
    return JSON.parse(s);
  }

  const stack: ("}" | "]")[] = [];
  let inString = false;
  let esc = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inString) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") {
      stack.push("}");
      continue;
    }
    if (c === "[") {
      stack.push("]");
      continue;
    }
    if (c === "}" || c === "]") {
      const want = stack.pop();
      if (want !== c) {
        throw new SyntaxError(`Unexpected '${c}' while parsing JSON`);
      }
      if (stack.length === 0) {
        return JSON.parse(s.slice(0, i + 1));
      }
    }
  }
  throw new SyntaxError("Unterminated JSON");
}
