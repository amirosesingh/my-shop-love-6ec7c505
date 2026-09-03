import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { PosProvider } from "@/lib/pos-store";
import { usePosOptional } from "@/lib/pos-store";
import { PosRulesProvider } from "@/lib/pos-rules.tsx";
import { ManagerGateProvider } from "@/lib/manager-gate";
import { AuthProvider } from "@/lib/pos-auth";
import { PermissionsProvider } from "@/lib/pos-permissions";
import { Toaster } from "../components/ui/sonner";
import { ErrorNotifier } from "@/platforms/web/components/pos/ErrorNotifier";
import { AuditTracker } from "@/platforms/web/components/pos/AuditTracker";
import { TelemetryAgent } from "@/platforms/web/components/pos/TelemetryAgent";
import { TerminalActivation } from "@/platforms/web/components/pos/TerminalActivation";
import { isTerminalApp } from "@/platform-config/platform";
import { readTerminalConfig } from "@/core/activation/terminal-tokens";
import { FirstRunSetup } from "@/platforms/web/components/pos/FirstRunSetup";
import { EmergencyAccessLink } from "@/platforms/web/components/pos/EmergencyAccessLink";
import { ThemeProvider, themeBootScript } from "../lib/theme";
import { publicConfigScript } from "../lib/public-config-script";
import { NativeBoot } from "@/platforms/mobile/components/NativeBoot";
import { OfflineGate } from "@/platforms/mobile/components/OfflineGate";
import { AndroidUpdateBanner } from "@/platforms/mobile/components/AndroidUpdateBanner";
import { usePublicHostLanding } from "../lib/coupon-hosts";

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
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  const notConfigured = error.name === "SupabaseConfigError";

  // A till that has never been paired has no connection details yet — that is
  // the normal first-boot state, not a failure. Show the activation screen.
  if (notConfigured && isTerminalApp() && !readTerminalConfig()) {
    return <TerminalActivation onActivated={() => window.location.reload()} />;
  }

  const clearAndRestart = () => {
    try {
      window.localStorage.removeItem("pos.offline.snapshot.v1");
      window.localStorage.removeItem("pos-state-v2");
    } catch {
      /* nothing else we can do */
    }
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {notConfigured ? "Database not configured" : "This page didn't load"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {notConfigured
            ? "This server has not been told where the database lives. Set SUPABASE_URL and SUPABASE_ANON_KEY in the hosting variables (Cloudflare: Workers → Settings → Variables & Secrets), then reload."
            : "Something went wrong on our end. You can try refreshing or head back home."}
        </p>
        <p className="mt-2 break-words text-xs text-muted-foreground/80">{error.message}</p>
        {error.stack && (
          <details className="mt-3 text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Technical details
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-[10px] leading-snug text-muted-foreground">
              {error.stack}
            </pre>
          </details>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
              window.location.reload();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            onClick={clearAndRestart}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Clear local cache and restart
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
          {/* Connection repair must stay reachable from the failure screen. */}
          {isTerminalApp() && <EmergencyAccessLink />}
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1.0, minimum-scale=0.5, maximum-scale=2.0, user-scalable=yes, viewport-fit=cover",
      },
      { title: "Northwind POS — Register, Shifts & Inventory" },
      {
        name: "description",
        content:
          "Touch point of sale with shift open/close, inventory, central membership, cash drawer control and thermal receipt printing.",
      },
      { property: "og:title", content: "Northwind POS" },
      {
        property: "og:description",
        content: "Point of sale with shifts, inventory, membership and receipt printing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: publicConfigScript() }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
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
  usePublicHostLanding();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <NativeBoot>
      <OfflineGate>
      {/* Single mount point for auth: no route or component may mount its own
          AuthProvider — a second provider creates a second session tree. */}
      <AuthProvider>
        <PermissionsProvider>
        <PosProvider>
          <RulesBridge>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <AuditTracker />
          <TelemetryAgent />
          <FirstRunSetup>
            <Outlet />
          </FirstRunSetup>
          <AndroidUpdateBanner />
          <Toaster position="top-center" />
          <ErrorNotifier />
          </RulesBridge>
        </PosProvider>
        </PermissionsProvider>
      </AuthProvider>
      </OfflineGate>
      </NativeBoot>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/**
 * Rules are per-branch, so the provider needs the active store from the till.
 * Read the store optionally: during a hot reload the POS context can briefly be
 * missing, and that must degrade to "no branch yet" rather than blank the app.
 */
function RulesBridge({ children }: { children: ReactNode }) {
  const pos = usePosOptional();
  const storeId = pos?.currentStore?.id ?? "";
  return (
    <PosRulesProvider storeId={storeId}>
      <ManagerGateProvider storeId={storeId}>{children}</ManagerGateProvider>
    </PosRulesProvider>
  );
}
