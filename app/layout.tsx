import "./globals.css";

export const metadata = {
  title: "EMOLI AR",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
  },
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    noimageindex: true,
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
