import type { Metadata } from "next";
import "./globals.css";

const siteUrl =
  process.env.CF_PAGES_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://emoli-ar-movie.pages.dev";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
    images: [{ url: "/og.png", width: 1733, height: 909 }],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EMOLI AR MOMENT",
    description: "その一枚が、動き出す。スマートフォンで楽しむWebAR体験。",
    images: ["/og.png"],
  },
};

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
