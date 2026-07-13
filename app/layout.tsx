import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "代码分析助手 - Code Assistant",
  description: "基于 DeepSeek + LangChain.js 的智能代码分析助手",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
