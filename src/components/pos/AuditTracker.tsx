import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { logger, setAuditActor, startAuditSync } from "@/lib/audit-log";
import { useAuth } from "@/lib/pos-auth";

const moduleFor = (path: string) => {
  const seg = path.split("/").filter(Boolean)[0];
  return seg ? seg.replace(/-/g, " ") : "register";
};

const labelOf = (el: HTMLElement) =>
  (el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    el.textContent ||
    el.getAttribute("name") ||
    "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "(unlabelled)";

/** Global, app-wide UI telemetry: clicks, navigation, modals and search queries. */
export function AuditTracker() {
  const { user, authUserId } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const lastPath = useRef<string | null>(null);
  const searchTimers = useRef(new Map<HTMLInputElement, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setAuditActor({
      staffId: user?.staffId ?? "anonymous",
      staffName: user?.name ?? "Signed out",
      role: user?.role ?? "signed out",
      storeId: user?.storeId ?? null,
      authUserId,
    });
  }, [user, authUserId]);

  useEffect(() => {
    startAuditSync();
  }, []);

  // Page & tab navigation
  useEffect(() => {
    if (lastPath.current === path) return;
    logger.log("navigation", "Page view", moduleFor(path), {
      from: lastPath.current,
      to: path,
    });
    lastPath.current = path;
  }, [path]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.(
        "button,[role='button'],[role='tab'],a,[role='menuitem'],[role='option']",
      ) as HTMLElement | null;
      if (!el) return;
      const isTab = el.getAttribute("role") === "tab";
      const label = labelOf(el);
      logger.log(
        isTab ? "navigation" : "interaction",
        isTab ? "Tab switch" : "Button click",
        moduleFor(window.location.pathname),
        {
        label,
        elementId: el.id || null,
        tag: el.tagName.toLowerCase(),
        href: el.getAttribute("href"),
        route: window.location.pathname,
        coordinates: { x: e.clientX, y: e.clientY },
        timestamp: new Date().toISOString(),
        },
      );
    };

    const onInput = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (!el || el.tagName !== "INPUT") return;
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      const hint = `${el.getAttribute("placeholder") ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.name}`.toLowerCase();
      const isSearch = type === "search" || /search|find|lookup|scan|filter/.test(hint);
      if (!isSearch || type === "password") return;
      const prev = searchTimers.current.get(el);
      if (prev) clearTimeout(prev);
      const t = setTimeout(() => {
        if (!el.value.trim()) return;
        logger.log("lookup", "Search query", moduleFor(window.location.pathname), {
          field: el.getAttribute("placeholder") ?? el.getAttribute("aria-label") ?? el.name,
          query: el.value.slice(0, 120),
        });
      }, 700);
      searchTimers.current.set(el, t);
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onInput, true);

    // Modal open / close
    const open = new Set<Element>();
    const scan = () => {
      const dialogs = new Set(document.querySelectorAll("[role='dialog'],[role='alertdialog']"));
      dialogs.forEach((d) => {
        if (open.has(d)) return;
        open.add(d);
        logger.log("interaction", "Modal opened", moduleFor(window.location.pathname), {
          title: d.querySelector("h1,h2,[data-slot='dialog-title']")?.textContent?.trim() ?? "(untitled)",
        });
      });
      open.forEach((d) => {
        if (dialogs.has(d)) return;
        open.delete(d);
        logger.log("interaction", "Modal closed", moduleFor(window.location.pathname), {
          title: d.querySelector("h1,h2,[data-slot='dialog-title']")?.textContent?.trim() ?? "(untitled)",
        });
      });
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });

    const timers = searchTimers.current;
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("input", onInput, true);
      observer.disconnect();
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return null;
}
