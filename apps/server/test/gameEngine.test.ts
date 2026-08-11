import { describe, expect, it } from "vitest";
import { FORMATIONS, getConfiguredSquadSize, getMinimumFootballersRequired, getOpeningBid, getSquadCompletion, type ManagerView, type SquadEntry } from "@auction-eleven/shared";
import { FOOTBALLERS } from "../src/footballers.js";
import { buildAutomaticLineup, DEFAULT_SETTINGS, rankManagers, validateAndBuildLineup, validateBid } from "../src/gameEngine.js";

const emptyManager: ManagerView & { budget: number } = {
  id: "m1",
  name: "Test",
  avatar: "🦁",
  budget: 100,
  ready: true,
  connected: true,
  isHost: true,
  isBot: false,
  aiTakeover: false,
  reconnectDeadline: null,
  squad: [],
  joinedAt: 1,
  formationId: null,
  lineup: [],
  lineupSubmitted: false,
  lineupScore: 0,
  auctionComplete: false
};

const sampleSquad: SquadEntry[] = [
  ...FOOTBALLERS.filter(player => player.position === "GK").slice(0, 2),
  ...FOOTBALLERS.filter(player => player.position === "DEF").slice(0, 5),
  ...FOOTBALLERS.filter(player => player.position === "MID").slice(0, 5),
  ...FOOTBALLERS.filter(player => player.position === "FWD").slice(0, 5)
].map((footballer, index) => ({ footballer, price: footballer.basePrice, round: index + 1 }));

describe("game defaults", () => {
  it("uses a fast twelve-second auction timer", () => expect(DEFAULT_SETTINGS.auctionSeconds).toBe(12));
  it("builds an 11-player starting squad", () => expect(DEFAULT_SETTINGS.squadSize).toBe(11));
  it("defaults to a six-squad room capacity", () => expect(DEFAULT_SETTINGS.managerLimit).toBe(6));
  it("starts with a 96-player unique room pool target so the default six-manager room is viable", () => expect(Object.values(DEFAULT_SETTINGS.poolTargets).reduce((sum, value) => sum + value, 0)).toBe(96));
  it("defaults to five substitutes", () => expect(DEFAULT_SETTINGS.substituteCount).toBe(5));
  it("does not re-auction skipped players by default", () => expect(DEFAULT_SETTINGS.reauctionUnsold).toBe(false));
  it("calculates manager capacity from starters plus substitutes", () => {
    expect(getConfiguredSquadSize(11, 5)).toBe(16);
    expect(getMinimumFootballersRequired(3, 11, 5)).toBe(48);
    expect(getMinimumFootballersRequired(8, 6, 2)).toBe(64);
  });
  it("keeps classic flat opening prices as the default", () => expect(DEFAULT_SETTINGS.pricingMode).toBe("normal"));
});

describe("opening price modes", () => {
  const lowerRated = FOOTBALLERS.slice().sort((a, b) => a.overall - b.overall)[0]!;
  const higherRated = FOOTBALLERS.slice().sort((a, b) => b.overall - a.overall)[0]!;

  it("uses the same minimum opening bid in normal mode", () => {
    expect(getOpeningBid(DEFAULT_SETTINGS, lowerRated)).toBe(DEFAULT_SETTINGS.minimumBid);
    expect(getOpeningBid(DEFAULT_SETTINGS, higherRated)).toBe(DEFAULT_SETTINGS.minimumBid);
  });

  it("opens higher-rated players at a higher price in OVR mode", () => {
    const settings = { ...DEFAULT_SETTINGS, pricingMode: "ovr_scaled" as const };
    expect(getOpeningBid(settings, higherRated)).toBeGreaterThan(getOpeningBid(settings, lowerRated));
  });

  it("scales OVR prices to the selected room budget", () => {
    const lowBudget = getOpeningBid({ ...DEFAULT_SETTINGS, pricingMode: "ovr_scaled", startingBudget: 300 }, higherRated);
    const highBudget = getOpeningBid({ ...DEFAULT_SETTINGS, pricingMode: "ovr_scaled", startingBudget: 3000 }, higherRated);
    expect(highBudget).toBeGreaterThan(lowBudget);
  });
});

