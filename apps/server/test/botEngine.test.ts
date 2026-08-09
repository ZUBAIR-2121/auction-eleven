import { describe, expect, it } from "vitest";
import { getOpeningBid, type Footballer, type GameSettings, type SquadEntry } from "@auction-eleven/shared";
import { FOOTBALLERS } from "../src/footballers.js";
import { DEFAULT_SETTINGS } from "../src/gameEngine.js";
import {
  emptyOpponentModel,
  evaluateBotDecision,
  evaluateBotDone,
  personalityForIndex,
  recordObservedBid,
  stableBotSeed,
  type BotDecisionContext,
  type RemainingPoolSummary
} from "../src/ai/botEngine.js";

const player = (name: string): Footballer => {
  const found = FOOTBALLERS.find(item => item.name === name);
  if (!found) throw new Error(`Missing fixture footballer: ${name}`);
  return found;
};

const settings = (difficulty: GameSettings["botDifficulty"] = "Legendary"): GameSettings => ({
  ...DEFAULT_SETTINGS,
  botDifficulty: difficulty,
  playerPoolMode: "mixed",
  squadSize: 11,
  substituteCount: 5,
  startingBudget: 1000
});

function summary(remaining: Footballer[]): RemainingPoolSummary {
  const byPosition = { GK: 0, DEF: 0, MID: 0, FWD: 0 } as RemainingPoolSummary["byPosition"];
  const byRole: RemainingPoolSummary["byRole"] = {};
  for (const footballer of remaining) {
    byPosition[footballer.position]++;
    for (const role of new Set([...(footballer.primaryRoles?.length ? footballer.primaryRoles : [footballer.primaryRole]), ...footballer.secondaryRoles])) {
      byRole[role] = (byRole[role] ?? 0) + 1;
    }
  }
  return { total: remaining.length, byPosition, byRole };
}

const entry = (footballer: Footballer, price = 20): SquadEntry => ({ footballer, price, round: 1 });

const completeEliteSquad = (): SquadEntry[] => [
  "Lev Yashin", "Paolo Maldini", "Virgil van Dijk", "Franz Beckenbauer", "Cafu",
  "Rodri", "Ruud Gullit", "Xavi Hernández", "Ronaldo Nazário", "Lionel Messi", "Neymar"
].map(name => entry(player(name)));

function context(args: {
  footballer: Footballer;
  squad?: SquadEntry[];
  budget?: number;
  currentBid?: number;
  difficulty?: GameSettings["botDifficulty"];
  roundIndex?: number;
  remaining?: Footballer[];
  seed?: number;
}): BotDecisionContext {
  const gameSettings = settings(args.difficulty);
  return {
    bot: { id: "bot", name: "Test Bot", budget: args.budget ?? 1000, squad: args.squad ?? [], auctionComplete: false },
    footballer: args.footballer,
    currentBid: args.currentBid ?? 0,
    highestBidderId: null,
    openingBid: getOpeningBid(gameSettings, args.footballer),
    roundIndex: args.roundIndex ?? 5,
    totalRounds: 60,
    timeRemainingMs: 7000,
    settings: gameSettings,
    difficulty: args.difficulty ?? "Legendary",
    personality: "TACTICIAN",
    opponents: [{ id: "human", name: "Human", squad: [], auctionComplete: false, connected: true, isBot: false, passedCurrentRound: false }],
    opponentModels: new Map([["human", emptyOpponentModel()]]),
    marketHistory: [],
    remainingPool: summary(args.remaining ?? FOOTBALLERS.slice(0, 50)),
    seed: args.seed ?? 12345
  };
}

