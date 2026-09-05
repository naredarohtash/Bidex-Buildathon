"use client";

/**
 * Where the account is signed in.
 *
 * ── The rule that got the first version deleted ────────────────────────────
 * The page this replaces listed "Chrome browser on Windows", "New York, US",
 * "192.168.1.***" from a hardcoded array, with a Revoke button wired to
 * nothing — on the one screen a trader opens to find out whether somebody else
 * is in their account. Every line here comes from the server: the IP is read
 * off the request, the browser and OS are parsed from the User-Agent the
 * device actually sent, the place is one lookup of that IP stored on the row,
 * and "Active now" means the session key still exists in Redis. Where a value
 * is missing it shows a dash. There is no placeholder anywhere in this file,
 * and there must never be one.
 *
 * ── What this rebuild changed, and why ─────────────────────────────────────
 *
 * **It answers the question before it lists the evidence.** Nobody opens this
 * to browse a table; they open it to find out whether anyone else is in the
 * account. That was buried — you had to read every row, count the ones marked
 * active, and notice that one of them said "This device" rather than "Active
 * now". The first line says it in words, and "sign out other devices" sits on
 * the card's title row rather than on a footer strip at the far end of the
 * list — where it is also the only control that can end the older sessions,
 * which have no cards of their own.
 *
 * **This device is separated from the others.** In one flat list the row you
 * are sitting at looked exactly like the row that might be a stranger, and the
 * only thing distinguishing them was a green tablet reading "This device"
 * against a green tablet reading "Active now" — two near-identical marks for
 * the two states that most need telling apart. They are two groups now, under
 * two headings, and the heading does the work the badge was failing to do.
 *
 * **The green boxes are gone.** Every row carried a bordered tile holding a
 * tinted icon, tinted green whenever the session was live, plus a filled green
 * pill beside the name. On an account signed in from three devices that is six
 * green blocks, all of them reporting the ordinary case. What is left is a 6px
 * dot and one word, and the browser's own mark — the only colour on the card
 * that identifies rather than decorates.
 *
 * **A session is a card, not a table row.** The row put the status and the
 * time at the far right of a card that runs the width of the settings page, so
 * "Active now" sat a foot from the device it described with nothing in
 * between, and the eye had to cross that gap on every line to pair them up.
 * Each session is now a bordered card carrying everything it has to say, and
 * the "other devices" group runs two across on a wide screen — which uses the
 * width rather than stretching a one-line row into it.
 *
 * **The two sentences that carry consequences are notices.** The count of
 * other live devices, and the older sessions that cannot be described, were
 * both plain paragraphs — the second inside a bare bordered box. Tinted panels
 * with a glyph, per the product's dialog language, because a tint is what makes
 * somebody read a line they have already scrolled past. See DIALOG-DESIGN.md.
 *
 * **Both times, each labelled.** The right column showed "Active just now"
 * over "Signed in 31 Aug" with nothing saying which was which, so the pair read
 * as one timestamp contradicting itself. Every card now gives the sign-in and
 * the last-seen, named — on live sessions too, where last-seen is the useful
 * half: "Active now" means the session key is still valid, and a device valid
 * since Tuesday but not seen since Tuesday is the one worth a second look.
 *
 * The one limitation is stated on screen rather than papered over: a device is
 * recorded when it announces itself, which is at sign-in and when this page is
 * opened, so sessions that began before this existed are counted but cannot be
 * described.
 */

import { memo, useCallback, useEffect, useState } from "react";
import { Laptop, Loader2, LogOut, Smartphone, Tablet } from "lucide-react";
import { BrowserMark, OsMark } from "./marks";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Action, Card, EmptyState } from "../../../kit/settings-kit";
import { Notice } from "@/components/ui/dialog-kit";

export interface Device {
  id: string;
  current: boolean;
  active: boolean;
  ip: string | null;
  browser: string | null;
  os: string | null;
  deviceType: "Desktop" | "Phone" | "Tablet" | null;
  deviceName: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  signedInAt: string | null;
  lastSeenAt: string | null;
  endedReason: "revoked" | "expired" | null;
}

