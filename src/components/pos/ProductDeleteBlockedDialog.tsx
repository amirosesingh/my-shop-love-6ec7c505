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
 * safe alternative: hide it from the till and the web catalogue instead of
 * breaking the records that point at it.
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
              : `Cannot delete “${first?.name}”`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {many
              ? "These items are still used by records that would break if they were removed:"
              : `This item cannot be removed because ${first?.reason}. Deleting it would break those records.`}
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
          You can hide {many ? "them" : "it"} from the till and the web catalogue instead — the
          history stays intact.
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Close</AlertDialogCancel>
          <AlertDialogAction onClick={() => onHide(blocked.map((b) => b.id))}>
            {many ? "Hide the blocked ones" : "Hide instead"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}