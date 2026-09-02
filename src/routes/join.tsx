import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Gift, Loader2, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinMember } from "@/lib/coupons";
import { voucherUrl } from "@/lib/coupon-hosts";
import { usePublicFlags } from "@/lib/public-flags";
import { PublicPageClosed } from "@/platforms/web/components/pos/PublicPageClosed";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "Join the rewards club — Lucky Charms" },
      {
        name: "description",
        content:
          "Sign up in seconds with your mobile number to collect loyalty points and unlock your welcome coupon.",
      },
      { property: "og:title", content: "Join the rewards club — Lucky Charms" },
      {
        property: "og:description",
        content: "Register your mobile number and claim your welcome coupon instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { flags, ready } = usePublicFlags();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Please tell us your name.");
    if (phone.replace(/\D/g, "").length < 6) return setError("Enter a valid mobile number.");
    setBusy(true);
    try {
      const token = await joinMember({ phone, fullName: name, email: email.trim() || undefined });
      if (token) {
        window.location.href = voucherUrl(token);
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete your registration.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="min-h-screen bg-background" />;
  if (!flags.member) return <PublicPageClosed what="Member signup" />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
        {done ? (
          <div className="text-center">
            <PartyPopper className="mx-auto h-10 w-10 text-primary" aria-hidden />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-card-foreground">
              You're in, {name.split(" ")[0]}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your membership is live. Just give your mobile number at the till to collect points
              on every purchase.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <Gift className="mx-auto h-10 w-10 text-primary" aria-hidden />
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-card-foreground">
                Join the rewards club
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Points on every purchase, member-only offers, and a welcome coupon on us.
              </p>
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="join-name">Full name</Label>
                <Input
                  id="join-name"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="join-phone">Mobile number</Label>
                <Input
                  id="join-phone"
                  value={phone}
                  maxLength={24}
                  inputMode="tel"
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 012 345 6789"
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="join-email">Email (optional)</Label>
                <Input
                  id="join-email"
                  type="email"
                  value={email}
                  maxLength={120}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create my membership
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                We only use your number to look up your points and send your offers.
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
