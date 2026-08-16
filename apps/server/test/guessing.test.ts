import { describe, expect, it } from "vitest";
import { normalizeFootballerGuess } from "@auction-eleven/shared";
import { FOOTBALLERS } from "../src/footballers.js";
import { getAmbiguousAliases, matchFootballerGuess, validateFootballerAliasIndex } from "../src/guessing.js";

const player = (name: string) => {
  const found = FOOTBALLERS.find(item => item.name === name);
  if (!found) throw new Error(`Missing test footballer ${name}`);
  return found;
};

describe("Blind Auction footballer answer matching", () => {
  it.each(["Neymar", "neymar", "NEYMAR", "Neymar Jr", "Neymar Jr.", "Neymar Junior"])("accepts Neymar alias %s", answer => {
    expect(matchFootballerGuess(player("Neymar"), answer)).toBe("correct");
  });

  it.each(["Mbappé", "Mbappe", "Kylian Mbappe", "Kylian Mbappé"])("accepts Mbappe alias %s", answer => {
    expect(matchFootballerGuess(player("Kylian Mbappé"), answer)).toBe("correct");
  });

  it.each(["Messi", "Lionel Messi", "Leo Messi"])("accepts Messi alias %s", answer => {
    expect(matchFootballerGuess(player("Lionel Messi"), answer)).toBe("correct");
  });

  it.each(["Cristiano Ronaldo", "Cristiano", "CR7"])("accepts Cristiano alias %s", answer => {
    expect(matchFootballerGuess(player("Cristiano Ronaldo"), answer)).toBe("correct");
  });

  it.each(["Ronaldo Nazario", "Ronaldo Nazário", "R9"])("accepts R9 alias %s", answer => {
    expect(matchFootballerGuess(player("Ronaldo Nazário"), answer)).toBe("correct");
  });

  it("marks Ronaldo as ambiguous instead of awarding either Ronaldo", () => {
    expect(matchFootballerGuess(player("Cristiano Ronaldo"), "Ronaldo")).toBe("ambiguous");
    expect(matchFootballerGuess(player("Ronaldo Nazário"), "Ronaldo")).toBe("ambiguous");
    expect(getAmbiguousAliases()).toContain("ronaldo");
  });

  it("uses conservative one-edit typo tolerance", () => {
    expect(matchFootballerGuess(player("Ronaldinho"), "Ronaldino")).toBe("correct");
    expect(matchFootballerGuess(player("Ronaldinho"), "Ronaldo")).not.toBe("correct");
  });

  it("normalizes accents, punctuation and whitespace", () => {
    expect(normalizeFootballerGuess("  N'Golo   Kanté  ")).toBe("n golo kante");
    expect(normalizeFootballerGuess("Neymar Jr.")).toBe("neymar jr");
  });

  it("builds a catalogue-wide alias index", () => {
    const audit = validateFootballerAliasIndex();
    expect(audit.aliases).toBeGreaterThan(FOOTBALLERS.length);
  });
});
