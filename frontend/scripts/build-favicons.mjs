/**
 * Rebuild the icon set from the brand mark.
 *
 * Why this exists: every icon in public/img/logo — all six families, all
 * twenty sizes — was the same 512px raster of the mark sitting on a flat
 * near-black square (#0b0c10), fully opaque despite carrying an alpha
 * channel. In a browser tab that reads as a dark box with something small
 * inside it, and on a light toolbar it is a black chip. The mark also
 * occupied only the middle 75% of the square, so at 16px there was very
 * little mark left to recognise.
 *
 * What this does: keys that backdrop out on luma, undoes the blend against it
 * so edges keep the mark's own colour instead of a dark fringe, trims to the
 * mark and re-centres it with a small even margin, then re-renders every size.
 *
 *   node scripts/build-favicons.mjs [--out DIR] [--src FILE]
 *
 * Transparency is right for a browser tab and wrong for a home screen: iOS and
 * Android composite their icons onto the user's wallpaper, so a transparent
 * PNG shows the wallpaper through the mark. Only the favicon-* family and
 * favicon.ico are transparent here; every other family is flattened onto the
 * brand backdrop, which is also the manifest's background_color.
 *
 * The source is a soft, lightly artefacted raster — it is the best copy of the
 * mark in the repo. Point --src at a real vector export or a clean high-res
 * PNG when one exists and the small sizes will get sharper for free.
 */

import sharp from "sharp";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const SRC = argOf("--src", join(HERE, "../public/img/logo/favicon-512x512.png"));
const OUT = argOf("--out", join(HERE, "../public"));

/* The backdrop is a flat #0b0c10 and the mark's darkest navy sits around 55 on
   the value scale, so the ramp separates them cleanly. Below LO is backdrop,
   above HI is mark, between is the antialiased edge. */
const LO = 60;
const HI = 120;
const BACKDROP = { r: 11, g: 12, b: 16 };

const SIZES = [16, 32, 36, 48, 57, 60, 72, 76, 96, 114, 120, 144, 150, 152, 180, 192, 256, 310, 384, 512];
const OPAQUE_FAMILIES = ["apple-icon", "android-icon", "android-chrome", "ms-icon", "mstile"];
const ICO_SIZES = [16, 32, 48];

/** Backdrop out, fringe undone, trimmed and re-centred. */
async function buildMaster(src) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const rgba = Buffer.alloc(w * h * 4);

  for (let p = 0, q = 0; p < data.length; p += c, q += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const value = Math.max(r, g, b);
    let a = (value - LO) / (HI - LO);
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    if (a === 0) continue; // buffer is already zeroed
    // C = mark·a + backdrop·(1−a). Solving for the mark keeps the edge pixels
    // the colour they were painted rather than the colour they were flattened
    // to, which is what stops a grey halo appearing once the backdrop goes.
    const undo = (ch, bg) => {
      const v = (ch - bg * (1 - a)) / a;
      return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    };
    rgba[q] = undo(r, BACKDROP.r);
    rgba[q + 1] = undo(g, BACKDROP.g);
    rgba[q + 2] = undo(b, BACKDROP.b);
    rgba[q + 3] = Math.round(a * 255);
  }

  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  const mw = x1 - x0 + 1;
  const mh = y1 - y0 + 1;

  const mark = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x0, top: y0, width: mw, height: mh })
    .png()
    .toBuffer();

  // 90% fill: as large as a 16px tab icon can carry without touching the edge.
  const side = Math.round(Math.max(mw, mh) / 0.9);
  const master = await sharp({
    create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: mark, left: Math.round((side - mw) / 2), top: Math.round((side - mh) / 2) }])
    .png()
    .toBuffer();

  return { master, side, mark: { w: mw, h: mh } };
}

/** One size, transparent or flattened onto the backdrop. */
async function render(master, size, opaque) {
  let pipe = sharp(master).resize(size, size, { kernel: "lanczos3", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  // The source is soft; a light pass keeps the strokes readable once the mark
  // is only a handful of pixels across.
  if (size <= 64) pipe = pipe.sharpen({ sigma: 0.5, m1: 0, m2: 1 });
  if (opaque) {
    pipe = sharp(await pipe.png().toBuffer()).flatten({ background: BACKDROP });
  }
  const buf = await pipe.png({ compressionLevel: 9 }).toBuffer();
  return buf;
}

/** ICO container with PNG-encoded entries — what every current browser reads. */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(entries.length * 16);
  let offset = 6 + entries.length * 16;
  entries.forEach((e, i) => {
    const at = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, at);
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, at + 1);
    dir.writeUInt8(0, at + 2);
    dir.writeUInt8(0, at + 3);
    dir.writeUInt16LE(1, at + 4);
    dir.writeUInt16LE(32, at + 6);
    dir.writeUInt32LE(e.png.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += e.png.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

const { master, side, mark } = await buildMaster(SRC);
console.log(`mark ${mark.w}×${mark.h} → master ${side}×${side}`);

const logoDir = join(OUT, "img/logo");
mkdirSync(logoDir, { recursive: true });

let written = 0;
for (const size of SIZES) {
  const transparent = await render(master, size, false);
  const opaque = await render(master, size, true);
  const webpOf = (png) => sharp(png).webp({ lossless: true }).toBuffer();

  writeFileSync(join(logoDir, `favicon-${size}x${size}.png`), transparent);
  writeFileSync(join(logoDir, `favicon-${size}x${size}.webp`), await webpOf(transparent));
  written += 2;

  for (const family of OPAQUE_FAMILIES) {
    writeFileSync(join(logoDir, `${family}-${size}x${size}.png`), opaque);
    writeFileSync(join(logoDir, `${family}-${size}x${size}.webp`), await webpOf(opaque));
    written += 2;
  }
}

/* Apple's unsized aliases. `precomposed` means "already styled, do not add
   gloss", which is exactly what these are. */
const appleUnsized = await render(master, 180, true);
for (const name of ["apple-icon", "apple-icon-precomposed", "apple-touch-icon"]) {
  writeFileSync(join(logoDir, `${name}.png`), appleUnsized);
  writeFileSync(join(logoDir, `${name}.webp`), await sharp(appleUnsized).webp({ lossless: true }).toBuffer());
  written += 2;
}

const ico = buildIco(
  await Promise.all(ICO_SIZES.map(async (size) => ({ size, png: await render(master, size, false) })))
);
writeFileSync(join(OUT, "favicon.ico"), ico);
written += 1;

console.log(`wrote ${written} files to ${OUT}`);
