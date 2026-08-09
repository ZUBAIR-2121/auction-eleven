import {
  getOpeningBid,
  getSquadCompletion,
  getStartingLineupSize,
  type BotDifficulty,
  type Footballer,
  type GameSettings,
  type Position,
  type SquadEntry
} from "@auction-eleven/shared";
import { buildAutomaticLineup } from "../gameEngine.js";
import {
  createSeededRandom,
  emptyOpponentModel,
  evaluateBotDecision,
  personalityForIndex,
  stableBotSeed,
  type MarketSale,
  type RemainingPoolSummary
} from "./botEngine.js";

export interface BotSimulationMetrics {
  difficulty: BotDifficulty;
  matches: number;
  completionRate: number;
  averageLineupScore: number;
  averageBudgetRemaining: number;
  averageSquadSize: number;
  averageOverpayment: number;
}

function shuffled<T>(input: readonly T[], rng: () => number): T[] {
  const output = [...input];
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [output[i], output[j]] = [output[j]!, output[i]!];
  }
  return output;
}

function remainingSummary(players: readonly Footballer[]): RemainingPoolSummary {
  const byPosition: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const byRole: RemainingPoolSummary["byRole"] = {};
  for (const player of players) {
    byPosition[player.position]++;
    for (const role of new Set([...(player.primaryRoles?.length ? player.primaryRoles : [player.primaryRole]), ...player.secondaryRoles])) {
      byRole[role] = (byRole[role] ?? 0) + 1;
    }
  }
  return { total: players.length, byPosition, byRole };
}

export function runBotStrategySimulation(args: {
  footballers: readonly Footballer[];
  settings: GameSettings;
  difficulty: BotDifficulty;
  matches?: number;
  seed?: number;
}): BotSimulationMetrics {
  const matches = Math.max(1, args.matches ?? 100);
  let completed = 0;
  let scoreTotal = 0;
  let budgetTotal = 0;
  let squadTotal = 0;
  let overpayTotal = 0;
  let overpayPurchases = 0;

  for (let match = 0; match < matches; match++) {
    const seed = stableBotSeed(args.seed ?? 12345, args.difficulty, match);
    const rng = createSeededRandom(seed);
    const queue = shuffled(args.footballers, rng);
    const squad: SquadEntry[] = [];
    const marketHistory: MarketSale[] = [];
    let budget = args.settings.startingBudget;
    const personality = personalityForIndex(match);

    for (let round = 0; round < queue.length; round++) {
      const footballer = queue[round]!;
      const completion = getSquadCompletion(squad, args.settings);
      if (completion.squadFull || (completion.startersComplete && round > queue.length * .82)) break;
      const opening = getOpeningBid(args.settings, footballer);
      const marketPressure = .58 + rng() * .78;
      const syntheticLeaderBid = Math.max(opening, Math.round(footballer.basePrice * marketPressure));
      const currentBid = Math.max(0, syntheticLeaderBid - args.settings.bidIncrement);
      const decision = evaluateBotDecision({
        bot: { id: "sim-bot", name: "Simulation Bot", budget, squad, auctionComplete: false },
        footballer,
        currentBid,
        highestBidderId: "sim-opponent",
        openingBid: opening,
        roundIndex: round,
        totalRounds: queue.length,
        timeRemainingMs: args.settings.auctionSeconds * 1000 * (.35 + rng() * .6),
        settings: args.settings,
        difficulty: args.difficulty,
        personality,
        opponents: [{ id: "sim-opponent", name: "Public Opponent", squad: [], auctionComplete: false, connected: true, isBot: false, passedCurrentRound: false }],
        opponentModels: new Map([["sim-opponent", emptyOpponentModel()]]),
        marketHistory,
        remainingPool: remainingSummary(queue.slice(round + 1)),
        seed: stableBotSeed(seed, round)
      });

      if (decision.action === "BID" && decision.bidAmount && decision.bidAmount <= budget) {
        budget -= decision.bidAmount;
        squad.push({ footballer, price: decision.bidAmount, round: round + 1 });
        overpayTotal += Math.max(0, decision.bidAmount - footballer.basePrice);
        overpayPurchases++;
        marketHistory.push({
          playerType: footballer.playerType ?? "CURRENT",
          position: footballer.position,
          overall: footballer.overall,
          price: decision.bidAmount,
          basePrice: footballer.basePrice
        });
      } else {
        marketHistory.push({
          playerType: footballer.playerType ?? "CURRENT",
          position: footballer.position,
          overall: footballer.overall,
          price: syntheticLeaderBid,
          basePrice: footballer.basePrice
        });
      }
    }

    const completion = getSquadCompletion(squad, args.settings);
    if (completion.startersComplete) completed++;
    const auto = buildAutomaticLineup(squad, undefined, getStartingLineupSize(args.settings.squadSize));
    scoreTotal += Math.max(0, auto.score);
    budgetTotal += budget;
    squadTotal += squad.length;
  }

  return {
    difficulty: args.difficulty,
    matches,
    completionRate: completed / matches,
    averageLineupScore: scoreTotal / matches,
    averageBudgetRemaining: budgetTotal / matches,
    averageSquadSize: squadTotal / matches,
    averageOverpayment: overpayPurchases ? overpayTotal / overpayPurchases : 0
  };
}
