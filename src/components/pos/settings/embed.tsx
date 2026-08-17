/**
 * Marks the subtree as "settings shown inside the workspace sheet".
 *
 * The same components back both the full page and the half-window sheet, so
 * instead of duplicating every panel the frame simply drops its page chrome
 * (app shell, back link, page heading) when it renders inside the sheet.
 */
import { createContext, useContext, type ReactNode } from "react";

const EmbeddedCtx = createContext(false);

export function useEmbeddedSettings(): boolean {
  return useContext(EmbeddedCtx);
}

export function EmbeddedSettings({ children }: { children: ReactNode }) {
  return <EmbeddedCtx.Provider value={true}>{children}</EmbeddedCtx.Provider>;
}
