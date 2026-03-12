import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Nav } from "@/components/layout/nav";
import { DevErrorHandler } from "@/components/dev-error-handler";
import { ErrorBoundary } from "@/components/error-boundary";

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
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', function(e) {
        var msg = (e.reason && e.reason.message) || String(e.reason || '');
        if (msg.indexOf('No elements found') !== -1 || msg.indexOf('No elements') !== -1) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);
      window.addEventListener('error', function(e) {
        var msg = (e.message || '') + (e.error ? String(e.error) : '');
        if (msg.indexOf('No elements found') !== -1 || msg.indexOf('No elements') !== -1) {
          e.preventDefault();
          return true;
        }
      }, true);
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="font-sans" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-screen min-h-[100dvh] font-sans" suppressHydrationWarning>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
        <DevErrorHandler />
        <div className="flex flex-col min-h-screen min-h-[100dvh]">
          <Nav />
          <div className="flex-1 min-h-0 min-h-[calc(100dvh-3.5rem)] max-w-2xl mx-auto w-full px-4 md:px-6 overflow-y-auto [&:has([data-study])]:max-w-none [&:has([data-study])]:px-0 [&:has([data-study])]:min-h-[100dvh]">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </div>
      </body>
    </html>
  );
}
