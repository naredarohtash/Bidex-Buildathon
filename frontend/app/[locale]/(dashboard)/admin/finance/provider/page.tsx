"use client";

/**
 * Turning crypto deposits on.
 *
 * The fields are write-only. They start empty even when credentials are stored,
 * because the server has no endpoint that returns a secret and this screen is
 * not the exception — it shows the last four characters so an operator can tell
 * WHICH key is in place, and nothing more. A form that helpfully filled itself
 * with the real values would hand them to every browser extension, screenshot
 * and session that reached the page.
 *
 * Leaving a field blank keeps what is stored. That follows from the same rule:
 * an operator changing only the callback URL cannot retype a secret they are
 * not allowed to see, and saving must not wipe it.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Status {
  provider: string;
  ready: boolean;
  apiKeySet: boolean;
  ipnSecretSet: boolean;
  apiKeyHint: string | null;
  ipnSecretHint: string | null;
  ipnUrl: string | null;
  source: "env" | "database" | "none";
  envManaged: boolean;
  suggestedIpnUrl: string;
}

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-[12.5px] text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-50";

export default function PaymentProviderPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "test" | "clear" | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [ipnSecret, setIpnSecret] = useState("");
  const [ipnUrl, setIpnUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await $fetch<Status>({
      url: "/api/admin/finance/provider",
      silent: true,
      silentSuccess: true,
    });
    if (!error && data) {
      setStatus(data);
      setIpnUrl(data.ipnUrl || data.suggestedIpnUrl || "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const send = useCallback(
    async (action: "save" | "test" | "clear") => {
      setBusy(action);
      const { data, error } = await $fetch<{ ok: boolean; message: string }>({
        url: "/api/admin/finance/provider",
        method: "POST",
        body: action === "clear" ? { action } : { action, apiKey, ipnSecret, ipnUrl },
        silent: true,
        silentSuccess: true,
      });
      setBusy(null);

      if (error) {
        toast.error(typeof error === "string" ? error : "That did not work.");
        return;
      }
      toast.success(data?.message || "Done.");
      if (action !== "test") {
        // Cleared so a secret never lingers in a form field after saving.
        setApiKey("");
        setIpnSecret("");
        load();
      }
    },
    [apiKey, ipnSecret, ipnUrl, load]
  );

  if (loading) {
    return (
      <div className="grid min-h-[300px] place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    /* pt-24 clears the site header, which is `fixed top-0` and h-16 — it takes no
       space in the layout, so a page that starts at the top of the document renders
       underneath it and loses its heading. */
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-24 md:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-foreground">Crypto deposits</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Connect NOWPayments so each deposit gets its own address and credits automatically.
        </p>
      </header>

      {/* State first — this is the question the page exists to answer. */}
      <div
        className={cn(
          "mb-5 flex items-start gap-3 rounded-xl border p-4",
          status?.ready
            ? "border-emerald-500/25 bg-emerald-500/5"
            : "border-amber-500/25 bg-amber-500/5"
        )}
      >
        {status?.ready ? (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">
            {status?.ready ? "Crypto deposits are on" : "Crypto deposits are off"}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {status?.ready
              ? "Traders can deposit and are credited automatically once the network confirms."
              : "Both an API key and an IPN secret are needed. Until then the deposit screen shows crypto as unavailable."}
          </p>
          {status?.envManaged && (
            <p className="mt-1.5 text-[11.5px] text-amber-600 dark:text-amber-400">
              These are currently set in the server environment, which takes priority. Saving here
              will have no effect until they are removed from <code>.env</code>.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[12px] text-muted-foreground">
            Stored encrypted. Never shown again after saving — only the last four characters.
          </p>
        </div>

        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              API key
            </span>
            {status?.apiKeySet && (
              <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                set · {status.apiKeyHint}
              </span>
            )}
          </span>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={status?.apiKeySet ? "Leave blank to keep the current key" : "Paste your API key"}
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            NOWPayments → Settings → Payments → API keys. Checked against the provider before it is
            saved.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              IPN secret
            </span>
            {status?.ipnSecretSet && (
              <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                set · {status.ipnSecretHint}
              </span>
            )}
          </span>
          <input
            type="password"
            value={ipnSecret}
            onChange={(e) => setIpnSecret(e.target.value)}
            placeholder={status?.ipnSecretSet ? "Leave blank to keep the current secret" : "Paste your IPN secret"}
            autoComplete="new-password"
            spellCheck={false}
            className={inputClass}
          />
          {/* The one failure this screen cannot detect, so it says so. */}
          <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
            This signs the callbacks that credit balances, so it is the most sensitive value on the
            platform. It cannot be tested here — a wrong secret opens payments normally and then
            silently rejects every callback, so deposits would never credit.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Callback URL
          </span>
          <div className="flex gap-2">
            <input
              value={ipnUrl}
              onChange={(e) => setIpnUrl(e.target.value)}
              placeholder="https://your-site/api/finance/deposit/ipn"
              spellCheck={false}
              className={inputClass}
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(ipnUrl);
                  toast.success("Copied.");
                } catch {
                  toast.error("Could not copy — select it and press Ctrl+C.");
                }
              }}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-medium text-foreground hover:bg-muted"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </button>
          </div>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Paste this into NOWPayments → Settings → Payments → IPN callback URL. Without it they
            never tell us a payment arrived, and nothing credits.
          </span>
        </label>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => send("save")}
            disabled={busy !== null}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </button>
          <button
            type="button"
            onClick={() => send("test")}
            disabled={busy !== null || (!apiKey && !status?.apiKeySet)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3.5 text-[12.5px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Test API key
          </button>
          {status?.apiKeySet && !status.envManaged && (
            <button
              type="button"
              onClick={() => send("clear")}
              disabled={busy !== null}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          )}
          <a
            href="https://nowpayments.io"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
          >
            NOWPayments <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed text-muted-foreground">
        UPI and bank deposits do not use this. No API can confirm that rupees reached an account, so
        those are approved by hand in Deposits &amp; Withdrawals.
      </p>
    </div>
  );
}
