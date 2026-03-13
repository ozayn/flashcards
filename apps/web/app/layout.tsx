import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { ConditionalNav } from "@/components/layout/conditional-nav";
import { DevErrorHandler } from "@/components/dev-error-handler";
import { ErrorBoundary } from "@/components/error-boundary";
import { TooltipProvider } from "@/components/ui/tooltip";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "MemoNext",
  description: "MemoNext helps you turn information into memory. Generate flashcards instantly from text or topics.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/logo/brain_stack_512.png", type: "image/png", sizes: "192x192" },
      { url: "/logo/brain_stack_512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/logo/brain_stack_512.png", type: "image/png", sizes: "180x180" },
      { url: "/logo/brain_stack_512.png", type: "image/png", sizes: "512x512" },
    ],
  },
  openGraph: {
    title: "MemoNext",
    description: "Learn anything instantly.",
    images: ["/logo/brain_stack_512.png"],
  },
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
          <ConditionalNav />
          {/* Content area: aligns with "M" in MemoNext (logo 32px + gap 8px = 40px extra left indent). Study page (data-study) opts out for full-width. */}
          <div className="flex-1 min-h-0 min-h-[calc(100dvh-3.5rem)] overflow-y-auto max-w-4xl mx-auto w-full pl-[64px] pr-6 md:pl-[72px] md:pr-8 pt-6 pb-8 [&:has([data-study])]:max-w-none [&:has([data-study])]:pl-0 [&:has([data-study])]:pr-0 [&:has([data-study])]:pt-0 [&:has([data-study])]:pb-0 [&:has([data-study])]:min-h-[100dvh] [&:has([data-landing])]:min-h-[100dvh]">
            <TooltipProvider>
              <ErrorBoundary>{children}</ErrorBoundary>
            </TooltipProvider>
          </div>
        </div>
      </body>
    </html>
  );
}