export const SignInActivity = memo(function SignInActivity() {
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [unrecorded, setUnrecorded] = useState(0);
  const [busy, setBusy] = useState<null | "load" | "revoke">(null);
  /* The row being signed out, so only its own button spins — a card-level busy
     flag would grey out eight devices to report one. */
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await $fetch({
      url: "/api/user/security/activity",
      silent: true,
      silentSuccess: true,
    });
    setDevices((data as any)?.devices ?? []);
    setUnrecorded((data as any)?.unrecordedSessions ?? 0);
  }, []);

  useEffect(() => {
    /* Announce this device first, then read the list — otherwise the person
       looking at the page is the one device missing from it. The record is
       keyed by session, so opening the page twice does not add a second row. */
    (async () => {
      setBusy("load");
      await $fetch({
        url: "/api/user/security/activity",
        method: "POST",
        silent: true,
        silentSuccess: true,
      });
      await load();
      setBusy(null);
    })();
  }, [load]);

  /* Read again when the tab comes back to the front. This page answers "is
     anybody else in my account", and the answer can change while it sits open
     behind something else — which is the whole job the Refresh button was
     doing, done without asking anybody to press anything. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  const signOutOthers = useCallback(async () => {
    setBusy("revoke");
    const { data, error } = await $fetch({
      url: "/api/user/security/sessions/revoke",
      method: "POST",
      body: { includeCurrent: false },
      silent: true,
      silentSuccess: true,
    });
    if (error) {
      setBusy(null);
      toast({
        title: "Could not sign the other devices out",
        description: "Nothing was changed. Please try again.",
        variant: "destructive",
      });
      return;
    }
    /* If the server could not tell which session is this one, it could not
       spare it either — so this device has just been signed out too. Saying
       "done" and leaving the page sitting on a dead session is the one outcome
       worth handling explicitly. */
    if ((data as any)?.revoked && (data as any)?.keptCurrent === false) {
      toast({
        title: "Signed out everywhere",
        description: "Including this device. Sign in again to continue.",
      });
      window.location.href = "/login";
      return;
    }

    await load();
    setBusy(null);
    toast({
      title: (data as any)?.revoked ? "Other devices signed out" : "Nothing to sign out",
      description:
        (data as any)?.message || "You are still signed in on this device.",
    });
  }, [load, toast]);

  /* One device, from its own card. The big red button is for the moment
     somebody sees a session they do not recognise and wants everything gone;
     this is for the ordinary case, which is a phone left signed in somewhere.
     The current device has no button: signing yourself out is Log out, and
     doing it from a row that looks like all the others is a mistake waiting to
     happen. The route refuses it as well. */
  const signOutOne = useCallback(
    async (device: Device) => {
      setRevoking(device.id);
      const { data, error } = await $fetch({
        url: "/api/user/security/sessions/revoke",
        method: "POST",
        body: { deviceId: device.id },
        silent: true,
        silentSuccess: true,
      });
      if (error) {
        setRevoking(null);
        toast({
          title: "Could not sign that device out",
          description: "Nothing was changed. Please try again.",
          variant: "destructive",
        });
        return;
      }
      await load();
      setRevoking(null);
      toast({
        title: (data as any)?.revoked ? "Device signed out" : "Already signed out",
        description: `${describeDevice(device)} · ${describePlace(device)}`,
      });
    },
    [load, toast]
  );

  const all = devices || [];
  const thisDevice = all.filter((d) => d.current);
  const others = all.filter((d) => !d.current);
  const liveElsewhere = others.filter((d) => d.active).length + unrecorded;

  return (
    <Card
      title="Where you are signed in"
      description="Devices that have signed in to your account."
      /* On the title row, and only while there is something to end.
      
         It was a red button on a footer strip — the far end of a list of eight
         devices from the line that says anything is wrong — and then, briefly,
         inside that line, which put a filled button in the middle of a
         paragraph. The header is where a card's own action goes on every other
         card in these settings. It is absent rather than disabled when nothing
         else is signed in: there is nothing to grey out, and the notice below
         already says so.
      
         It cannot go away entirely: the older sessions have no cards of their
         own, so this is the only control that can end them. */
      action={
        liveElsewhere > 0 ? (
          <Action variant="danger" loading={busy === "revoke"} onClick={signOutOthers}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out other devices
          </Action>
        ) : undefined
      }
    >
      {devices === null ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          description="This device will show up here in a moment."
        />
      ) : (
        <div className="space-y-5">
          {/* The answer, before the evidence — and in a notice rather than a
              paragraph, which is the product's rule for a sentence that carries
              a consequence: the tint and the glyph are what make somebody read
              a line they would otherwise scroll past. See DIALOG-DESIGN.md. */}
          <Summary live={liveElsewhere} />

          {thisDevice.length > 0 && (
            <Group title="This device">
              {thisDevice.map((d) => (
                <DeviceCard key={d.id} device={d} />
              ))}
            </Group>
          )}

          {/* No count on this heading, deliberately. The summary above counts
              everything signing out would end — including the older sessions
              we hold no details for — and a heading counting only the ones we
              can describe read as the same number disagreeing with itself two
              lines apart. */}
          {others.length > 0 && (
            /* Two across on a wide screen. This card runs the width of the
                settings page, and a list of one-line rows down the left of it
                left a hand's width of nothing beside every device — which is
                also what pushed each row's status off to an edge a foot away
                from the name it belonged to. Two columns of self-contained
                cards use the width instead of stretching into it. */
            <Group title="Other devices" columns>
              {others.map((d) => (
                <DeviceCard
                  key={d.id}
                  device={d}
                  onSignOut={d.active ? () => signOutOne(d) : undefined}
                  signingOut={revoking === d.id}
                />
              ))}
            </Group>
          )}

          {/* Stated, not hidden. Counting them is honest; describing them would
              not be, because the server has nothing recorded about them. */}
          {unrecorded > 0 && (
            <Notice tone="info">
              {unrecorded} older {unrecorded === 1 ? "session is" : "sessions are"} still signed
              in from before this list started recording, so {unrecorded === 1 ? "it has" : "they have"} no
              device details. Signing out other devices ends {unrecorded === 1 ? "it" : "them"} too.
            </Notice>
          )}
        </div>
      )}
    </Card>
  );
});

