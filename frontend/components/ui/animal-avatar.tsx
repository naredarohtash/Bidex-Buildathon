"use client";

/**
 * The picture a trader gets when they have not uploaded one.
 *
 * The fallback used to be two grey initials on `bg-muted`, which down twenty-
 * five rows is twenty-five grey discs — no help in finding your own row, and
 * the one thing on the leaderboard that looked unfinished.
 *
 * The artwork is the set supplied for this, sliced out of one 1024px sheet:
 * fifty-one illustrated animal portraits, each already circular and each
 * carrying its own background. See `docs/avatars.md` for how the sheet was cut
 * and how to replace it.
 *
 * Two consequences of the background being part of the drawing, both of which
 * this file used to do differently:
 *
 *  - **No tinted disc underneath.** An earlier set was transparent faces on one
 *    of twelve grounds this component painted, which multiplied 18 drawings
 *    into 216 combinations. Here the drawing is the whole avatar, so what you
 *    see is what was supplied.
 *  - **The count is the count.** Fifty-one avatars against a twenty-five row
 *    board means repeats: by the birthday problem, expect roughly six pairs of
 *    rows sharing a picture on a full board. More files is the only fix; the
 *    picker uses every one it is given.
 */

import { memo } from "react";
import { cn } from "@/lib/utils";

/* FNV-1a, the same hash the synthetic leaderboard uses on the server. It only
   has to spread evenly, and it has to give the same answer in every browser and
   on every visit — which rules out anything seeded by Math.random or by the
   render order of a list. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * How many files sit in `public/img/avatars/animals`, named `a01`…`aNN`.
 *
 * They are numbered rather than named after their animals on purpose: several
 * of them are a coin toss at a glance — red panda against fox against raccoon,
 * sloth against bear — and a filename that says `fox` when the picture is a
 * raccoon is worse than one that says nothing.
 *
 * **Adding is safe; renumbering is not.** A trader's avatar is this count
 * modulo their seed, so appending a52 leaves everybody where they are, while
 * inserting one in the middle reshuffles the entire user base.
 */
const COUNT = 156;

/** How many there are, for anything that offers all of them to choose from. */
export const AVATAR_COUNT = COUNT;

/* `padStart(2)` leaves three-digit numbers alone, so a01…a99 keep the names
   they shipped with and a100 upwards simply carry on. That matters now that an
   avatar can be *chosen*: a chosen one is stored as its URL, and renumbering
   the files would silently hand somebody a different animal. */
const fileFor = (i: number) => `a${String(i + 1).padStart(2, "0")}.webp`;

/** The public path of one avatar, 0-indexed. */
export const avatarPath = (i: number) => `/img/avatars/animals/${fileFor(i)}`;

/** Every avatar, in order — for a picker. */
export const avatarPaths = (): string[] =>
  Array.from({ length: COUNT }, (_, i) => avatarPath(i));

/**
 * Whether a stored `user.avatar` is one of these rather than an upload.
 *
 * The picker needs it to show which one is currently chosen, and it is a path
 * test rather than a flag on the user because that is all the server stores —
 * choosing an avatar writes its URL into the same column an upload writes to,
 * which is what keeps every existing `<img src={user.avatar}>` in the app
 * working without knowing this feature exists.
 */
export const isGeneratedAvatar = (url?: string | null): boolean =>
  !!url && url.startsWith("/img/avatars/animals/");

/** Which avatar a seed lands on. Exported for the tests. */
export function animalFor(seed: string): number {
  return fnv1a(seed || "?") % COUNT;
}

export const AnimalAvatar = memo(function AnimalAvatar({
  seed,
  className,
  title,
}: {
  /** Stable per trader. See `avatarSeed` on the leaderboard endpoints. */
  seed: string;
  /** The box: width and height, so it can carry a breakpoint. */
  className?: string;
  title?: string;
}) {
  return (
    <img
      src={`/img/avatars/animals/${fileFor(animalFor(seed))}`}
      alt=""
      role="img"
      aria-label={title ?? "Trader avatar"}
      title={title}
      loading="lazy"
      draggable={false}
      /* `object-cover` rather than `contain`: the source is already a circle
         cropped tight to its own edge, so any letterboxing would show as a gap
         between the picture and the ring drawn around it. */
      className={cn("shrink-0 select-none rounded-full object-cover", className)}
    />
  );
});

export default AnimalAvatar;
