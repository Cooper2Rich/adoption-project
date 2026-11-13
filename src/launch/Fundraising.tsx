import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useEffect, useState } from "react";
import type { Doc } from "../../convex/functions.ts";

type Attempt = {
  operationId: string;
  token: string;
  amountCents: number;
  entryId?: string;
};
async function request(action: string, body?: unknown) {
  const response = await fetch(`/api/fundraising?action=${action}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      value.error ?? "Donation checkout unavailable. Retry this same checkout.",
    );
  return value;
}
export function DonationCheckout({ entryId }: { entryId?: string }) {
  const storageKey = `fundraising-attempt-v1:${entryId ?? "untracked"}`;
  const [capability, setCapability] = useState("loading"),
    [amount, setAmount] = useState("10.00"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      return value &&
        typeof value.operationId === "string" &&
        /^[a-f0-9]{64}$/.test(value.token) &&
        Number.isSafeInteger(value.amountCents) &&
        value.entryId === entryId
        ? value
        : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    let active = true;
    void request("capability").then(
      (value) => {
        if (active) setCapability(value.checkout);
      },
      () => {
        if (active) setCapability("unavailable");
      },
    );
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!attempt) return;
    let active = true;
    const check = () =>
      void request("status", {
        operationId: attempt.operationId,
        token: attempt.token,
      }).then(
        (value) => {
          if (active) setStatus(value.status);
        },
        () => {
          if (active) setStatus("pending");
        },
      );
    check();
    const timer = setInterval(check, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [attempt]);
  if (capability === "loading")
    return <p role="status">Checking donation availability…</p>;
  if (capability !== "controlled")
    return (
      <p role="status">
        Donation checkout is not available yet. Your entry-specific fundraising
        link is preserved.
      </p>
    );
  return (
    <div className="donation-checkout">
      <p role="note">
        Controlled verification · unvalidated Stripe transport · no real
        donation or collection.
      </p>
      <p>
        No account is required. Donations support adoption.is. Creator earnings
        apply only to eligible tracked activity.
      </p>
      {status === "confirmed" ? (
        <>
          <p role="status">
            Controlled donation confirmed once. Thank you for supporting
            adoption.is.
          </p>
          <button
            onClick={() => {
              sessionStorage.removeItem(storageKey);
              setAttempt(null);
              setStatus("");
            }}
          >
            Start another controlled donation
          </button>
        </>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              let current = attempt;
              if (!current) {
                if (!/^\d{1,6}(\.\d{1,2})?$/.test(amount))
                  throw new Error(
                    "Enter a positive USD amount with up to two decimal places.",
                  );
                const [whole, fraction = ""] = amount.split(".");
                const amountCents = Number(
                  BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")),
                );
                if (amountCents < 50 || amountCents > 99999999)
                  throw new Error(
                    "Enter a USD donation from $0.50 through $999,999.99.",
                  );
                current = {
                  operationId: crypto.randomUUID(),
                  token: Array.from(
                    crypto.getRandomValues(new Uint8Array(32)),
                    (b) => b.toString(16).padStart(2, "0"),
                  ).join(""),
                  amountCents,
                  ...(entryId ? { entryId } : {}),
                };
                sessionStorage.setItem(storageKey, JSON.stringify(current));
                setAttempt(current);
              }
              const value = await request("checkout", current);
              const target = new URL(value.url);
              if (
                target.protocol !== "http:" ||
                target.hostname !== "127.0.0.1"
              )
                throw new Error("Controlled checkout destination unavailable.");
              location.assign(target.href);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Checkout unavailable. Retry this same checkout.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Donation amount (USD)
            <input
              inputMode="decimal"
              value={attempt ? (attempt.amountCents / 100).toFixed(2) : amount}
              disabled={!!attempt || busy}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          <button disabled={busy}>
            {busy
              ? "Opening checkout…"
              : attempt
                ? "Retry same controlled checkout"
                : "Continue to controlled Stripe checkout"}
          </button>
          {(attempt ||
            new URLSearchParams(location.search).has("donation")) && (
            <p role="status">
              Pending provider confirmation. Returning to this page does not
              confirm a payment.
            </p>
          )}
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
type LedgerRow = {
  id: string;
  originEntryId: string | null;
  completedAt: number;
  commissionBasisPoints: number;
  eligible: boolean;
  dailyPeriod: string | null;
  weeklyPeriod: string | null;
  amounts: { kind: string; cents: number | null }[];
};
const ledgerRef = makeFunctionReference<
  "query",
  { campaignId: string; audience: "manager" | "creator" },
  LedgerRow[]
>("fundraising:ledger");
const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "Unknown · awaiting provider fee evidence"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(cents / 100);
export function FundraisingLedger({
  audience,
}: {
  audience: "manager" | "creator";
}) {
  const rows = useQuery(ledgerRef, { campaignId: "adoption", audience });
  return (
    <section className="panel" aria-label="Private fundraising ledger">
      <h2>
        {audience === "creator"
          ? "Your fundraising earnings"
          : "Fundraising donation ledger"}
      </h2>
      <p>
        Gross fundraising, confirmed refunds, actual provider fees and locked
        gross-based commission are separate. Refund adjustments and payout
        processing are handled separately.
      </p>
      <p role="note">
        Controlled records are unvalidated for production. Actual fundraising
        collection remains held.
      </p>
      {rows === undefined ? (
        <p role="status">Loading private ledger…</p>
      ) : rows.length === 0 ? (
        <p>No confirmed fundraising donations yet.</p>
      ) : (
        rows.map((row) => (
          <article
            className="panel"
            key={row.id}
            aria-label="Confirmed fundraising donation"
          >
            <p>
              {new Date(row.completedAt).toLocaleString("en-US", {
                timeZone: "America/Chicago",
              })}{" "}
              · Chicago · controlled success transition
            </p>
            <p>
              {row.originEntryId
                ? "Tracked donation"
                : "Untracked nonprofit donation"}{" "}
              ·{" "}
              {row.eligible
                ? `Eligible at locked ${row.commissionBasisPoints / 100}% rate`
                : "Nonprofit support only · no creator commission or competition credit"}
            </p>
            <dl>
              {["gross", "refunds", "fees", "commission"].map((kind) => (
                <div key={kind}>
                  <dt>
                    {
                      (
                        {
                          gross: "Gross donation",
                          refunds: "Confirmed refunds",
                          fees: "Provider fees",
                          commission: "Creator commission",
                        } as Record<string, string>
                      )[kind]
                    }
                  </dt>
                  <dd>
                    {money(
                      row.amounts.filter((a) => a.kind === kind).at(-1)?.cents,
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              Daily competition period: {row.dailyPeriod ?? "None"} · Weekly
              competition period: {row.weeklyPeriod ?? "None"}
            </p>
          </article>
        ))
      )}
    </section>
  );
}
