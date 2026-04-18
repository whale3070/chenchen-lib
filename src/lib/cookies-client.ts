/** Read a non-HttpOnly cookie on the client (middleware 写入的 geo locale 等). */
export function readCookieClient(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = `; ${document.cookie}`.split(`; ${name}=`);
  if (parts.length !== 2) return null;
  const v = parts.pop()?.split(";").shift();
  return v != null && v.length > 0 ? decodeURIComponent(v) : null;
}
