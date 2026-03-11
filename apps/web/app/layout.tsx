import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Nav } from "@/components/layout/nav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Flashcard AI",
  description: "AI-powered flashcard learning platform",
};

const themeScript = `
  (function() {
    try {
      var s = localStorage.getItem('flashcard-theme');
      var d = s === 'dark' || (s !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', d);
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable)} suppressHydrationWarning>
      <body className={cn(inter.className, "antialiased bg-background text-foreground min-h-screen min-h-[100dvh]")} suppressHydrationWarning>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
        <div className="flex flex-col min-h-screen min-h-[100dvh]">
          <Nav />
          <div className="flex-1 min-h-0 min-h-[calc(100dvh-3.5rem)] max-w-2xl mx-auto w-full px-4 md:px-6 overflow-y-auto">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
