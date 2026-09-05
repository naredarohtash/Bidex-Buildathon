import { Clock, Hourglass, ShieldAlert, ShieldCheck } from "lucide-react";
import type { RailStatus } from "./account-rail";

/**
 * Where identity verification stands, as one answer.
 *
 * This was derived inline in account-overlay for the rail badge, and the gate
 * on Personal needs exactly the same reading. Two copies of it would drift the
 * first time a status string changed, and they would drift into the worst
 * possible shape: a rail that says "Verified" over a page that refuses to
 * unlock, or the reverse.
 *
 * `kycLevel` alone cannot answer this. It only rises once an application is
 * approved, so "waiting on a reviewer" and "we said no" both read as zero —
 * and those two are the states where the difference matters most, because one
 * asks the account holder for nothing and the other asks for everything again.
 * The application's own status carries it, and the profile payload already
 * ships it as `user.kyc`.
 */
export type KycStage = "approved" | "in-review" | "action-needed" | "not-started";

export function resolveKycStage(user: any): KycStage {
  const status = String(user?.kyc?.status || "").toUpperCase();
  if ((user?.kycLevel || 0) > 0 || status === "APPROVED") return "approved";
  if (status === "PENDING") return "in-review";
  if (status === "REJECTED" || status === "ADDITIONAL_INFO_REQUIRED") return "action-needed";
  return "not-started";
}

/**
 * The same stage, as the badge the rail row wears.
 *
 * Four words, and each one says whose move it is. "In process" is the muted
 * one, and correctly so: the documents are in, nothing is being asked of
 * anybody, and an hourglass says waiting without the amber that would suggest
 * a problem. "Pending" is in the attention colour, because nothing moves until
 * the account holder acts.
 */
export const KYC_RAIL_STATUS: Record<KycStage, RailStatus> = {
  approved: { label: "Verified", tone: "ok", icon: ShieldCheck },
  "in-review": { label: "In process", tone: "muted", icon: Hourglass },
  "action-needed": { label: "Action needed", tone: "warn", icon: ShieldAlert },
  "not-started": { label: "Pending", tone: "warn", icon: Clock },
};
