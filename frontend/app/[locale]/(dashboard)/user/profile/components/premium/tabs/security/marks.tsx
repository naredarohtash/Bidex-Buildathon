"use client";

/**
 * The coloured marks on the Security page.
 *
 * The page was entirely grey: five lucide glyphs at `--muted-foreground`, so a
 * list of devices and a list of second factors looked like the same list, and
 * nothing on a page about protecting an account read as protected.
 *
 * These are drawn rather than fetched — nothing to load, and both themes are
 * correct without two sets of files. The rule they follow is that colour is
 * identity, not decoration: a browser gets its own colours because that is how
 * somebody recognises which device is theirs at a glance, and everything else
 * on the page stays in the theme's own palette.
 */

import { memo, type ReactNode } from "react";

/* Google's brand four, used only where a Google product is being named. */
const G_BLUE = "#4285F4";
const G_RED = "#EA4335";
const G_YELLOW = "#FBBC04";
const G_GREEN = "#34A853";

/**
 * The authenticator-app mark.
 *
 * This is a rendition of Google Authenticator's asterisk in Google's four
 * brand colours, not a copy of the shipped asset — I do not have the file, and
 * a hand-traced trademark that is slightly wrong is worse than one that is
 * plainly a rendition. It reads as the app it names, which is what the row
 * needs it to do. Drop the official SVG into `/public/img/` and swap this out
 * if you would rather ship the real one.
 */
export const AuthenticatorMark = memo(function AuthenticatorMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <g strokeWidth="3" strokeLinecap="round">
        <path d="M12 3.5v6.2" stroke={G_BLUE} />
        <path d="M12 14.3v6.2" stroke={G_GREEN} />
        <path d="M4.6 7.8l5.4 3.1" stroke={G_RED} />
        <path d="M14 13.1l5.4 3.1" stroke={G_GREEN} />
        <path d="M4.6 16.2l5.4-3.1" stroke={G_YELLOW} />
        <path d="M14 10.9l5.4-3.1" stroke={G_BLUE} />
      </g>
      <circle cx="12" cy="12" r="2.4" fill={G_RED} />
    </svg>
  );
});

/**
 * The email-code mark: an envelope with the code inside it, because the code
 * arriving is the point of the row and a plain envelope is just "email".
 */
export const EmailCodeMark = memo(function EmailCodeMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="3" fill="#3b82f6" fillOpacity="0.16" />
      <path
        d="M3.4 7.6l7.5 5a2 2 0 002.2 0l7.5-5"
        stroke="#3b82f6" strokeWidth="1.7" strokeLinecap="round" fill="none"
      />
      <rect x="2" y="5" width="20" height="14" rx="3" stroke="#3b82f6" strokeWidth="1.7" />
      <rect x="7.5" y="14.4" width="9" height="3.2" rx="1.6" fill="#f59e0b" />
    </svg>
  );
});

/* ── devices ──────────────────────────────────────────────────────────── */

type Browser =
  | "chrome"
  | "edge"
  | "firefox"
  | "safari"
  | "brave"
  | "opera"
  | "vivaldi"
  | "samsung"
  | "duckduckgo"
  | "yandex"
  | "tor"
  | "ie"
  | "other";

/**
 * What the user-agent string was called, reduced to something drawable.
 *
 * The order is the whole trick, and it is the same one the server's parser
 * uses: every Chromium browser carries "Chrome" in its name or its agent, and
 * Chrome itself carries "Safari", so the impostors have to be tested first.
 * Reading a raw User-Agent works as well as reading the server's parsed name
 * ("Edge 140"), because every token either matches or is checked for.
 */
export function browserOf(name?: string | null): Browser {
  const s = String(name || "").toLowerCase();
  if (s.includes("brave")) return "brave";
  if (s.includes("edge") || s.includes("edg/") || s.includes("edgios") || s.includes("edga/")) return "edge";
  if (s.includes("opera") || s.includes("opr/")) return "opera";
  if (s.includes("vivaldi")) return "vivaldi";
  if (s.includes("yandex") || s.includes("yabrowser")) return "yandex";
  if (s.includes("duckduckgo") || s.includes("ddg/")) return "duckduckgo";
  if (s.includes("tor browser") || s.includes("torbrowser")) return "tor";
  if (s.includes("samsung")) return "samsung";
  if (s.includes("firefox") || s.includes("fxios")) return "firefox";
  if (s.includes("msie") || s.includes("trident") || s.includes("internet explorer")) return "ie";
  if (s.includes("chrome") || s.includes("chromium") || s.includes("crios")) return "chrome";
  if (s.includes("safari")) return "safari";
  return "other";
}

