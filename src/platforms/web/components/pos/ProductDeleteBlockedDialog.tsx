import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BlockedDelete } from "@/lib/product-delete";

/**
 * Explains, in shop language, why an item could not be removed and offers the
 * safe alternative: archive it, so it leaves the till and the web catalogue
 * while every receipt and report that mentions it stays intact.
 */
export function ProductDeleteBlockedDialog({
  blocked,
  onClose,
  onHide,
}: {
  blocked: BlockedDelete[];
  onClose: () => void;
  onHide: (ids: string[]) => void;
}) {
  const many = blocked.length > 1;
  const first = blocked[0];
  return (
    <AlertDialog open={blocked.length > 0} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {many
              ? `${blocked.length} products could not be deleted`
              : "Product cannot be deleted"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {many
              ? "These items are still used by records that would break if they were removed:"
              : `“${first?.name}” has sales or paperwork recorded in previous shifts or past transactions — ${first?.reason}. Deleting it would distort historical sales reports and receipts.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {many && (
          <ul className="max-h-56 space-y-1 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-sm">
            {blocked.map((b) => (
              <li key={b.id}>
                <span className="font-medium">{b.name}</span>
                <span className="text-muted-foreground"> — {b.reason}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-sm text-muted-foreground">
          You can archive {many ? "them" : "it"} instead: {many ? "they leave" : "it leaves"} the
          till and the web catalogue, and every past receipt and report stays exactly as it was.
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onHide(blocked.map((b) => b.id))}>
            {many ? "Archive the blocked ones" : "Deactivate / archive product"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}