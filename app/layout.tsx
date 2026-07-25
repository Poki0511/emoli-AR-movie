import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const socialImage = new URL("/og.png", origin).toString();

  return {
    title: "EMOLI AR MOMENT｜その一枚が、動き出す。",
    description:
      "チェキ風カードにスマートフォンをかざすと、写真が動画として動き出すWebAR体験。",
    icons: {
      icon: "/favicon.png",
      shortcut: "/favicon.png",
    },
    openGraph: {
      title: "EMOLI AR MOMENT",
      description: "その一枚が、動き出す。スマートフォンで楽しむWebAR体験。",
      images: [{ url: socialImage, width: 1733, height: 909 }],
      locale: "ja_JP",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "EMOLI AR MOMENT",
      description: "その一枚が、動き出す。スマートフォンで楽しむWebAR体験。",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