/* The silhouettes below come from the Simple Icons set (the icon data is CC0),
   which draws each browser's own mark on the same 24×24 box these glyphs use.
   They are inlined rather than fetched: nothing to load, no second set of
   files for the other theme, and no request that says which browser a person
   signs in with. Colour is applied here, because the set ships one flat path
   per icon and a browser is recognised by its colour as much as its shape. */
const BRAVE_LION = "M15.68 0l2.096 2.38s1.84-.512 2.709.358c.868.87 1.584 1.638 1.584 1.638l-.562 1.381.715 2.047s-2.104 7.98-2.35 8.955c-.486 1.919-.818 2.66-2.198 3.633-1.38.972-3.884 2.66-4.293 2.916-.409.256-.92.692-1.38.692-.46 0-.97-.436-1.38-.692a185.796 185.796 0 01-4.293-2.916c-1.38-.973-1.712-1.714-2.197-3.633-.247-.975-2.351-8.955-2.351-8.955l.715-2.047-.562-1.381s.716-.768 1.585-1.638c.868-.87 2.708-.358 2.708-.358L8.321 0h7.36zm-3.679 14.936c-.14 0-1.038.317-1.758.69-.72.373-1.242.637-1.409.742-.167.104-.065.301.087.409.152.107 2.194 1.69 2.393 1.866.198.175.489.464.687.464.198 0 .49-.29.688-.464.198-.175 2.24-1.759 2.392-1.866.152-.108.254-.305.087-.41-.167-.104-.689-.368-1.41-.741-.72-.373-1.617-.69-1.757-.69zm0-11.278s-.409.001-1.022.206-1.278.46-1.584.46c-.307 0-2.581-.434-2.581-.434S4.119 7.152 4.119 7.849c0 .697.339.881.68 1.243l2.02 2.149c.192.203.59.511.356 1.066-.235.555-.58 1.26-.196 1.977.384.716 1.042 1.194 1.464 1.115.421-.08 1.412-.598 1.776-.834.364-.237 1.518-1.19 1.518-1.554 0-.365-1.193-1.02-1.413-1.168-.22-.15-1.226-.725-1.247-.95-.02-.227-.012-.293.284-.851.297-.559.831-1.304.742-1.8-.089-.495-.95-.753-1.565-.986-.615-.232-1.799-.671-1.947-.74-.148-.068-.11-.133.339-.175.448-.043 1.719-.212 2.292-.052.573.16 1.552.403 1.632.532.079.13.149.134.067.579-.081.445-.5 2.581-.541 2.96-.04.38-.12.63.288.724.409.094 1.097.256 1.333.256s.924-.162 1.333-.256c.408-.093.329-.344.288-.723-.04-.38-.46-2.516-.541-2.961-.082-.445-.012-.45.067-.579.08-.129 1.059-.372 1.632-.532.573-.16 1.845.009 2.292.052.449.042.487.107.339.175-.148.069-1.332.508-1.947.74-.615.233-1.476.49-1.565.986-.09.496.445 1.241.742 1.8.297.558.304.624.284.85-.02.226-1.026.802-1.247.95-.22.15-1.413.804-1.413 1.169 0 .364 1.154 1.317 1.518 1.554.364.236 1.355.755 1.776.834.422.079 1.08-.4 1.464-1.115.384-.716.039-1.422-.195-1.977-.235-.555.163-.863.355-1.066l2.02-2.149c.341-.362.68-.546.68-1.243 0-.697-2.695-3.96-2.695-3.96s-2.274.436-2.58.436c-.307 0-.972-.256-1.585-.461-.613-.205-1.022-.206-1.022-.206z";
const OPERA_O = "M8.051 5.238c-1.328 1.566-2.186 3.883-2.246 6.48v.564c.061 2.598.918 4.912 2.246 6.479 1.721 2.236 4.279 3.654 7.139 3.654 1.756 0 3.4-.537 4.807-1.471C17.879 22.846 15.074 24 12 24c-.192 0-.383-.004-.57-.014C5.064 23.689 0 18.436 0 12 0 5.371 5.373 0 12 0h.045c3.055.012 5.84 1.166 7.953 3.055-1.408-.93-3.051-1.471-4.81-1.471-2.858 0-5.417 1.42-7.14 3.654h.003zM24 12c0 3.556-1.545 6.748-4.002 8.945-3.078 1.5-5.946.451-6.896-.205 3.023-.664 5.307-4.32 5.307-8.74 0-4.422-2.283-8.075-5.307-8.74.949-.654 3.818-1.703 6.896-.205C22.455 5.25 24 8.445 24 12z";
const FIREFOX_FLAME = "M8.824 7.287c.008 0 .004 0 0 0zm-2.8-1.4c.006 0 .003 0 0 0zm16.754 2.161c-.505-1.215-1.53-2.528-2.333-2.943.654 1.283 1.033 2.57 1.177 3.53l.002.02c-1.314-3.278-3.544-4.6-5.366-7.477-.091-.147-.184-.292-.273-.446a3.545 3.545 0 01-.13-.24 2.118 2.118 0 01-.172-.46.03.03 0 00-.027-.03.038.038 0 00-.021 0l-.006.001a.037.037 0 00-.01.005L15.624 0c-2.585 1.515-3.657 4.168-3.932 5.856a6.197 6.197 0 00-2.305.587.297.297 0 00-.147.37c.057.162.24.24.396.17a5.622 5.622 0 012.008-.523l.067-.005a5.847 5.847 0 011.957.222l.095.03a5.816 5.816 0 01.616.228c.08.036.16.073.238.112l.107.055a5.835 5.835 0 01.368.211 5.953 5.953 0 012.034 2.104c-.62-.437-1.733-.868-2.803-.681 4.183 2.09 3.06 9.292-2.737 9.02a5.164 5.164 0 01-1.513-.292 4.42 4.42 0 01-.538-.232c-1.42-.735-2.593-2.121-2.74-3.806 0 0 .537-2 3.845-2 .357 0 1.38-.998 1.398-1.287-.005-.095-2.029-.9-2.817-1.677-.422-.416-.622-.616-.8-.767a3.47 3.47 0 00-.301-.227 5.388 5.388 0 01-.032-2.842c-1.195.544-2.124 1.403-2.8 2.163h-.006c-.46-.584-.428-2.51-.402-2.913-.006-.025-.343.176-.389.206-.406.29-.787.616-1.136.974-.397.403-.76.839-1.085 1.303a9.816 9.816 0 00-1.562 3.52c-.003.013-.11.487-.19 1.073-.013.09-.026.181-.037.272a7.8 7.8 0 00-.069.667l-.002.034-.023.387-.001.06C.386 18.795 5.593 24 12.016 24c5.752 0 10.527-4.176 11.463-9.661.02-.149.035-.298.052-.448.232-1.994-.025-4.09-.753-5.844z";
const VIVALDI_V = "M12 0C6.75 0 3.817 0 1.912 1.904.007 3.81 0 6.75 0 12s0 8.175 1.912 10.08C3.825 23.985 6.75 24 12 24c5.25 0 8.183 0 10.088-1.904C23.993 20.19 24 17.25 24 12s0-8.175-1.912-10.08C20.175.015 17.25 0 12 0zm-.168 3a9 9 0 016.49 2.648 9 9 0 010 12.704A9 9 0 1111.832 3zM7.568 7.496a1.433 1.433 0 00-.142.004A1.5 1.5 0 006.21 9.75l1.701 3c.93 1.582 1.839 3.202 2.791 4.822a1.417 1.417 0 001.41.75 1.5 1.5 0 001.223-.81l4.447-7.762A1.56 1.56 0 0018 8.768a1.5 1.5 0 10-2.828.914 2.513 2.513 0 01.256 1.119v.246a2.393 2.393 0 01-2.52 2.13 2.348 2.348 0 01-1.965-1.214c-.307-.51-.6-1.035-.9-1.553-.42-.72-.826-1.41-1.246-2.16a1.433 1.433 0 00-1.229-.754Z";
const DUCKDUCKGO_DUCK = "M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 23C5.925 23 1 18.074 1 12S5.926 1 12 1s11 4.925 11 11-4.925 11-11 11zm10.219-11c0 4.805-3.317 8.833-7.786 9.925-.27-.521-.53-1.017-.749-1.438.645.249 1.93.718 2.208.615.376-.144.282-3.149-.14-3.245-.338-.075-1.632.837-2.141 1.209l.034.156c.078.397.144.993.03 1.247-.001.004-.002.01-.004.013a.218.218 0 0 1-.068.088c-.284.188-1.081.284-1.503.188a.516.516 0 0 1-.064-.02c-.694.396-2.01 1.109-2.25.971-.329-.188-.377-2.676-.329-3.288.035-.46 1.653.286 2.442.679.174-.163.602-.272.98-.31-.57-1.389-.99-2.977-.733-4.105 0 .002.002.002.002.002.356.248 2.73 1.05 3.91 1.027 1.18-.024 3.114-.743 2.903-1.323-.212-.58-2.135.51-4.142.324-1.486-.138-1.748-.804-1.42-1.29.414-.611 1.168.116 2.411-.256 1.245-.371 2.987-1.035 3.632-1.397 1.494-.833-.625-1.177-1.125-.947-.474.22-2.123.637-2.889.82.428-1.516-.603-4.149-1.757-5.3-.376-.376-.951-.612-1.603-.736-.25-.344-.654-.671-1.225-.977a5.772 5.772 0 0 0-3.595-.584l-.024.004-.034.004.004.002c-.148.028-.237.08-.357.098.148.016.705.276 1.057.418-.174.068-.412.108-.596.184a.828.828 0 0 0-.204.056c-.173.08-.303.375-.3.515.84-.086 2.082-.026 2.991.246-.644.09-1.235.258-1.661.482-.016.008-.03.018-.048.028-.054.02-.106.042-.152.066-1.367.72-1.971 2.405-1.611 4.424.323 1.824 1.665 8.088 2.29 11.064-3.973-1.4-6.822-5.186-6.822-9.639C1.781 6.356 6.356 1.781 12 1.781S22.219 6.356 22.219 12zM9.095 9.581a.758.758 0 1 0 0 1.516.758.758 0 0 0 0-1.516zm.338.702a.196.196 0 1 1 0-.392.196.196 0 0 1 0 .392zm4.724-1.043a.65.65 0 1 0 0 1.299.65.65 0 0 0 0-1.3zm.29.601a.168.168 0 1 1 0-.336.168.168 0 0 1 0 .336zM9.313 8.146s-.571-.26-1.125.09c-.554.348-.534.704-.534.704s-.294-.656.49-.978c.786-.32 1.17.184 1.17.184zm5.236-.052s-.41-.234-.73-.23c-.654.008-.831.296-.831.296s.11-.688.945-.55a.84.84 0 0 1 .616.484z";
const TOR_ONION = "M12 21.82v-1.46A8.36 8.36 0 0020.36 12 8.36 8.36 0 0012 3.64V2.18A9.83 9.83 0 0121.82 12 9.83 9.83 0 0112 21.82zm0-5.09A4.74 4.74 0 0016.73 12 4.74 4.74 0 0012 7.27V5.82A6.17 6.17 0 0118.18 12 6.17 6.17 0 0112 18.18zm0-7.27A2.54 2.54 0 0114.55 12 2.54 2.54 0 0112 14.54zM0 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0 12 12 0 000 12z";

