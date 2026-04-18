"use client";

import { useState } from "react";

import { useSiteLocale } from "@/providers/site-locale-provider";
import { useAuthStore } from "@/store/auth-store";

type WorkspaceEmailAuthProps = {
  /** 嵌入 Tab 面板时使用，与右侧钱包卡片视觉对齐 */
  variant?: "default" | "embedded";
};

export function WorkspaceEmailAuth({
  variant = "default",
}: WorkspaceEmailAuthProps) {
  const { t } = useSiteLocale();
  const setAuthorId = useAuthStore((s) => s.setAuthorId);
  const setSessionEmail = useAuthStore((s) => s.setSessionEmail);
  const setSessionResolved = useAuthStore((s) => s.setSessionResolved);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const path =
        mode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        authorId?: string;
        email?: string;
        error?: string;
      };
      if (!res.ok) {
        setErr(data.error ?? t("workspace.emailAuthError"));
        return;
      }
      if (data.authorId) {
        setAuthorId(data.authorId);
        setSessionEmail(data.email ?? null);
        setSessionResolved(true);
      } else {
        setErr(t("workspace.emailAuthMissingAuthorId"));
      }
    } catch {
      setErr(t("workspace.emailAuthNetworkError"));
    } finally {
      setBusy(false);
    }
  }

  const shell =
    variant === "embedded"
      ? "w-full rounded-xl border border-neutral-200 bg-white/80 p-5 text-left shadow-sm dark:border-neutral-700 dark:bg-neutral-900/80"
      : "w-full max-w-sm rounded-xl border border-neutral-200 bg-white/80 p-4 text-left shadow-sm dark:border-neutral-700 dark:bg-neutral-900/80";

  return (
    <div className={shell}>
      <p className="mb-3 text-xs font-medium text-neutral-500 dark:text-neutral-400">
        {t("workspace.emailAuthBlurb")}
      </p>
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setErr(null);
          }}
          className={
            mode === "login"
              ? "flex-1 rounded-lg bg-neutral-900 px-2 py-1.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-600"
          }
        >
          {t("workspace.emailLogin")}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setErr(null);
          }}
          className={
            mode === "register"
              ? "flex-1 rounded-lg bg-neutral-900 px-2 py-1.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-600"
          }
        >
          {t("workspace.emailRegister")}
        </button>
      </div>
      <label className="mb-2 block">
        <span className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">
          {t("workspace.emailLabel")}
        </span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
        />
      </label>
      <label className="mb-3 block">
        <span className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">
          {t("workspace.passwordLabel")}
        </span>
        <input
          type="password"
          autoComplete={
            mode === "register" ? "new-password" : "current-password"
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
        />
      </label>
      {err ? (
        <p className="mb-2 text-xs text-red-600 dark:text-red-400">{err}</p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="w-full rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-50 dark:bg-cyan-800 dark:hover:bg-cyan-700"
      >
        {busy
          ? t("workspace.emailAuthBusy")
          : mode === "register"
            ? t("workspace.emailRegisterSubmit")
            : t("workspace.emailLoginSubmit")}
      </button>
    </div>
  );
}
