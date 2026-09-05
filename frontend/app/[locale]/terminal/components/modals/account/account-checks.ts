import { Mail, ShieldCheck } from "lucide-react";

/**
 * What the account still needs, as data rather than as a header.
 *
 * This used to live in identity-header.tsx, which was deleted: the panel no
 * longer has a header, and the phone's identity card still needs the list. It
 * is a two-item list on purpose — a checklist that names everything you have
 * already done is a status report, and only the gaps are worth showing.
 */

export interface AccountCheck {
  id: string;
  label: string;
  icon: React.ElementType;
  done: boolean;
  /** Tab that resolves it, when it is not done. */
  goTo?: string;
  /** Resolved in place instead of by navigating. */
  action?: "verify-email";
}

export function buildChecks(user: any): AccountCheck[] {
  return [
    {
      id: "twofa",
      label: "Two-factor",
      icon: ShieldCheck,
      done: !!user?.twoFactor?.enabled,
      goTo: "security",
    },
    {
      id: "email",
      label: "Email",
      icon: Mail,
      done: !!user?.emailVerified,
      action: "verify-email",
    },
  ];
}