/**
 * One sentence saying whether anything here needs attention.
 *
 * Both cases are notices, and the tone is the whole message: green where this
 * is the only session — a state that is already true, and worth saying rather
 * than leaving somebody to count rows — amber where it is not, because more
 * than one live session is the one fact on this card that can be a problem.
 */
function Summary({ live }: { live: number }) {
  if (live === 0) {
    return <Notice tone="ok">This is the only device signed in to your account.</Notice>;
  }
  return (
    <Notice tone="warn">
      You are signed in on{" "}
      <strong className="font-semibold text-foreground">
        {live} other {live === 1 ? "device" : "devices"}
      </strong>
      . If you do not recognise {live === 1 ? "it" : "them"}, sign {live === 1 ? "it" : "them"} out.
    </Notice>
  );
}

/**
 * A labelled group of rows.
 *
 * The heading is what tells "the machine I am on" from "everything else",
 * which two badges of the same colour in one flat list could not.
 */
function Group({
  title,
  children,
  columns,
}: {
  title: string;
  children: React.ReactNode;
  /** Two across from `lg:` up — for the group that can hold several. */
  columns?: boolean;
}) {
  return (
    <section>
      {/* The heading, and a rule to the end of the card. A word floating above
          a group names it; a word with a line running off it *encloses* the
          group, which is what tells a reader where one ends and the next
          begins without drawing a box around either. */}
      <div className="mb-2 flex items-center gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {title}
        </h3>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className={cn("grid gap-2", columns && "lg:grid-cols-2")}>{children}</div>
    </section>
  );
}

