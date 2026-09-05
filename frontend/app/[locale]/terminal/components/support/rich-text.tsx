"use client";

/**
 * Formatting for support messages — bold, italic, code, links and lists —
 * without ever putting HTML on the wire.
 *
 * ── Why not a rich-text editor ───────────────────────────────────────────
 *
 * The panel this workspace replaced had one: a `contenteditable` with a
 * bold/italic/underline toolbar whose `innerHTML` was posted as the message
 * body and rendered back through `dangerouslySetInnerHTML`. That is
 * agent-supplied markup injected into the page of an authenticated trading
 * session, and it is the single worst defect the old panel had.
 *
 * The fix is not to drop formatting — people writing to support genuinely
 * need to emphasise an amount or paste a reference — it is to change what
 * travels. Messages stay **plain text** carrying Markdown markers, and this
 * file turns those markers into React elements. Nothing is ever parsed as
 * HTML, so there is no sanitiser to get wrong and no attribute for a payload
 * to hide in: the worst a hostile message can do is render as literal text.
 *
 * It also survives the other end. An agent's console shows message text
 * verbatim, and `**250 USDT**` is legible; a blob of `<p><strong>` is not.
 *
 * ── The subset ───────────────────────────────────────────────────────────
 *
 * Deliberately small — the five things a support message actually uses:
 *
 *     **bold**   _italic_   `code`   [label](https://…)   - bullet
 *
 * A blank line starts a paragraph. Everything else is text. Unmatched markers
 * stay as they were typed, which is the right way to fail: someone writing
 * `2 * 3 * 4` gets what they wrote.
 */

import { memo } from "react";
import { cn } from "@/lib/utils";

/* ── Inline ─────────────────────────────────────────────────────────────── */

/* Order matters: code first, so markers inside a span of code are left alone,
   and bold before italic, so `**x**` is not read as an italic `*` wrapping
   `*x*`. Each pattern requires a non-space next to the marker, which is what
   stops a stray asterisk in prose from opening a span that never closes. */
