import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";

import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { SplashScreen } from "@/components/SplashScreen";
import { TopLoadingBar } from "@/components/TopLoadingBar";
import { subscribeToLocalMatchUpdates } from "@/lib/match";

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
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});


function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = subscribeToLocalMatchUpdates((matchId) => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      if (matchId) {
        queryClient.invalidateQueries({ queryKey: ["match", matchId] });
      }
      queryClient.invalidateQueries({ queryKey: ["manOfTheDay"] });
      queryClient.invalidateQueries({ queryKey: ["playerRankings"] });
    });
    return unsubscribe;
  }, [queryClient]);

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

  useEffect(() => {
    const currentPath = router.state.location.pathname;
    const isSetupCompleted = localStorage.getItem("criclab_setup_completed");
    if (!isSetupCompleted && currentPath !== "/migration-import") {
      router.navigate({ to: "/migration-import" });
    }
  }, [router.state.location.pathname, router]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let lastTimePressed = 0;
    const backButtonListener = App.addListener("backButton", async () => {
      const currentPath = router.state.location.pathname;
      const isDashboard =
        currentPath === "/dashboard" || currentPath === "/" || currentPath === "/index";

      if (isDashboard) {
        const now = Date.now();
        if (now - lastTimePressed < 2000) {
          await App.exitApp();
        } else {
          lastTimePressed = now;
          toast("Press back again to exit", {
            duration: 2000,
          });
        }
      } else if (currentPath.includes("/score")) {
        const confirmExit = window.confirm("Are you sure you want to exit scoring? Your current progress is saved locally.");
        if (confirmExit) {
          router.navigate({ to: "/dashboard" });
        }
      } else {
        window.history.back();
      }
    });

    return () => {
      backButtonListener.then((l) => l.remove());
    };
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TopLoadingBar />
        <SplashScreen />
        <Outlet />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