/**
 * One session, as a card rather than a table row.
 *
 * It was a row: mark, name and details on the left, status and time pushed to
 * the far right of a card that runs the width of the settings page. On a wide
 * screen that put "Active now" a foot away from the device it described, with
 * nothing in between, and the eye had to travel the gap on every line to pair
 * them up. Everything a session says now sits inside its own bordered card, in
 * the order somebody reads it: what it is, where from, and when it started.
 *
 * The device being read on gets the brand's own tint, which is the cheapest
 * possible way to say "not this one" about all the others.
 */
function DeviceCard({
  device,
  onSignOut,
  signingOut,
}: {
  device: Device;
  /** Omitted for this device, and for sessions that have already ended. */
  onSignOut?: () => void;
  signingOut?: boolean;
}) {
  const ended = !device.active;
  const Shape =
    device.deviceType === "Phone" ? Smartphone : device.deviceType === "Tablet" ? Tablet : Laptop;

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        device.current ? "border-brand/30 bg-brand/[0.05]" : "border-border bg-background/40"
      )}
    >
      <div className="flex items-start gap-3">
        {/* The browser in colour, the machine's shape on its corner in the
            theme's own grey. Two facts answering different questions: which
            browser, and what kind of thing it is running on. The badge is small
            and unsaturated so the browser stays the mark you see first.

            No bordered tile around it — that square was the loudest thing in
            each row and carried one bit the row already states in words. Ended
            sessions are drained of colour: a session that is over should not be
            as vivid as one that is live. */}
        <span className={cn("relative mt-0.5 shrink-0", ended && "opacity-45 saturate-[0.35]")}>
          <BrowserMark name={device.browser} size={34} />
          <span
            className={cn(
              "absolute -bottom-1 -right-1 grid h-[17px] w-[17px] place-items-center rounded-full",
              "border border-border bg-card text-muted-foreground"
            )}
          >
            <Shape className="h-[10px] w-[10px]" strokeWidth={2.2} />
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p
              className={cn(
                "min-w-0 truncate text-[13.5px] font-semibold leading-[19px]",
                ended ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {describeDevice(device)}
            </p>
            <span className="flex shrink-0 items-center gap-2">
              <Status device={device} />
              {/* An icon, on the row it ends. It is one session out of eight,
                  and walking to a red button at the bottom of the card to end
                  one of them means picking it out of a list twice — once to
                  decide, once to name. Quiet until pointed at, because a red
                  control on every row would read as eight problems. */}
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  disabled={signingOut}
                  title={`Sign out ${describeDevice(device)}`}
                  aria-label={`Sign out ${describeDevice(device)}`}
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground",
                    "hover:bg-danger-solid/10 hover:text-danger",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40",
                    "disabled:pointer-events-none disabled:opacity-50"
                  )}
                >
                  {signingOut ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </span>
          </div>

          {/* Where from, on one line: system, place, address. The flag does a
              location pin's job and more — it is what makes a sign-in from the
              wrong country obvious without reading the line. */}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-[17px] text-muted-foreground">
            {device.os && (
              <>
                <span className="flex items-center gap-1 text-foreground/85">
                  <OsMark name={device.os} size={13} />
                  {device.os}
                </span>
                <span aria-hidden>·</span>
              </>
            )}
            {device.countryCode && (
              <img
                src={`/img/flag/${device.countryCode.toLowerCase()}.webp`}
                alt={device.country || device.countryCode}
                title={device.country || device.countryCode}
                loading="lazy"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                style={{ width: 15, height: 11 }}
                className="shrink-0 rounded-[2px] object-cover"
              />
            )}
            <span>{describePlace(device)}</span>
            <span aria-hidden>·</span>
            {/* The address in full. A masked IP tells the account holder nothing
                and hides the one value they could hand to support. */}
            <span className="font-mono">{device.ip || "IP unknown"}</span>
          </p>

          {/* Both times, each said with the word that says which one it is.
          
              "Last seen" used to appear only on sessions that had ended, which
              is the one case where it matters least — the row already says the
              session is over. On a live device it is the useful half: "Active
              now" means the session key is still valid, and a device that has
              been valid since Tuesday but not seen since Tuesday is exactly the
              one worth a second look. They are recorded when a device announces
              itself — at sign-in, and when this page is opened. */}
          <p className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-[11.5px] leading-[16px] text-muted-foreground/80">
            <span>
              {device.signedInAt ? `Signed in ${absolute(device.signedInAt)}` : "Sign-in time unknown"}
            </span>
            {/* Against the card's right edge, under the status it belongs with:
                when the session started reads forward from the left with the
                rest of the details, and when it was last used is the answer to
                the question the status asks. A dot between them put two
                unrelated times in one sentence. */}
            {device.lastSeenAt && (
              <span className="ml-auto whitespace-nowrap">Last seen {when(device.lastSeenAt)}</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Live, this one, or over — in a dot and a word.
 *
 * A dot rather than the filled green pills this card used to wear one of per
 * row: on an account signed in from three devices that was six green blocks,
 * every one of them reporting the ordinary case. A 6px dot says the same thing
 * and lets the name beside it stay the loudest thing in the card.
 */
function Status({ device }: { device: Device }) {
  const text = device.active
    ? device.current
      ? "This device"
      : "Active now"
    : device.endedReason === "revoked"
      ? "Signed out"
      : "Session ended";

  const tone = device.current ? "bg-brand" : device.active ? "bg-verified" : "bg-muted-foreground/50";

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11.5px] font-medium leading-[19px]",
        device.current ? "text-brand" : device.active ? "text-verified" : "text-muted-foreground"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone)} aria-hidden />
      {text}
    </span>
  );
}

