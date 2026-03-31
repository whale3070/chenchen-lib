import type { Metadata } from "next";

import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

/**
 * 不使用 next/font/google（Geist）：生产环境部分反代会对 /__nextjs_font/ 返回 403，
 * 导致样式资源失败并可能影响 Hydration。改用语义清晰的系统/黑体栈（globals.css）。
 */
export const metadata: Metadata = {
  title: "Chenchen-Lib · AI 编辑平台",
  description: "面向小说与剧本作者的 AI 编辑器（MiroFish 叙事推演）",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
