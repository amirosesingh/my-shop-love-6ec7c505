import { CircleSlash } from "lucide-react";

/** Shown when the member or redeem subdomain has been switched off. */
export function PublicPageClosed({ what }: { what: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="max-w-sm rounded-xl border border-border bg-card p-6 text-center">
        <CircleSlash className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">{what} is closed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page is temporarily unavailable. Please ask a member of staff at the counter for
          help.
        </p>
      </div>
    </main>
  );
}
