import { describe, it, expect } from "vitest";
import { animalFor } from "./animal-avatar";

/**
 * The avatar has to be the *same* one every time or it is worse than the grey
 * initials it replaced: a trader who is a bear on this render and a raccoon on
 * the next is noise pretending to be identity. These pin the two properties
 * that make it work — it never moves, and it spreads across the whole set.
 */
describe("animalFor", () => {
  it("gives one seed the same avatar every time", () => {
    const a = animalFor("s41");
    for (let i = 0; i < 50; i++) expect(animalFor("s41")).toBe(a);
  });

  it("puts different seeds in different places", () => {
    expect(animalFor("s41")).not.toBe(animalFor("s42"));
  });

  it("reaches every file, and stays inside the set", () => {
    const seeds = Array.from({ length: 20000 }, (_, i) => `s${i}`);
    const seen = new Set(seeds.map(animalFor));
    expect(seen.size).toBe(156);
    for (const i of seen) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(156);
    }
  });

  it("spreads roughly evenly rather than piling onto a few files", () => {
    const counts = new Array(156).fill(0);
    for (let i = 0; i < 15600; i++) counts[animalFor(`trader-${i}`)]++;
    /* 100 expected per file. A hash that clumped — or a modulo against the
       wrong count — shows up here long before anybody sees it on the board. */
    expect(Math.min(...counts)).toBeGreaterThan(40);
    expect(Math.max(...counts)).toBeLessThan(180);
  });

  it("does not throw on an empty seed", () => {
    expect(() => animalFor("")).not.toThrow();
  });
});
