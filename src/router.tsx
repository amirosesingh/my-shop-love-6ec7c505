import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isLiveOnly } from "./lib/live-mode";

export const getRouter = () => {
  // Android is a live client: nothing is served from cache, and every screen
  // refetches when it is opened or the app comes back to the foreground.
  const queryClient = isLiveOnly()
    ? new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 0,
            gcTime: 0,
            networkMode: "online",
            refetchOnMount: "always",
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
        },
      })
    : new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
