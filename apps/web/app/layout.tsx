import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "모자(MOJA) - 자립준비청년 자격 판별",
  description: "몰라도 괜찮아, 모자가 챙겨줄게 — 12개 질문으로 21개 제도의 자격을 판별하고 못 받는 이유까지 알려드려요",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
