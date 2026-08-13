import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { RegisterSW } from "./RegisterSW";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Smart Steps ABA Tracker",
  description: "2026 ABA data collection — data doesn't sleep.",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#f8fafc",
};

// Applies the persisted theme before first paint (light unless Settings says
// otherwise). Version < 1 stores predate the light default and are ignored,
// matching the store's migrate().
const themeInitScript = `try{var s=JSON.parse(localStorage.getItem("smart-steps-theme"));var t=s&&s.version>=1&&s.state?s.state.theme:"light";var r=t==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):(t==="dark"?"dark":"light");document.documentElement.setAttribute("data-theme",r);}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <RegisterSW />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
