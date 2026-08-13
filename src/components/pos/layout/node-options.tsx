/**
 * Per-node presentation options for the register canvas. An atomic node wraps
 * its control in this provider so the control can honour the admin's custom
 * label and icon/text choice without the register route knowing about layout.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { ModuleStyle } from "@/lib/register-layout";

export type NodeOptions = {
  label?: string;
  style?: ModuleStyle;
  /** The control should fill its canvas node inside the node padding. */
  fill?: boolean;
};

const NodeOptionsContext = createContext<NodeOptions>({});

export function NodeOptionsProvider({ value, children }: { value: NodeOptions; children: ReactNode }) {
  return <NodeOptionsContext.Provider value={value}>{children}</NodeOptionsContext.Provider>;
}

export const useNodeOptions = () => useContext(NodeOptionsContext);
