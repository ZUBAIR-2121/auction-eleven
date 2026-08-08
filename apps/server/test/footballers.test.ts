import { describe, expect, it } from "vitest";
import { FOOTBALLERS, FOOTBALLER_BY_CANONICAL_ID, canonicalizeFootballerIdentity } from "../src/footballers.js";

const byCanonical = (id: string) => FOOTBALLER_BY_CANONICAL_ID.get(id);

describe("supplied footballer catalogue merge", () => {
  it("keeps every original base player and imports the supplied catalogue without canonical duplicates", () => {
    expect(FOOTBALLERS).toHaveLength(186);
    const canonicalIds = FOOTBALLERS.map(player => player.canonicalId ?? player.id);
    expect(new Set(canonicalIds).size).toBe(FOOTBALLERS.length);
  });

  it("merges Neymar aliases into one canonical footballer", () => {
    expect(canonicalizeFootballerIdentity("Neymar")).toBe("neymar");
    expect(canonicalizeFootballerIdentity("Neymar Jr.")).toBe("neymar");
    expect(canonicalizeFootballerIdentity("Neymar da Silva Santos Júnior")).toBe("neymar");
    expect(FOOTBALLERS.filter(player => (player.canonicalId ?? "") === "neymar")).toHaveLength(1);
  });

  it("never confuses Cristiano Ronaldo with Ronaldo Nazário", () => {
    expect(canonicalizeFootballerIdentity("Cristiano Ronaldo")).toBe("cristiano-ronaldo");
    expect(canonicalizeFootballerIdentity("Ronaldo Nazário")).toBe("ronaldo-nazario");
    expect(byCanonical("cristiano-ronaldo")?.name).toBe("Cristiano Ronaldo");
    expect(byCanonical("ronaldo-nazario")?.name).toBe("Ronaldo Nazário");
  });

  it("upgrades famous existing players instead of creating copies", () => {
    const messi = byCanonical("lionel-messi");
    const mbappe = byCanonical("kylian-mbappe");
    expect(messi?.overall).toBe(96);
    expect(mbappe?.overall).toBe(96);
    expect(FOOTBALLERS.filter(player => player.name === "Lionel Messi")).toHaveLength(1);
    expect(FOOTBALLERS.filter(player => player.name === "Kylian Mbappé")).toHaveLength(1);
  });

  it("ships balanced icon ratings and detailed supported positions", () => {
    expect(byCanonical("pele")).toMatchObject({ playerType: "ICON", overall: 99, primaryRole: "CF" });
    expect(byCanonical("ronaldo-nazario")).toMatchObject({ playerType: "ICON", overall: 98, primaryRole: "ST" });
    expect(byCanonical("ruud-gullit")?.secondaryRoles).toEqual(expect.arrayContaining(["CAM", "CDM", "ST"]));
    expect(byCanonical("paolo-maldini")?.secondaryRoles).toContain("LB");
    expect(byCanonical("lev-yashin")?.secondaryRoles).toEqual([]);
  });

  it("keeps base OVR at or below 99", () => {
    expect(Math.max(...FOOTBALLERS.map(player => player.overall))).toBe(99);
    expect(FOOTBALLERS.every(player => player.overall >= 1 && player.overall <= 99)).toBe(true);
  });
});
