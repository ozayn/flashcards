import type { Metadata } from "next";
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

function ThemeScript() {
  const script = `
    (function() {
      var s = localStorage.getItem('flashcard-theme');
      var d = s === 'dark' || (s !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', d);
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable)} suppressHydrationWarning>
      <body className={cn(inter.className, "antialiased bg-background text-foreground")}>
        <ThemeScript />
        <Nav />
        <div className="min-h-screen max-w-2xl mx-auto px-4 md:px-6">
          {children}
        </div>
      </body>
    </html>
  );
}
