import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CricLab" },
      { name: "description", content: "Local cricket management and live scoring" },
      { property: "og:title", content: "CricLab" },
      { property: "og:description", content: "Local cricket management and live scoring" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "theme-color", content: "#ea580c" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
      {
        rel: "apple-touch-icon",
        href: "/icon-192.png",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppContent() {
  const { loading } = useAuth();

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => console.log("SW registered:", reg.scope))
          .catch((err) => console.log("SW registration failed:", err));
      });
    }
  }, []);

  if (loading) {
    return (
      <div 
        className="min-h-screen bg-cover bg-center text-foreground flex flex-col justify-between items-center relative select-none"
        style={{ backgroundImage: "linear-gradient(to bottom, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.95)), url('/stadium_bg.png')" }}
      >
        <div className="h-6"></div>

        <div className="w-full max-w-md flex-1 flex flex-col justify-between px-6 py-8">
          
          {/* Logo Section */}
          <div className="flex flex-col items-center mt-6 animate-pulse">
            <div className="w-48 h-48 drop-shadow-[0_10px_20px_rgba(234,88,12,0.3)]">
              <img src="/criclab_logo.png" alt="CricLab Logo" className="w-full h-full object-contain" />
            </div>
            
            <div className="text-center mt-6">
              <h2 className="text-2xl font-black italic tracking-wider text-white">
                LIVE SCORES.
              </h2>
              <h2 className="text-2xl font-black italic tracking-wider text-primary mt-0.5">
                REAL PASSION.
              </h2>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-4 gap-2.5 mt-8 border-t border-b border-white/10 py-6">
            <FeatureItem 
              icon={<svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M19.164 12L12 22l1.164-8H6.836L14 4l-1.164 8h6.328z"/></svg>} 
              title="Live Scores" 
              desc="Ball by ball updates" 
            />
            <FeatureItem 
              icon={<svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2"/></svg>} 
              title="Stats" 
              desc="Player & team stats" 
            />
            <FeatureItem 
              icon={<svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5a2 2 0 10-2 2h2zm0 0h4m-4 0H8m12 9a2 2 0 11-4 0V9h4v6zM4 15a2 2 0 114 0V9H4v6z"/></svg>} 
              title="Tournaments" 
              desc="Manage & follow" 
            />
            <FeatureItem 
              icon={<svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>} 
              title="Teams" 
              desc="Create & manage" 
            />
          </div>

          {/* Buttons Area */}
          <div className="space-y-3 mt-8">
            <div className="w-full bg-gradient-to-r from-orange-600 to-red-600 rounded-xl p-3.5 flex items-center justify-between text-white font-bold tracking-wide shadow-lg opacity-70">
              <span className="text-sm">USER LOGIN / SIGN UP</span>
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </div>

            <div className="w-full bg-neutral-900 border border-white/10 rounded-xl p-3.5 flex items-center justify-between text-neutral-400 font-bold tracking-wide opacity-70">
              <span className="text-sm">ADMIN LOGIN</span>
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </div>

            <div className="flex items-center justify-center gap-4 py-1.5">
              <div className="h-[1px] bg-white/10 flex-1"></div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">or</span>
              <div className="h-[1px] bg-white/10 flex-1"></div>
            </div>

            <div className="w-full bg-neutral-950/40 border border-white/5 rounded-xl p-3.5 flex items-center justify-center gap-2 text-neutral-500 font-semibold opacity-70">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              <span className="text-sm">VIEW LIVE MATCHES</span>
            </div>
          </div>
          
        </div>
      </div>
    );
  }

  return <Outlet />;
}

function FeatureItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center text-center space-y-1.5">
      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <div className="text-[9px] font-black uppercase text-white/90 leading-tight tracking-wider">{title}</div>
        <div className="text-[7.5px] text-muted-foreground leading-tight mt-0.5">{desc}</div>
      </div>
    </div>
  );
}
