/**
 * A believable identity for someone who has not signed up yet.
 *
 * The point of the demo is that it should feel like an account rather than a
 * preview, and an account has a name on it. So one is generated, kept for the
 * length of the session, and shown wherever a real name would be.
 *
 * The domain is deliberately NOT a real one. A randomly generated
 * `something@gmail.com` can be a real person's mailbox, and this string travels
 * further than it looks — into logs, support tickets, analytics events, a
 * screenshot someone pastes into a chat. `@demo.bidex` cannot be anybody, and
 * reads as a real address at a glance, which is all it needs to do.
 */

const FIRST = [
  "Swift", "Bright", "Clever", "Bold", "Calm", "Keen", "Rapid", "Sharp",
  "Steady", "Quiet", "Lucky", "Brave", "Noble", "Prime", "Solar",
];

const SECOND = [
  "Tiger", "Falcon", "Otter", "Heron", "Lynx", "Marlin", "Raven", "Bison",
  "Cobra", "Puma", "Osprey", "Ibis", "Panda", "Wolf", "Orca",
];

export const GUEST_EMAIL_DOMAIN = "demo.bidex";

export interface GuestIdentity {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function createGuestIdentity(): GuestIdentity {
  const firstName = pick(FIRST);
  const lastName = pick(SECOND);
  // Four digits is enough to make two demo sessions on one screen distinguishable,
  // which is the only thing this number has to do.
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return {
    id: `guest-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${suffix}@${GUEST_EMAIL_DOMAIN}`,
  };
}

/** True for any address this app minted for a guest. */
export function isGuestEmail(email?: string | null): boolean {
  return !!email && email.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);
}
