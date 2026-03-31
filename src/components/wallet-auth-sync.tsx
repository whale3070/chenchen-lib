"use client";

import { useEffect } from "react";
import { useConnection } from "wagmi";

import { useAuthStore } from "@/store/auth-store";

/** 将 wagmi 连接状态同步到 Zustand（authorId = 钱包地址）。 */
export function WalletAuthSync() {
  const { address, isConnected } = useConnection();
  const setAuthorId = useAuthStore((s) => s.setAuthorId);

  useEffect(() => {
    setAuthorId(isConnected && address ? address : null);
  }, [isConnected, address, setAuthorId]);

  return null;
}
