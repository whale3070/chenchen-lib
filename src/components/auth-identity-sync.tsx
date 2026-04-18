"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";

import { useAuthStore } from "@/store/auth-store";

/**
 * 钱包连接时 authorId = 地址；否则尝试邮箱会话（HttpOnly Cookie + /api/v1/auth/me）。
 * 与 wagmi reconnect 协调：重连过程中不覆盖身份。
 */
export function AuthIdentitySync() {
  const { address, isConnected, status } = useAccount();
  const setAuthorId = useAuthStore((s) => s.setAuthorId);
  const setSessionEmail = useAuthStore((s) => s.setSessionEmail);
  const setSessionResolved = useAuthStore((s) => s.setSessionResolved);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (isConnected && address) {
        setAuthorId(address);
        setSessionEmail(null);
        setSessionResolved(true);
        return;
      }

      const walletWarming =
        status === "reconnecting" || status === "connecting";

      try {
        const r = await fetch("/api/v1/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        const j = (await r.json().catch(() => ({}))) as {
          authorId?: string | null;
          email?: string | null;
        };
        if (cancelled) return;
        if (typeof j.authorId === "string" && j.authorId) {
          setAuthorId(j.authorId);
          setSessionEmail(
            typeof j.email === "string" && j.email ? j.email : null,
          );
        } else if (!walletWarming) {
          setAuthorId(null);
          setSessionEmail(null);
        }
      } catch {
        if (!cancelled && !walletWarming) {
          setAuthorId(null);
          setSessionEmail(null);
        }
      } finally {
        if (!cancelled) setSessionResolved(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [address, isConnected, status, setAuthorId, setSessionEmail, setSessionResolved]);

  return null;
}
