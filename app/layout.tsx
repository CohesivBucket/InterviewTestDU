import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TaskFlow AI",
  description: "AI-powered task management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ height: "100%", margin: 0 }}>{children}</body>
    </html>
  );
}