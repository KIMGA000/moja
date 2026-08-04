import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CAMPUS AX-TON 스타터",
  description: "멋쟁이사자처럼 CAMPUS AX-TON 실습용 스타터 템플릿",
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
