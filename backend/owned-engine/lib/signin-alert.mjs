/**
 * "Your account was just signed in to."
 *
 * The one email on the keep-list that had no template and no sender. It is also
 * the only one addressed to someone who did NOT perform the action — every
 * other message confirms something the reader just did, while this one exists
 * entirely for the case where they did not.
 *
 * Sent from the pipeline rather than from the login route, because the login
 * route is part of the vendor's compiled core and hand-patching obfuscated
 * output is how a rebuild silently reverts a security feature. The pipeline
 * already sees the route, the outcome, the caller's address and their browser,
 * which is everything the alert needs.
 *
 * Best-effort throughout: a failure here must never turn a successful sign-in
 * into a failed one. Someone who cannot receive the warning should still be
 * able to get into their account.
 */

/* A signed-in session is worth telling someone about once, not on every tab
   they open. Keyed per user, and small — this is a nicety to avoid duplicates
   within a burst, not a durable record. */
const recentlyAlerted = new Map();
const QUIET_MS = 10 * 60 * 1000;
const MAX_TRACKED = 5000;

function alreadyAlerted(userId) {
  const now = Date.now();
  const at = recentlyAlerted.get(userId);
  if (at && now - at < QUIET_MS) return true;

  /* Bounded, or a long-running process accumulates an entry per user forever.
     Clearing wholesale when it grows is fine: the cost of forgetting is one
     duplicate email, and the cost of remembering everything is unbounded. */
  if (recentlyAlerted.size > MAX_TRACKED) recentlyAlerted.clear();
  recentlyAlerted.set(userId, now);
  return false;
}

/** Turn a user-agent into something a person can recognise their own device in. */
function describeDevice(userAgent) {
  const ua = String(userAgent || "");
  if (!ua) return "Unknown device";

  const browser =
    /edg\//i.test(ua) ? "Edge"
    : /opr\/|opera/i.test(ua) ? "Opera"
    : /chrome|crios/i.test(ua) ? "Chrome"
    : /firefox|fxios/i.test(ua) ? "Firefox"
    : /safari/i.test(ua) ? "Safari"
    : "Browser";

  const platform =
    /iphone|ipad|ipod/i.test(ua) ? "iOS"
    : /android/i.test(ua) ? "Android"
    : /mac os|macintosh/i.test(ua) ? "Mac"
    : /windows/i.test(ua) ? "Windows"
    : /linux/i.test(ua) ? "Linux"
    : "";

  return platform ? `${browser} on ${platform}` : browser;
}

/**
 * @param compat  the owned engine's compat layer (models + require)
 * @param user    { id, email, firstName }
 * @param meta    { ip, userAgent }
 */
export async function sendSignInAlert(compat, user, meta = {}) {
  try {
    if (!user?.id || !user?.email) return;
    if (alreadyAlerted(user.id)) return;

    const { sendEmailToTargetWithTemplate } = compat.require("@b/utils/emails");
    if (typeof sendEmailToTargetWithTemplate !== "function") return;

    const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Bidex";
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

    await sendEmailToTargetWithTemplate(
      user.email,
      "SignInAlert",
      {
        FIRSTNAME: user.firstName || "there",
        /* Written out in full rather than an ISO timestamp. Someone deciding
           whether a sign-in was theirs is comparing it against their memory of
           this morning, not parsing a machine format. */
        TIME: new Date().toLocaleString("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        }) + " IST",
        IP: meta.ip || "Unknown location",
        DEVICE: describeDevice(meta.userAgent),
        SITE_NAME: siteName,
        SITE_URL: siteUrl,
      }
    );
  } catch (err) {
    // Logged, never thrown. See the module comment.
    console.error(`[SIGNIN-ALERT] could not send: ${err?.message || err}`);
  }
}