describe("strategic bot engine", () => {
  it("values a strong goalkeeper highly when the bot has no goalkeeper", () => {
    const strongGk = player("Lev Yashin");
    const squad = [player("Virgil van Dijk"), player("Rodri"), player("Erling Haaland")].map(entry);
    const decision = evaluateBotDecision(context({ footballer: strongGk, squad }));
    expect(decision.maxBid).toBeGreaterThan(strongGk.basePrice);
    expect(decision.factors.positionalNeed).toBeGreaterThan(0);
  });

  it("does not chase a weaker striker when an elite striker is already owned", () => {
    const weaker = FOOTBALLERS.filter(item => item.position === "FWD" && item.overall <= 90).sort((a, b) => a.overall - b.overall)[0]!;
    const decision = evaluateBotDecision(context({ footballer: weaker, squad: completeEliteSquad(), currentBid: Math.max(weaker.basePrice, 55) }));
    expect(decision.action).toBe("PASS");
  });

  it("reserves budget for unfinished starting positions instead of emptying the wallet on a luxury winger", () => {
    const luxury = player("Ronaldinho");
    const squad = [entry(player("Virgil van Dijk")), entry(player("Rodri")), entry(player("Erling Haaland"))];
    const decision = evaluateBotDecision(context({ footballer: luxury, squad, budget: 150, currentBid: 85 }));
    expect(decision.reserveBudget).toBeGreaterThan(0);
    expect(decision.action).toBe("PASS");
  });

  it("raises valuation when a needed role is scarce", () => {
    const cb = player("Paolo Maldini");
    const squad = [entry(player("Lev Yashin")), entry(player("Lionel Messi")), entry(player("Erling Haaland"))];
    const abundant = evaluateBotDecision(context({ footballer: cb, squad, remaining: FOOTBALLERS.filter(item => item.position === "DEF").slice(0, 35), seed: 7 }));
    const scarce = evaluateBotDecision(context({ footballer: cb, squad, remaining: [cb], seed: 7 }));
    expect(scarce.maxBid).toBeGreaterThanOrEqual(abundant.maxBid);
    expect(scarce.factors.scarcity).toBeGreaterThan(abundant.factors.scarcity);
  });

  it("passes on extreme overpayment on smart difficulties", () => {
    const footballer = player("Mohamed Salah");
    const decision = evaluateBotDecision(context({ footballer, currentBid: footballer.basePrice * 3, difficulty: "Legendary" }));
    expect(decision.action).toBe("PASS");
  });

  it("does not automatically chase an icon when the position is already strong", () => {
    const icon = player("Ronaldinho");
    const squad = completeEliteSquad();
    const decision = evaluateBotDecision(context({ footballer: icon, squad, currentBid: icon.basePrice * 2 }));
    expect(decision.action).toBe("PASS");
  });

  it("treats Gullit's CAM dual-primary role as a full-value need", () => {
    const gullit = player("Ruud Gullit");
    expect(gullit.primaryRoles).toContain("CAM");
    const squad = [entry(player("Lev Yashin")), entry(player("Virgil van Dijk")), entry(player("Erling Haaland"))];
    const decision = evaluateBotDecision(context({ footballer: gullit, squad }));
    expect(decision.factors.positionalNeed).toBeGreaterThan(0);
    expect(decision.factors.versatility).toBeGreaterThan(0);
  });

  it("prioritizes starter completion over luxury bench depth", () => {
    const gk = player("Gianluigi Buffon");
    const winger = player("Rafael Leão");
    const squad = [entry(player("Virgil van Dijk")), entry(player("Rodri")), entry(player("Erling Haaland")), entry(player("Lionel Messi"))];
    const gkDecision = evaluateBotDecision(context({ footballer: gk, squad, seed: 22 }));
    const wingDecision = evaluateBotDecision(context({ footballer: winger, squad, seed: 22 }));
    expect(gkDecision.maxBid).toBeGreaterThan(wingDecision.maxBid);
  });

  it("World Class protects future budget more consistently than Amateur in a risky state", () => {
    const footballer = player("Neymar");
    const squad = [entry(player("Virgil van Dijk")), entry(player("Rodri")), entry(player("Erling Haaland"))];
    const amateur = evaluateBotDecision(context({ footballer, squad, budget: 500, currentBid: 70, difficulty: "Amateur", seed: 44 }));
    const world = evaluateBotDecision(context({ footballer, squad, budget: 500, currentBid: 70, difficulty: "World Class", seed: 44 }));
    expect(world.reserveBudget).toBeGreaterThan(amateur.reserveBudget);
  });

  it("Legendary lookahead can reject an expensive optional signing when future starter funding is at risk", () => {
    const footballer = player("Lionel Messi");
    const squad = [entry(player("Virgil van Dijk")), entry(player("Rodri")), entry(player("Erling Haaland"))];
    const decision = evaluateBotDecision(context({ footballer, squad, budget: 180, currentBid: 95, difficulty: "Legendary", seed: 99 }));
    expect(decision.action).toBe("PASS");
    expect(decision.reserveBudget).toBeGreaterThan(0);
  });

  it("becomes more urgent for a critical position late in the auction", () => {
    const goalkeeper = player("Lev Yashin");
    const squad = [entry(player("Virgil van Dijk")), entry(player("Rodri")), entry(player("Erling Haaland"))];
    const early = evaluateBotDecision(context({ footballer: goalkeeper, squad, roundIndex: 4, seed: 17 }));
    const lateContext = context({ footballer: goalkeeper, squad, roundIndex: 55, seed: 17 });
    lateContext.remainingPool = summary([goalkeeper]);
    const late = evaluateBotDecision(lateContext);
    expect(late.maxBid).toBeGreaterThan(early.maxBid);
  });

  it("produces reproducible decisions with the same seed", () => {
    const c = context({ footballer: player("Lionel Messi"), seed: 123456 });
    expect(evaluateBotDecision(c)).toEqual(evaluateBotDecision(c));
  });

  it("never requires opponent budget data in its public opponent model", () => {
    const c = context({ footballer: player("Lionel Messi") });
    expect(c.opponents[0]).not.toHaveProperty("budget");
    const decision = evaluateBotDecision(c);
    expect(["BID", "PASS", "WAIT"]).toContain(decision.action);
  });

  it("learns only from public bid behaviour", () => {
    const footballer = player("Lionel Messi");
    const model = recordObservedBid(undefined, footballer, 80, 70, 1, .8);
    expect(model.bids).toBe(1);
    expect(model.aggressionScore).toBeGreaterThan(0);
    expect(model.positionInterest.RW).toBeGreaterThan(0);
    expect(model.lateBidFrequency).toBeGreaterThan(0);
  });

  it("does not allow bot DONE before starters are complete", () => {
    const done = evaluateBotDone({
      squad: [entry(player("Lev Yashin")), entry(player("Virgil van Dijk"))],
      budget: 700,
      settings: settings("Legendary"),
      difficulty: "Legendary",
      personality: personalityForIndex(0),
      remainingRounds: 30,
      marketHistory: [],
      seed: stableBotSeed(1)
    });
    expect(done.action).toBe("WAIT");
  });
});
