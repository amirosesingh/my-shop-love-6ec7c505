/**
 * Raise a stock request as a full transaction screen rather than a dialog.
 * The request itself never moves stock: it is the paperwork the supplying
 * branch approves, and approval raises the transfer that does the moving.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { TransferComposer } from "@/components/pos/TransferComposer";
import { WorkspaceHeader } from "@/components/pos/TransferWorkspace";
import { usePos } from "@/lib/pos-store";

export const Route = createFileRoute("/requests/new")({
  head: () => ({
    meta: [
      { title: "New stock request — Northwind POS" },
      {
        name: "description",
        content:
          "Ask another branch for stock: search the catalogue, set quantities and send the request for approval.",
      },
      { property: "og:title", content: "New stock request — Northwind POS" },
      {
        property: "og:description",
        content: "Raise a branch-to-branch stock request from a full transaction screen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    items: typeof search.items === "string" ? search.items : undefined,
  }),
  component: NewRequest,
});

function NewRequest() {
  const { currentStore, activeShift, createTransfer } = usePos();
  const navigate = useNavigate();
  const { items: prefill } = Route.useSearch();

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <WorkspaceHeader
          back="/transfers"
          backLabel="Back to stock movements"
          title="New stock request"
          subtitle={
            <>
              Ask another branch to send product to{" "}
              <span className="text-primary">{currentStore.name}</span>. Nothing moves until they
              approve and dispatch it.
            </>
          }
        />
        <TransferComposer
          initialProductIds={prefill ? prefill.split(",").filter(Boolean) : undefined}
          kind="request"
          submitLabel="Send request"
          onSubmit={({ otherStoreId, items, note }) => {
            const t = createTransfer({
              kind: "request",
              fromStoreId: otherStoreId,
              toStoreId: currentStore.id,
              items,
              note,
              createdBy: activeShift?.cashier ?? "Manager",
              needsApproval: true,
            });
            toast.success(`${t.ref} sent for approval`);
            void navigate({ to: "/requests/$id", params: { id: t.id } });
          }}
        />
      </div>
    </AppShell>
  );
}
