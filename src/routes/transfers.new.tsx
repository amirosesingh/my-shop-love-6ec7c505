/**
 * Raise a direct transfer — stock this branch is sending to another one with
 * no request behind it. No fake request reference is written: the note simply
 * has no source request.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/platforms/web/components/pos/AppShell";
import { TransferComposer } from "@/platforms/web/components/pos/TransferComposer";
import { WorkspaceHeader } from "@/platforms/web/components/pos/TransferWorkspace";
import { usePos } from "@/lib/pos-store";

export const Route = createFileRoute("/transfers/new")({
  head: () => ({
    meta: [
      { title: "New stock transfer — Northwind POS" },
      {
        name: "description",
        content:
          "Send stock to another branch: pick products, set the quantities going in the box and raise the transfer note.",
      },
      { property: "og:title", content: "New stock transfer — Northwind POS" },
      {
        property: "og:description",
        content: "Raise a direct branch-to-branch stock transfer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    items: typeof search.items === "string" ? search.items : undefined,
  }),
  component: NewTransferPage,
});

function NewTransferPage() {
  const { state, currentStore, activeShift, createTransfer } = usePos();
  const navigate = useNavigate();
  const { items: prefill } = Route.useSearch();
  const requireApproval = state.settings.integrations.requireTransferApproval;

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <WorkspaceHeader
          back="/transfers"
          backLabel="Back to stock movements"
          title="New stock transfer"
          subtitle={
            <>
              Send product from <span className="text-primary">{currentStore.name}</span> to another
              branch. Stock leaves the shelf when the note is dispatched.
            </>
          }
        />
        <TransferComposer
          initialProductIds={prefill ? prefill.split(",").filter(Boolean) : undefined}
          kind="transfer"
          submitLabel={requireApproval ? "Send for approval" : "Raise transfer"}
          onSubmit={({ otherStoreId, items, note }) => {
            const t = createTransfer({
              kind: "transfer",
              fromStoreId: currentStore.id,
              toStoreId: otherStoreId,
              items,
              note,
              createdBy: activeShift?.cashier ?? "Manager",
              needsApproval: requireApproval,
            });
            toast.success(
              t.status === "awaiting_approval"
                ? `${t.ref} sent for approval`
                : `${t.ref} raised — dispatch it when the box is packed`,
            );
            void navigate({ to: "/transfers/$id", params: { id: t.id } });
          }}
        />
      </div>
    </AppShell>
  );
}
