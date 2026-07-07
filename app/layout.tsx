import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "맛나리오 | 기억 속 맛 복원 앱",
  description: "AI와 레시피 DB로 추억의 맛을 복원하는 귀여운 앱 서비스",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "맛나리오",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ff8fab"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
