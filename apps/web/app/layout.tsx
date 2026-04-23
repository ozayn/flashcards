import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "katex/dist/katex.min.css";
import { AuthSessionProvider } from "@/components/auth-session-provider";
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
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/icons/icon-180.png", type: "image/png", sizes: "180x180" },
    ],
  },
  openGraph: {
    title: "MemoNext",
    description: "Learn anything instantly.",
    images: ["/icons/icon-512.png"],
  },
};

const themeScript = `
  (function() {
    try {
      if (typeof Element !== 'undefined') {
        var blockDashlane = function(name) {
          return String(name).toLowerCase().indexOf('data-dashlane-') === 0;
        };
        var _set = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function(name, value) {
          if (blockDashlane(name)) return;
          return _set.call(this, name, value);
        };
        var _setNS = Element.prototype.setAttributeNS;
        Element.prototype.setAttributeNS = function(ns, name, value) {
          if (blockDashlane(name)) return;
          return _setNS.call(this, ns, name, value);
        };
      }
    } catch (e) {}
    try {
      if (typeof MutationObserver !== 'undefined' && document.documentElement) {
        var stripOne = function(el) {
          if (!el || el.nodeType !== 1 || !el.getAttributeNames) return;
          el.getAttributeNames().forEach(function(n) {
            if (n.toLowerCase().indexOf('data-dashlane-') === 0) el.removeAttribute(n);
          });
        };
        var stripDashlane = function(root) {
          try {
            if (!root) return;
            if (root.nodeType !== 1 && root.nodeType !== 11) return;
            if (root.nodeType === 1) stripOne(root);
            if (root.querySelectorAll) {
              root.querySelectorAll('*').forEach(function(n) {
                stripOne(n);
              });
            }
          } catch (e) {}
        };
        stripDashlane(document.documentElement);
        new MutationObserver(function(records) {
          records.forEach(function(r) {
            if (r.type === 'attributes' && r.target && r.target.nodeType === 1) {
              var n = r.attributeName || '';
              if (n && n.toLowerCase().indexOf('data-dashlane-') === 0) {
                r.target.removeAttribute(n);
              }
            }
            if (r.type === 'childList' && r.addedNodes) {
              r.addedNodes.forEach(function(n) {
                stripDashlane(n);
              });
            }
          });
        }).observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: [
            'data-dashlane-rid',
            'data-dashlane-label',
            'data-dashlane-autofill',
            'data-dashlane-frame',
            'data-dashlane-ignore',
          ],
        });
      }
    } catch (e) {}
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
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <DevErrorHandler />
        <AuthSessionProvider>
          <div className="flex flex-col min-h-screen min-h-[100dvh]">
            <ConditionalNav />
            <div className="flex-1 min-h-0 min-h-[calc(100dvh-3.5rem)] max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 pt-6 pb-8 [&:has([data-study])]:max-w-none [&:has([data-study])]:px-0 [&:has([data-study])]:pt-0 [&:has([data-study])]:pb-0 [&:has([data-study])]:min-h-[100dvh] [&:has([data-landing])]:max-w-none [&:has([data-landing])]:px-0 [&:has([data-landing])]:pt-0 [&:has([data-landing])]:pb-0 [&:has([data-landing])]:min-h-[100dvh]">
              <TooltipProvider>
                <ErrorBoundary>{children}</ErrorBoundary>
              </TooltipProvider>
            </div>
          </div>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