describe("validateBid", () => {
  it("accepts a valid opening bid", () => expect(validateBid({ amount: 1, currentBid: 0, manager: emptyManager, settings: DEFAULT_SETTINGS, auctionActive: true })).toBeNull());
  it("requires the OVR-based opening price when that mode is selected", () => {
    const footballer = FOOTBALLERS.slice().sort((a, b) => b.overall - a.overall)[0]!;
    const settings = { ...DEFAULT_SETTINGS, pricingMode: "ovr_scaled" as const };
    const opening = getOpeningBid(settings, footballer);
    expect(validateBid({ amount: opening - settings.bidIncrement, currentBid: 0, manager: { ...emptyManager, budget: 1000 }, settings, auctionActive: true, footballer })).toMatch(/Minimum valid bid/i);
    expect(validateBid({ amount: opening, currentBid: 0, manager: { ...emptyManager, budget: 1000 }, settings, auctionActive: true, footballer })).toBeNull();
  });
  it("rejects a bid above budget", () => expect(validateBid({ amount: 101, currentBid: 50, manager: emptyManager, settings: DEFAULT_SETTINGS, auctionActive: true })).toMatch(/budget/i));
  it("rejects a stale auction", () => expect(validateBid({ amount: 1, currentBid: 0, manager: emptyManager, settings: DEFAULT_SETTINGS, auctionActive: false })).toMatch(/closed/i));
  it("rejects a mirrored copy already owned by the same manager", () => {
    const footballer = FOOTBALLERS[0]!;
    const manager: ManagerView & { budget: number } = { ...emptyManager, squad: [{ footballer, price: 1, round: 1 }] };
    const mirror = { ...footballer, id: `${footballer.id}-mirror`, catalogId: footballer.id };
    expect(validateBid({ amount: 1, currentBid: 0, manager, settings: DEFAULT_SETTINGS, auctionActive: true, footballer: mirror })).toMatch(/already own/i);
  });
  it("treats substitutes as optional when reserving budget for future starters", () => {
    const goalkeeper = FOOTBALLERS.find(player => player.position === "GK")!;
    const outfield = FOOTBALLERS.filter(player => player.position !== "GK").slice(0, 10);
    const squad = [goalkeeper, ...outfield].map((footballer, index) => ({ footballer, price: 1, round: index + 1 }));
    const manager: ManagerView & { budget: number } = { ...emptyManager, budget: 5, squad };
    const substitute = FOOTBALLERS.find(player => player.position !== "GK" && !squad.some(entry => entry.footballer.id === player.id))!;
    expect(getSquadCompletion(squad, DEFAULT_SETTINGS).startersComplete).toBe(true);
    expect(validateBid({ amount: 5, currentBid: 0, manager, settings: DEFAULT_SETTINGS, auctionActive: true, footballer: substitute })).toBeNull();
  });

  it("reserves only the minimum budget needed for unfinished starting slots", () => {
    const goalkeeper = FOOTBALLERS.find(player => player.position === "GK")!;
    const outfield = FOOTBALLERS.filter(player => player.position !== "GK").slice(0, 8);
    const squad = [goalkeeper, ...outfield].map((footballer, index) => ({ footballer, price: 1, round: index + 1 }));
    const manager: ManagerView & { budget: number } = { ...emptyManager, budget: 3, squad };
    const candidate = FOOTBALLERS.find(player => player.position !== "GK" && !squad.some(entry => entry.footballer.id === player.id))!;
    expect(getSquadCompletion(squad, DEFAULT_SETTINGS).startersRemaining).toBe(2);
    expect(validateBid({ amount: 3, currentBid: 0, manager, settings: DEFAULT_SETTINGS, auctionActive: true, footballer: candidate })).toMatch(/Keep at least 1M.*starting lineup/i);
    expect(validateBid({ amount: 2, currentBid: 0, manager, settings: DEFAULT_SETTINGS, auctionActive: true, footballer: candidate })).toBeNull();
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


  it("automatically uses an 8-player formation for an eligible 8-player squad", () => {
    const goalkeeper = sampleSquad.find(entry => entry.footballer.position === "GK")!;
    const outfield = sampleSquad.filter(entry => entry.footballer.position !== "GK").slice(0, 7);
    const smallSquad = [goalkeeper, ...outfield];
    const automatic = buildAutomaticLineup(smallSquad, undefined, 8);
    expect(automatic.lineup).toHaveLength(8);
    expect(FORMATIONS.find(formation => formation.id === automatic.formationId)?.slots).toHaveLength(8);
  });

  it("returns a server-ranked result with formation metrics", () => {
    const automatic = buildAutomaticLineup(sampleSquad);
    const manager: ManagerView & { budget: number } = {
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
