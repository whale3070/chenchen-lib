"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import { AuthIdentitySync } from "@/components/auth-identity-sync";
import { BillingUserSync } from "@/components/billing-user-sync";
import { SiteHtmlLang } from "@/components/site-html-lang";
import { wagmiConfig } from "@/lib/wagmi-config";
import { SiteLocaleProvider } from "@/providers/site-locale-provider";

export function AppProviders({
  children,
  initialLocaleHint,
}: {
  children: ReactNode;
  initialLocaleHint?: string | null;
}) {
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
        <SiteLocaleProvider initialLocaleHint={initialLocaleHint}>
          <SiteHtmlLang />
          <AuthIdentitySync />
          <BillingUserSync />
          {children}
        </SiteLocaleProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
