import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const serif = Newsreader({ variable: "--font-serif", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "Tradr Media",
  description: "Tradr's marketing: Instagram posts, news posts and tweets",
  appleWebApp: { capable: true, title: "Tradr Media", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Always light, whatever the device setting.
  colorScheme: "light",
  themeColor: "#f4f4f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        {/* The desktop sidebar's open/closed choice, applied before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("media:sidebar")==="closed")document.documentElement.dataset.sidebar="closed"}catch(e){}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
