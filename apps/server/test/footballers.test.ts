import { describe, expect, it } from "vitest";
import { getFootballerPrimaryRoles, getFootballerRoles, getFootballerSecondaryRoles, getRoleFitLabel } from "@auction-eleven/shared";
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

  it("ships balanced icon ratings and dual-primary supported positions", () => {
    expect(byCanonical("pele")).toMatchObject({ playerType: "ICON", overall: 99, primaryRole: "CAM" });
    expect(byCanonical("ronaldo-nazario")).toMatchObject({ playerType: "ICON", overall: 98, primaryRole: "ST" });
    const gullit = byCanonical("ruud-gullit")!;
    expect(getFootballerPrimaryRoles(gullit)).toEqual(["CM", "CAM"]);
    expect(getFootballerSecondaryRoles(gullit)).toEqual(expect.arrayContaining(["CDM", "ST"]));
    expect(getRoleFitLabel(gullit, "CM")).toBe("PRIMARY");
    expect(getRoleFitLabel(gullit, "CAM")).toBe("PRIMARY");
    expect(getRoleFitLabel(gullit, "CDM")).toBe("SECONDARY");
    expect(getFootballerPrimaryRoles(byCanonical("paolo-maldini")!)).toEqual(["CB", "LB"]);
    expect(getFootballerPrimaryRoles(byCanonical("lev-yashin")!)).toEqual(["GK"]);
    expect(getFootballerSecondaryRoles(byCanonical("lev-yashin")!)).toEqual([]);
  });

  it("keeps requested versatile stars dual-primary without making every player versatile", () => {
    expect(getFootballerPrimaryRoles(byCanonical("lionel-messi")!)).toEqual(["RW", "CAM"]);
    expect(getFootballerPrimaryRoles(byCanonical("cristiano-ronaldo")!)).toEqual(["ST", "LW"]);
    expect(getFootballerPrimaryRoles(byCanonical("neymar")!)).toEqual(["LW", "CAM"]);
    expect(getFootballerPrimaryRoles(byCanonical("kylian-mbappe")!)).toEqual(["ST", "LW"]);
    expect(getFootballerPrimaryRoles(byCanonical("joshua-kimmich")!)).toEqual(["RB", "CDM"]);
    expect(getFootballerPrimaryRoles(byCanonical("erling-haaland")!)).toEqual(["ST"]);
    expect(getFootballerPrimaryRoles(byCanonical("virgil-van-dijk")!)).toEqual(["CB"]);
  });

  it("matches position filters against both primary and secondary roles", () => {
    const gullit = byCanonical("ruud-gullit")!;
    expect(getFootballerRoles(gullit)).toEqual(expect.arrayContaining(["CM", "CAM", "CDM", "ST"]));
    expect(getFootballerRoles(gullit).includes("CAM")).toBe(true);
    expect(getFootballerRoles(gullit).includes("CDM")).toBe(true);
  });

  it("keeps base OVR at or below 99", () => {
    expect(Math.max(...FOOTBALLERS.map(player => player.overall))).toBe(99);
    expect(FOOTBALLERS.every(player => player.overall >= 1 && player.overall <= 99)).toBe(true);
  });
});
