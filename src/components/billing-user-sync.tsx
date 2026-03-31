"use client";

import { useEffect } from "react";

import { setBillingUserOverride } from "@/api/ai";
import { useAuthStore } from "@/store/auth-store";

/** 将已连接钱包地址作为 AI 服务计费头 X-User-Id（无钱包时回落 env / local-dev）。 */
export function BillingUserSync() {
  const authorId = useAuthStore((s) => s.authorId);

  useEffect(() => {
    setBillingUserOverride(authorId);
    return () => setBillingUserOverride(null);
  }, [authorId]);

  return null;
}