/* Those silhouettes fill the whole box. The marks on this page are built on a
   10-radius circle — Chrome's, below — so a full-box drawing is scaled down to
   sit on the same circle instead of standing a sixth taller than its
   neighbours in the list. */
function Fit({ k = 10 / 12, children }: { k?: number; children: ReactNode }) {
  return <g transform={`translate(12 12) scale(${k}) translate(-12 -12)`}>{children}</g>;
}

/**
 * The browser a session was opened in, in that browser's own colours.
 *
 * Every row on the sign-in list said "Chrome on macOS" beside the same grey
 * laptop glyph, so telling one line from another meant reading all of them.
 * These are the one place on the page where a colour is not the theme's,
 * because the colour *is* the identifying fact.
 *
 * Edge, Samsung Internet, Yandex and Internet Explorer are drawn here rather
 * than taken from the icon set — Microsoft, Samsung and Yandex all ask that
 * their marks not be redistributed, so the set does not carry them. Those four
 * are renditions: the right silhouette in the right colours, close enough to
 * recognise and not passed off as the shipped asset.
 */
export const BrowserMark = memo(function BrowserMark({
  name,
  size = 22,
}: {
  name?: string | null;
  size?: number;
}) {
  const kind = browserOf(name);
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none" as const };

  if (kind === "chrome") {
    /* Three wedges drawn to the middle, then the ring and the disc over them.

       This was three arcs that each stopped at their own inner boundary, and
       the arithmetic in those boundaries was wrong in every one of them: two
       carried a radius the endpoints did not sit on, so the renderer scaled
       them to fit and put the curve somewhere else, and each inner edge left
       the outer arc at the wrong angle — the yellow closed at 30° after its
       arc had reached 90°. What that produced was a mark with a white bite
       taken out of it and a lopsided ring, which is the "not the right logo"
       this is fixing.

       A wedge that runs all the way to the centre cannot leave a gap, whatever
       is painted on top of it. Every seam under r=5.2 is covered by the white
       disc, so the only geometry that has to be right is the three outer arcs
       — each 120°, meeting at 6, 10 and 2 o'clock, which is where Chrome's
       own segments meet.

       Points are on the r=10 circle about (12,12): 12±10·cos θ, 12±10·sin θ,
       with y running down. `sweep-flag: 1` is clockwise on screen. */
    return (
      <svg {...common} aria-hidden>
        {/* 10 o'clock over the top to 2 o'clock */}
        <path d="M12 12L3.34 7A10 10 0 0 1 20.66 7Z" fill={G_RED} />
        {/* 2 o'clock down the right to 6 */}
        <path d="M12 12L20.66 7A10 10 0 0 1 12 22Z" fill={G_YELLOW} />
        {/* 6 o'clock up the left to 10 */}
        <path d="M12 12L12 22A10 10 0 0 1 3.34 7Z" fill={G_GREEN} />
        {/* The blue is about 44% of the mark's width in the real logo, inside
            a thin white ring. It was 35% inside a ring twice this thick, which
            reads as a small blue dot in a white hole rather than as Chrome. */}
        <circle cx="12" cy="12" r="5.2" fill="#ffffff" />
        <circle cx="12" cy="12" r="4.5" fill={G_BLUE} />
      </svg>
    );
  }

  if (kind === "edge") {
    /* Edge is a sphere with a wave curling out of its lower left — not the two
       loose teal blobs that stood here, which shared no edge and left the
       background showing between them.

       The two shapes are cut from one boundary: the blue runs the outer circle
       from 6 o'clock the long way round and then hooks back in, and the teal
       picks up that hook line exactly and returns along the circle. Written as
       one shared curve they tile, so there is no seam to misalign however the
       mark is scaled. */
    return (
      <svg {...common} aria-hidden>
        <defs>
          <linearGradient id="bx-edge-body" x1="0.15" y1="0.9" x2="0.9" y2="0.15">
            <stop offset="0" stopColor="#0B4A9B" />
            <stop offset="0.55" stopColor="#1178C4" />
            <stop offset="1" stopColor="#41ACE9" />
          </linearGradient>
          <linearGradient id="bx-edge-tail" x1="0.05" y1="0.95" x2="0.95" y2="0.2">
            <stop offset="0" stopColor="#5CE18C" />
            <stop offset="0.5" stopColor="#2FC5B6" />
            <stop offset="1" stopColor="#35C1F1" />
          </linearGradient>
        </defs>
        <path
          d="M12 22A10 10 0 0 0 21.9 10.4C21.5 5.7 17.3 2 12.2 2C7.6 2 4 5 4 8.7C4 11.4 6.2 13.5 9.2 13.5C11.2 13.5 12.8 12.7 13.6 11.4C12.4 14.1 9.6 15.8 6.4 15.8C4.6 15.8 3.1 15.3 2.1 14.5C3.6 18.8 7.4 22 12 22Z"
          fill="url(#bx-edge-body)"
        />
        <path
          d="M2.1 14.5C3.1 15.3 4.6 15.8 6.4 15.8C9.6 15.8 12.4 14.1 13.6 11.4C12.8 12.7 11.2 13.5 9.2 13.5C6.2 13.5 4 11.4 4 8.7C4 5 7.6 2 12.2 2C6.3 3 2 7.4 2 12.5C2 13.2 2.05 13.9 2.1 14.5Z"
          fill="url(#bx-edge-tail)"
        />
      </svg>
    );
  }

  if (kind === "firefox") {
    /* The flame is one path with the fox knocked out of it, so the fox takes
       whatever is behind the mark — white on the light theme, near-black on
       the dark one. Firefox's fox is neither: it is a deep indigo in both. The
       disc under the flame fills that hole and is covered everywhere else. */
    return (
      <svg {...common} aria-hidden>
        <defs>
          <linearGradient id="bx-ff-flame" x1="0.5" y1="0.05" x2="0.5" y2="1">
            <stop offset="0" stopColor="#FFF44F" />
            <stop offset="0.28" stopColor="#FF980E" />
            <stop offset="0.62" stopColor="#FF3647" />
            <stop offset="1" stopColor="#9059FF" />
          </linearGradient>
        </defs>
        <Fit k={11 / 12}>
          <circle cx="11.6" cy="13" r="6.6" fill="#2B1A5E" />
          <path d={FIREFOX_FLAME} fill="url(#bx-ff-flame)" />
        </Fit>
      </svg>
    );
  }

  if (kind === "safari") {
    /* A compass: the blue rim, a pale face, and the needle's two halves
       meeting at the centre — red to the north-east, silver to the south-west,
       which is the one orientation the mark is ever drawn in. */
    return (
      <svg {...common} aria-hidden>
        <defs>
          <linearGradient id="bx-safari-rim" x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0" stopColor="#26D7FF" />
            <stop offset="1" stopColor="#0A66E8" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="10" fill="url(#bx-safari-rim)" />
        <circle cx="12" cy="12" r="8.2" fill="#F7FAFC" />
        <path d="M17.1 6.9L12.9 13L11 11.1Z" fill="#F5453A" />
        <path d="M6.9 17.1L11.1 11L13 12.9Z" fill="#D5DDE6" />
      </svg>
    );
  }

  if (kind === "brave") {
    return (
      <svg {...common} aria-hidden>
        <Fit k={11 / 12}>
          <path d={BRAVE_LION} fill="#FB542B" />
        </Fit>
      </svg>
    );
  }

  if (kind === "opera") {
    return (
      <svg {...common} aria-hidden>
        <Fit>
          <path d={OPERA_O} fill="#FF1B2D" />
        </Fit>
      </svg>
    );
  }

  if (kind === "vivaldi") {
    return (
      <svg {...common} aria-hidden>
        <Fit>
          <path d={VIVALDI_V} fill="#EF3939" />
        </Fit>
      </svg>
    );
  }

  if (kind === "duckduckgo") {
    return (
      <svg {...common} aria-hidden>
        <Fit>
          <path d={DUCKDUCKGO_DUCK} fill="#DE5833" />
        </Fit>
      </svg>
    );
  }

  if (kind === "tor") {
    return (
      <svg {...common} aria-hidden>
        <Fit>
          <path d={TOR_ONION} fill="#7D4698" />
        </Fit>
      </svg>
    );
  }

  if (kind === "samsung") {
    /* Samsung Internet is a planet with its ring — the ring crosses the disc
       rather than sitting behind it, so it is stroked over the top. */
    return (
      <svg {...common} aria-hidden>
        <defs>
          <linearGradient id="bx-samsung" x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#8A5CF6" />
            <stop offset="1" stopColor="#1F6FEB" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="9.6" fill="url(#bx-samsung)" />
        <ellipse
          cx="12" cy="12" rx="11.4" ry="4.3"
          transform="rotate(-27 12 12)"
          stroke="#ffffff" strokeWidth="1.5" fill="none"
        />
      </svg>
    );
  }

  if (kind === "yandex") {
    /* Yandex's own red and the Я it is known by, drawn as a stroke so it holds
       its weight at 14px as well as at 34. */
    return (
      <svg {...common} aria-hidden>
        <circle cx="12" cy="12" r="10" fill="#FC3F1D" />
        <path
          d="M13.2 19.2V5.6h-1.4c-1.9 0-3 1-3 2.6 0 1.4.6 2.1 1.9 3l1 .7-3 7.3"
          stroke="#ffffff" strokeWidth="1.7" strokeLinejoin="round" fill="none"
        />
      </svg>
    );
  }

  if (kind === "ie") {
    /* Still turns up on old machines, and a session nobody recognises is the
       one this page exists for. The gold ring sits over the e, as it does in
       the mark. */
    return (
      <svg {...common} aria-hidden>
        <circle cx="12" cy="12" r="8.6" fill="#1EBBEE" />
        <path
          d="M7.4 13.2h9.4c.4-3-1.6-5.4-4.5-5.4-2.7 0-4.9 2.1-4.9 4.9 0 2.8 2.1 4.8 4.8 4.8 2 0 3.6-1 4.4-2.6"
          stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" fill="none"
        />
        <path
          d="M4.4 8.6C2.6 9.9 1.6 11.4 2.1 12.3c.8 1.4 4.6.9 9-1.1 4.4-2 7.4-4.6 6.7-6-.4-.8-2-1-4.1-.6"
          stroke="#F5A623" strokeWidth="1.7" strokeLinecap="round" fill="none"
        />
      </svg>
    );
  }

  return (
    <svg {...common} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#64748b" fillOpacity="0.2" />
      <circle cx="12" cy="12" r="9.2" stroke="#94a3b8" strokeWidth="1.5" />
      <path d="M2.8 12h18.4M12 2.8c2.6 2.6 2.6 15.8 0 18.4M12 2.8c-2.6 2.6-2.6 15.8 0 18.4" stroke="#94a3b8" strokeWidth="1.3" fill="none" />
    </svg>
  );
});