/** "Chrome on Windows 10/11" — and only the halves that are actually known. */
/**
 * The headline for a row: browser, version and system.
 *
 * `browser` now carries its major version from the server — "Chrome 140" —
 * because that is the part of a user-agent string that is both true and worth
 * reading. The system does not get a version, and cannot:
 *
 *  - macOS is frozen at "10_15_7" in every modern browser's UA whatever the
 *    machine is running, so a number here would be a confident lie.
 *  - Windows NT 10.0 is both Windows 10 and Windows 11, so the server says
 *    "Windows 10/11" rather than guessing.
 *
 * iOS and Android do report honestly, and those come through with their
 * versions already attached.
 */
function describeDevice(d: Device): string {
  if (!d.browser) return d.deviceName || "Unrecognised device";
  /* The machine in brackets after the browser — "Chrome 140 (Mac)". It is the
     half of the headline that identifies the *thing*: which Chrome, of the
     several signed in. It is shown even where the system below repeats it —
     "Chrome (Mac)" over "macOS" is a little redundant, and it is still the
     line somebody reads to tell one session from another. */
  return d.deviceName ? `${d.browser} (${d.deviceName})` : d.browser;
}

function describePlace(d: Device): string {
  /* City-states repeat themselves — Lagos is in Lagos, Delhi is in Delhi — and
     "Lagos, Lagos, Nigeria" reads like a bug. Duplicates are dropped rather
     than printed. */
  const seen = new Set<string>();
  const parts = [d.city, d.region, d.country].filter((part): part is string => {
    if (!part) return false;
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return parts.length ? parts.join(", ") : "Location unavailable";
}

/** Relative for anything recent, because "3 minutes ago" is the useful form. */
function when(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return absolute(iso);
}

/**
 * A date somebody can check against their own memory.
 *
 * "Since 1 Sept" is a date with the useful half removed. Somebody scanning this
 * list is asking "was that me?", and the answer usually turns on the time — you
 * remember signing in this morning, not that it was the first of the month. So
 * both are shown, and the day is named: "Mon, 1 Sept at 6:19 am" is checkable
 * against a memory in a way that "1 Sept" is not.
 *
 * The year appears only when it is not this one, because a year on every row of
 * a list that is almost entirely recent is noise that pushes the time off the
 * end of the line.
 */
function absolute(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  const day = date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

export default SignInActivity;
