import { describe, expect, it } from "vitest";
import { FORMATIONS, type ManagerView, type SquadEntry } from "@auction-eleven/shared";
import { FOOTBALLERS } from "../src/footballers.js";
import { buildAutomaticLineup, DEFAULT_SETTINGS, rankManagers, validateAndBuildLineup, validateBid } from "../src/gameEngine.js";

const emptyManager: ManagerView = {
  id: "m1",
  name: "Test",
  avatar: "🦁",
  budget: 100,
  ready: true,
  connected: true,
  isHost: true,
  isBot: false,
  squad: [],
  joinedAt: 1,
  formationId: null,
  lineup: [],
  lineupSubmitted: false,
  lineupScore: 0
};

const sampleSquad: SquadEntry[] = [
  ...FOOTBALLERS.filter(player => player.position === "GK").slice(0, 2),
  ...FOOTBALLERS.filter(player => player.position === "DEF").slice(0, 5),
  ...FOOTBALLERS.filter(player => player.position === "MID").slice(0, 5),
  ...FOOTBALLERS.filter(player => player.position === "FWD").slice(0, 5)
].map((footballer, index) => ({ footballer, price: footballer.basePrice, round: index + 1 }));

describe("game defaults", () => {
  it("uses a one-minute auction timer", () => expect(DEFAULT_SETTINGS.auctionSeconds).toBe(60));
  it("builds 11 starters and 6 substitutes", () => expect(DEFAULT_SETTINGS.squadSize).toBe(17));
  it("defaults to a six-squad room capacity", () => expect(DEFAULT_SETTINGS.managerLimit).toBe(6));
  it("starts with 68 real-player base cards that can be mirrored for large rooms", () => expect(Object.values(DEFAULT_SETTINGS.poolTargets).reduce((sum, value) => sum + value, 0)).toBe(68));
});

describe("validateBid", () => {
  it("accepts a valid opening bid", () => expect(validateBid({ amount: 1, currentBid: 0, manager: emptyManager, settings: DEFAULT_SETTINGS, auctionActive: true })).toBeNull());
  it("rejects a bid above budget", () => expect(validateBid({ amount: 101, currentBid: 50, manager: emptyManager, settings: DEFAULT_SETTINGS, auctionActive: true })).toMatch(/budget/i));
  it("rejects a stale auction", () => expect(validateBid({ amount: 1, currentBid: 0, manager: emptyManager, settings: DEFAULT_SETTINGS, auctionActive: false })).toMatch(/closed/i));
  it("rejects a mirrored copy already owned by the same manager", () => {
    const footballer = FOOTBALLERS[0]!;
    const manager: ManagerView = { ...emptyManager, squad: [{ footballer, price: 1, round: 1 }] };
    const mirror = { ...footballer, id: `${footballer.id}-mirror`, catalogId: footballer.id };
    expect(validateBid({ amount: 1, currentBid: 0, manager, settings: DEFAULT_SETTINGS, auctionActive: true, footballer: mirror })).toMatch(/already own/i);
  });
});

describe("formations and lineup ranking", () => {
  it("provides formations for 6 through 11 starters with unique slots", () => {
    expect(FORMATIONS.filter(formation => formation.slots.length === 11).length).toBeGreaterThanOrEqual(20);
    for (const starterCount of [6, 7, 8, 9, 10, 11]) {
      expect(FORMATIONS.filter(formation => formation.slots.length === starterCount).length).toBeGreaterThanOrEqual(starterCount === 11 ? 20 : 3);
    }
    for (const formation of FORMATIONS) {
      expect(formation.slots.length).toBeGreaterThanOrEqual(6);
      expect(formation.slots.length).toBeLessThanOrEqual(11);
      expect(new Set(formation.slots.map(slot => slot.id)).size).toBe(formation.slots.length);
      expect(formation.slots.some(slot => slot.role === "GK")).toBe(true);
    }
  });

  it("automatically assembles 11 unique starters from a 17-player squad", () => {
    const automatic = buildAutomaticLineup(sampleSquad);
    expect(automatic.lineup).toHaveLength(11);
    expect(new Set(automatic.lineup.map(item => item.footballerId)).size).toBe(11);
    expect(FORMATIONS.some(formation => formation.id === automatic.formationId)).toBe(true);
  });

  it("uses exactly one goalkeeper in an automatic lineup", () => {
    const automatic = buildAutomaticLineup(sampleSquad);
    const playerById = new Map(sampleSquad.map(entry => [entry.footballer.id, entry.footballer]));
    const selectedGoalkeepers = automatic.lineup.filter(item => playerById.get(item.footballerId)?.position === "GK");
    expect(selectedGoalkeepers).toHaveLength(1);
    expect(selectedGoalkeepers[0]?.role).toBe("GK");
  });


  it("automatically uses an 8-player formation for an 8-player squad", () => {
    const smallSquad = sampleSquad.slice(0, 8);
    const automatic = buildAutomaticLineup(smallSquad);
    expect(automatic.lineup).toHaveLength(8);
    expect(FORMATIONS.find(formation => formation.id === automatic.formationId)?.slots).toHaveLength(8);
  });

  it("returns a server-ranked result with formation metrics", () => {
    const automatic = buildAutomaticLineup(sampleSquad);
    const manager: ManagerView = {
      ...emptyManager,
      budget: 320,
      squad: sampleSquad,
      formationId: automatic.formationId,
      lineup: automatic.lineup,
      lineupSubmitted: true,
      lineupScore: automatic.score
    };
    const result = rankManagers([manager])[0]!;
    expect(result.rank).toBe(1);
    expect(result.formationName.length).toBeGreaterThan(0);
    expect(result.lineupFit).toBeGreaterThan(0);
    expect(result.benchStrength).toBeGreaterThan(0);
  });
});

describe("v0.8 formation security", () => {
  it("rejects using a goalkeeper in an outfield slot", () => {
    const squad = sampleSquad;
    const automatic = buildAutomaticLineup(squad, "4-4-2");
    const gk = squad.find(entry => entry.footballer.position === "GK")?.footballer;
    const outfield = automatic.lineup.find(item => item.role !== "GK");
    expect(gk).toBeTruthy();
    expect(outfield).toBeTruthy();
    const picks = automatic.lineup.map(item => ({ slotId: item.slotId, footballerId: item.footballerId }));
    const target = picks.find(item => item.slotId === outfield!.slotId)!;
    target.footballerId = gk!.id;
    expect(() => validateAndBuildLineup(squad, "4-4-2", picks)).toThrow(/Goalkeepers cannot be placed/i);
  });

  it("ships a two-to-ten minute formation window and named AI difficulty", () => {
    expect(DEFAULT_SETTINGS.formationSeconds).toBeGreaterThanOrEqual(120);
    expect(DEFAULT_SETTINGS.formationSeconds).toBeLessThanOrEqual(600);
    expect(["Amateur", "Professional", "World Class", "Legendary"]).toContain(DEFAULT_SETTINGS.botDifficulty);
  });
});