/* ── operating systems ────────────────────────────────────────────────── */

type Os = "mac" | "ios" | "windows" | "android" | "chromeos" | "linux" | "other";

export function osOf(name?: string | null): Os {
  const s = String(name || "").toLowerCase();
  if (s.includes("ios")) return "ios";
  if (s.includes("mac")) return "mac";
  if (s.includes("windows")) return "windows";
  if (s.includes("android")) return "android";
  if (s.includes("chromeos") || s.includes("cros")) return "chromeos";
  if (s.includes("linux") || s.includes("ubuntu")) return "linux";
  return "other";
}

/**
 * The system a session is running on.
 *
 * Apple's mark is drawn in `currentColor` because that is how Apple's own
 * guidance has it used and how every OS list on the internet renders it —
 * a monochrome silhouette. Windows and Android carry their own colours,
 * because those are what people recognise them by. Anything unknown gets a
 * neutral glyph rather than a wrong logo.
 */
export const OsMark = memo(function OsMark({ name, size = 14 }: { name?: string | null; size?: number }) {
  const kind = osOf(name);
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none" as const };

  if (kind === "mac" || kind === "ios") {
    return (
      <svg {...common} aria-hidden>
        <path
          d="M16.4 12.6c0-2.2 1.8-3.3 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.4s-2.3-.9-2.3-3.4z"
          fill="currentColor"
        />
        <path d="M14.3 6.2c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.5.6-1 1.6-.9 2.6 1 .1 2-.5 2.6-1.2z" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "windows") {
    return (
      <svg {...common} aria-hidden>
        <path d="M3 5.9l7.6-1v7.3H3z" fill="#0F8CE9" />
        <path d="M11.5 4.7L21 3.4v8.8h-9.5z" fill="#0F8CE9" />
        <path d="M3 13.1h7.6v7.3L3 19.1z" fill="#0F8CE9" />
        <path d="M11.5 13.1H21v8.8l-9.5-1.3z" fill="#0F8CE9" />
      </svg>
    );
  }
  if (kind === "android") {
    return (
      <svg {...common} aria-hidden>
        <path
          d="M5 15.5c0-3.9 3.1-7 7-7s7 3.1 7 7z"
          fill="#3DDC84"
        />
        <path d="M7.4 6l1.4 2.3M16.6 6l-1.4 2.3" stroke="#3DDC84" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9.4" cy="12.4" r="1" fill="#0b1220" />
        <circle cx="14.6" cy="12.4" r="1" fill="#0b1220" />
      </svg>
    );
  }
  if (kind === "chromeos") {
    return <BrowserMark name="chrome" size={size} />;
  }
  if (kind === "linux") {
    return (
      <svg {...common} aria-hidden>
        <ellipse cx="12" cy="13.5" rx="5.4" ry="7" fill="#3b4252" />
        <ellipse cx="12" cy="15.5" rx="3.4" ry="4.6" fill="#eceff4" />
        <circle cx="10" cy="9.4" r="1.1" fill="#eceff4" />
        <circle cx="14" cy="9.4" r="1.1" fill="#eceff4" />
        <circle cx="10" cy="9.5" r="0.5" fill="#2e3440" />
        <circle cx="14" cy="9.5" r="0.5" fill="#2e3440" />
        <path d="M10.9 11.4c.6-.7 1.6-.7 2.2 0l-1.1 1z" fill="#f0a30a" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden>
      <rect x="3" y="5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 20h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
});

export default BrowserMark;
