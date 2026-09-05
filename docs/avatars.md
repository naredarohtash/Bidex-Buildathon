# Generated trader avatars

Where the leaderboard's avatars come from, and how to change them.

## What ships

`frontend/public/img/avatars/animals/a01.webp` … `a156.webp` — one hundred and
fifty-six illustrated animal portraits, each already circular with its own
background baked in. 160×160, WebP with alpha, ~6KB each, 972KB for the set.
Only the avatars actually on screen are fetched, and they cache.

`frontend/components/ui/animal-avatar.tsx` picks one from a seed and draws it.
Nothing tints or composites — the file is the whole avatar.

## Choosing one

Clicking your profile picture in the account section opens `avatar-picker.tsx`:
upload a photo, or pick any of these. Choosing one writes its path into the same
`user.avatar` column an upload writes to, so every `<img src={user.avatar}>` in
the product keeps working without being taught this feature exists.

The previously uploaded file is left in place. `imageUploader` deletes an old
photo when a new one replaces it and there is no matching call for "stop
pointing at it", so cleaning up here would need an endpoint that does not exist
yet.

## How a trader on the leaderboard gets theirs

The server sends `avatarSeed` on every leaderboard row and on `me`
(`avatarSeedFor` in `backend/api/exchange/binary/leaderboard/synthetic.ts`).
It is a hash of the user id, never the id: the board anonymises everybody on
purpose, and shipping ids so the client can choose a picture would undo that.

It has to be an id and not a display name. Seeded on the name, renaming would
change your animal — and the "you" box and your own row on the board are named
by two different functions, so one person would show two different animals.

The client hashes that seed with FNV-1a and takes it modulo the file count.

## Replacing the artwork

**Two different things are at stake, and only one of them is safe.**

A *chosen* avatar is stored as its URL, so it survives anything as long as a
filename keeps pointing at the same picture. Renaming or reordering the files
silently hands somebody a different animal — that is the one change to never
make. `padStart(2)` leaves three-digit numbers alone, which is why the set grew
past a99 without renaming a01.

An *assigned* avatar — the one a trader gets on the leaderboard without
choosing — is `hash(seed) % COUNT`, so it reshuffles whenever the count changes.
Adding files does move people. That is acceptable for a fallback nobody picked,
and it is worth knowing before you add one file to fix a typo.

Files are numbered rather than named after their animals deliberately: several
are a coin toss at a glance — red panda against fox against raccoon, sloth
against bear — and a filename reading `fox.webp` over a picture of a raccoon is
worse than one that says nothing.

### Requirements for new art

- **Square, 1:1.** Circular subject filling the square edge to edge, corners
  transparent. SVG is ideal; otherwise 512×512 PNG with alpha, and it will be
  resized down.
- **Legible at 18px.** That is the size a leaderboard row draws, and it is
  brutal: no thin lines (anything under ~4% of canvas width vanishes), no small
  internal detail, no gradients, few colours, high contrast. Head-on faces
  survive; side-on whole animals become a smudge, because the animal competes
  with its own legs for eleven pixels.
- **Backgrounds must read on light, dark and navy panels.** Avoid near-white
  and near-black. Avoid green and red as the dominant background — those two
  mean profit and loss on every other pixel of that screen, and an avatar is
  not a result.
- **Vary the backgrounds.** With the background baked in, its colour is the only
  thing distinguishing two rows at 18px. A set that is mostly sage green and
  beige reads as one repeated avatar however different the animals are.
- **Count.** At 156 a twenty-five row board repeats about twice in ten loads,
  which is the point the set reached after three sheets. At 51 it repeated on
  nearly every load.

### Cutting a contact sheet

The set came from three sheets with three different layouts — 1024×1024 with 8
circles on its first two rows and 7 on the rest, and two 1683×624 strips, one of
which has no white gutters at all because its ground is pale lavender.

The method that survives all three: sample the sheet's own ground from its
corners, mask everything that differs from it, flood-fill connected components,
and take each blob as one circle. Circles that touch merge into a single blob,
so a blob whose width is a whole multiple of its height is divided back into
that many. Then crop a square on each circle's centre, resize, and mask to a
circle at 98.5% radius, which cuts the JPEG's fringe.

**The method this replaced is why the lion was clipped.** It assumed a grid and
took each cell's tight bounding box; on the row where circles nearly touch, the
box ran into the neighbour, the square crop came out off-centre, and the round
mask ate the right-hand edge of the artwork.

Afterwards, drop near-duplicates: a 12×12 RGB signature per avatar and a
distance threshold caught 22 repeats across the three sheets, plus cells that
were mostly flat ground. One torn crop had to go by eye.

Prefer individual files over a sheet. Slicing costs quality: a sheet gives about
120-130px per avatar, which is fine for a 30px row at 3x and soft anywhere
larger.