const INLINE = [
  { kind: "code" as const, re: /`([^`\n]+)`/ },
  { kind: "bold" as const, re: /\*\*(?=\S)([\s\S]*?\S)\*\*/ },
  { kind: "bold" as const, re: /__(?=\S)([\s\S]*?\S)__/ },
  { kind: "italic" as const, re: /\*(?=\S)([^*\n]*?\S)\*/ },
  { kind: "italic" as const, re: /_(?=\S)([^_\n]*?\S)_/ },
];

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/;

/**
 * Only ever `http:` and `https:`.
 *
 * `javascript:` in an href is the one way a link can still execute something,
 * and it is exactly what a Markdown renderer is expected to forget. Parsed
 * with `URL` rather than matched with a regex, because `java\nscript:` and
 * `JaVaScRiPt:` both defeat the obvious pattern and neither defeats a parser.
 */
function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let rest = text;
  let n = 0;

  while (rest) {
    /* Whichever marker comes first in what is left. Scanning for the earliest
       match rather than applying the patterns in turn is what keeps nesting
       order out of it — a bold span later in the line cannot swallow an
       earlier link. */
    let best: { at: number; len: number; node: React.ReactNode } | null = null;

    const link = LINK.exec(rest);
    if (link) {
      const href = safeHref(link[2]);
      best = {
        at: link.index,
        len: link[0].length,
        node: href ? (
          <a
            key={`${keyPrefix}-l${n}`}
            href={href}
            target="_blank"
            rel="noreferrer noopener nofollow"
            className="underline underline-offset-2 hover:opacity-80"
          >
            {link[1]}
          </a>
        ) : (
          /* A link we will not follow is shown as the words it was given.
             Silently dropping it would hide that anything was there. */
          <span key={`${keyPrefix}-l${n}`}>{link[1]}</span>
        ),
      };
    }

    for (const { kind, re } of INLINE) {
      const m = re.exec(rest);
      if (!m) continue;
      if (best && m.index >= best.at) continue;
      const inner = m[1];
      best = {
        at: m.index,
        len: m[0].length,
        node:
          kind === "code" ? (
            <code
              key={`${keyPrefix}-c${n}`}
              className="rounded bg-current/10 px-1 py-[1px] font-mono text-[0.92em]"
            >
              {inner}
            </code>
          ) : kind === "bold" ? (
            <strong key={`${keyPrefix}-b${n}`} className="font-semibold">
              {inline(inner, `${keyPrefix}-b${n}`)}
            </strong>
          ) : (
            <em key={`${keyPrefix}-i${n}`} className="italic">
              {inline(inner, `${keyPrefix}-i${n}`)}
            </em>
          ),
      };
    }

    if (!best) {
      out.push(rest);
      break;
    }
    if (best.at > 0) out.push(rest.slice(0, best.at));
    out.push(best.node);
    rest = rest.slice(best.at + best.len);
    n++;
  }

  return out;
}

/* ── Blocks ─────────────────────────────────────────────────────────────── */

const BULLET = /^\s*[-*]\s+(.*)$/;

/**
 * One message, rendered.
 *
 * `whitespace-pre-wrap` is deliberately not used: the blocks are built here,
 * so a run of blank lines becomes a paragraph gap rather than four empty
 * lines, and a wrapped bullet keeps its hanging indent.
 */
export const RichText = memo(function RichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const key = `p${blocks.length}`;
    blocks.push(
      <p key={key} className="whitespace-pre-wrap break-words">
        {inline(paragraph.join("\n"), key)}
      </p>
    );
    paragraph = [];
  };
  const flushBullets = () => {
    if (!bullets.length) return;
    const key = `u${blocks.length}`;
    blocks.push(
      <ul key={key} className="list-outside list-disc space-y-0.5 pl-4">
        {bullets.map((b, i) => (
          <li key={i} className="break-words">
            {inline(b, `${key}-${i}`)}
          </li>
        ))}
      </ul>
    );
    bullets = [];
  };

  for (const line of lines) {
    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1]);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushBullets();
      continue;
    }
    flushBullets();
    paragraph.push(line);
  }
  flushParagraph();
  flushBullets();

  return <div className={cn("space-y-2", className)}>{blocks}</div>;
});

/* ── Writing it ─────────────────────────────────────────────────────────── */

export type MarkKind = "bold" | "italic" | "code" | "bullet" | "link";

/**
 * Apply a mark to a textarea's selection and hand back the new value and
 * where the caret should land.
 *
 * Pure, so the composer stays a controlled component and the behaviour can be
 * reasoned about without a DOM. Toggling is real: pressing bold on text that
 * is already bold takes the markers off, which is what every editor does and
 * what makes the buttons feel like state rather than like insert commands.
 */
export function applyMark(
  value: string,
  start: number,
  end: number,
  kind: MarkKind
): { value: string; start: number; end: number } {
  const selected = value.slice(start, end);

  if (kind === "bullet") {
    /* Whole lines, always — a bullet is a property of a line, and applying it
       to half of one would produce a marker in the middle of a sentence. */
    const from = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const toIndex = value.indexOf("\n", end);
    const to = toIndex === -1 ? value.length : toIndex;
    const block = value.slice(from, to);
    const allBulleted = block.split("\n").every((l) => !l.trim() || BULLET.test(l));
    const next = block
      .split("\n")
      .map((l) => (allBulleted ? l.replace(/^(\s*)[-*]\s+/, "$1") : l.trim() ? `- ${l}` : l))
      .join("\n");
    return { value: value.slice(0, from) + next + value.slice(to), start: from, end: from + next.length };
  }

  const wrap = kind === "bold" ? "**" : kind === "italic" ? "_" : "`";

  if (kind === "link") {
    const label = selected || "label";
    const inserted = `[${label}](https://)`;
    return {
      value: value.slice(0, start) + inserted + value.slice(end),
      /* Caret inside the parentheses, after `https://`, which is where the one
         thing still missing has to be typed. */
      start: start + label.length + 3 + 8,
      end: start + label.length + 3 + 8,
    };
  }

  const before = value.slice(Math.max(0, start - wrap.length), start);
  const after = value.slice(end, end + wrap.length);
  if (before === wrap && after === wrap) {
    return {
      value: value.slice(0, start - wrap.length) + selected + value.slice(end + wrap.length),
      start: start - wrap.length,
      end: end - wrap.length,
    };
  }

  const inserted = `${wrap}${selected}${wrap}`;
  return {
    value: value.slice(0, start) + inserted + value.slice(end),
    /* An empty selection leaves the caret between the markers, ready to type
       the thing being emphasised. */
    start: start + wrap.length,
    end: start + wrap.length + selected.length,
  };
}
