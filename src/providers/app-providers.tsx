"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import { BillingUserSync } from "@/components/billing-user-sync";
import { WalletAuthSync } from "@/components/wallet-auth-sync";
import { wagmiConfig } from "@/lib/wagmi-config";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000 },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <WalletAuthSync />
        <BillingUserSync />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
