import {
  FORMATIONS,
  getConfiguredSquadSize,
  getFootballerPrimaryRoles,
  getFootballerRoles,
  getFootballerSecondaryRoles,
  getOpeningBid,
  getSquadCompletion,
  getSquadPositionTargets,
  getStartingLineupSize,
  type BotDifficulty,
  type Footballer,
  type GameSettings,
  type LineupRole,
  type PlayerType,
  type Position,
  type SquadEntry
} from "@auction-eleven/shared";
import { buildAutomaticLineup, calculatePlayerSlotFit, rolePosition } from "../gameEngine.js";

export type BotAction = "BID" | "PASS" | "DONE" | "WAIT";
export type BotPersonality = "BALANCED" | "VALUE_HUNTER" | "AGGRESSIVE" | "STAR_COLLECTOR" | "TACTICIAN" | "PATIENT";

export interface BotDecision {
  action: BotAction;
  bidAmount?: number;
  confidence: number;
  reasons: string[];
  estimatedValue: number;
  maxBid: number;
  reserveBudget: number;
  factors: {
    baseValue: number;
    positionalNeed: number;
    lineupUpgrade: number;
    versatility: number;
    scarcity: number;
    lateAuction: number;
    marketAdjustment: number;
    opponentPressure: number;
    starPreference: number;
    lookahead: number;
    budgetRisk: number;
    uncertainty: number;
  };
}

export interface OpponentModelState {
  bids: number;
  passes: number;
  aggressionScore: number;
  iconInterest: number;
  earlyBidFrequency: number;
  lateBidFrequency: number;
  averageBidEscalation: number;
  positionInterest: Partial<Record<LineupRole, number>>;
}

export interface PublicOpponentSnapshot {
  id: string;
  name: string;
  squad: SquadEntry[];
  auctionComplete: boolean;
  connected: boolean;
  isBot: boolean;
  passedCurrentRound: boolean;
}

export interface MarketSale {
  playerType: PlayerType;
  position: Position;
  overall: number;
  price: number;
  basePrice: number;
}

export interface RemainingPoolSummary {
  total: number;
  byPosition: Record<Position, number>;
  byRole: Partial<Record<LineupRole, number>>;
}

export interface BotDecisionContext {
  bot: {
    id: string;
    name: string;
    budget: number;
    squad: SquadEntry[];
    auctionComplete: boolean;
  };
  footballer: Footballer;
  currentBid: number;
  highestBidderId: string | null;
  openingBid: number;
  roundIndex: number;
  totalRounds: number;
  timeRemainingMs: number;
  settings: GameSettings;
  difficulty: BotDifficulty;
  personality: BotPersonality;
  opponents: PublicOpponentSnapshot[];
  opponentModels: ReadonlyMap<string, OpponentModelState>;
  marketHistory: readonly MarketSale[];
  remainingPool: RemainingPoolSummary;
  seed: number;
  /** 0 = full planning budget, higher values reduce only expensive lookahead. */
  loadFactor?: number;
}

export interface BotDoneContext {
  squad: SquadEntry[];
  budget: number;
  settings: GameSettings;
  difficulty: BotDifficulty;
  personality: BotPersonality;
  remainingRounds: number;
  marketHistory: readonly MarketSale[];
  seed: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const money = (value: number) => Math.max(0, Math.round(value));

export function createSeededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stableBotSeed(...parts: Array<string | number>): number {
  let hash = 2166136261;
  for (const part of parts) {
    const text = String(part);
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

export function personalityForIndex(index: number): BotPersonality {
  const personalities: BotPersonality[] = ["VALUE_HUNTER", "AGGRESSIVE", "STAR_COLLECTOR", "BALANCED", "TACTICIAN", "PATIENT"];
  return personalities[Math.abs(index) % personalities.length]!;
}

export function emptyOpponentModel(): OpponentModelState {
  return {
    bids: 0,
    passes: 0,
    aggressionScore: 0,
    iconInterest: 0,
    earlyBidFrequency: 0,
    lateBidFrequency: 0,
    averageBidEscalation: 0,
    positionInterest: {}
  };
}

export function recordObservedBid(
  previous: OpponentModelState | undefined,
  footballer: Footballer,
  amount: number,
  previousBid: number,
  openingBid: number,
  roundProgress: number
): OpponentModelState {
  const model = previous ? { ...previous, positionInterest: { ...previous.positionInterest } } : emptyOpponentModel();
  const bids = model.bids + 1;
  const normalizedAggression = clamp(amount / Math.max(openingBid, footballer.basePrice, 1), 0, 2.5) / 2.5;
  model.aggressionScore = clamp((model.aggressionScore * model.bids + normalizedAggression) / bids, 0, 1);
  const escalation = Math.max(0, amount - previousBid);
  model.averageBidEscalation = (model.averageBidEscalation * model.bids + escalation) / bids;
  model.bids = bids;
  if (footballer.playerType === "ICON") model.iconInterest = clamp(model.iconInterest * .9 + .1, 0, 1);
  if (roundProgress <= .35) model.earlyBidFrequency = clamp(model.earlyBidFrequency * .92 + .08, 0, 1);
  if (roundProgress >= .72) model.lateBidFrequency = clamp(model.lateBidFrequency * .92 + .08, 0, 1);
  for (const role of getFootballerRoles(footballer)) {
    model.positionInterest[role] = clamp((model.positionInterest[role] ?? 0) * .92 + .08, 0, 1);
  }
  return model;
}

export function recordObservedPass(previous: OpponentModelState | undefined): OpponentModelState {
  const model = previous ? { ...previous, positionInterest: { ...previous.positionInterest } } : emptyOpponentModel();
  model.passes += 1;
  model.aggressionScore *= .985;
  model.iconInterest *= .995;
  return model;
}

const DIFFICULTY = {
  Amateur: {
    needWeight: .42,
    upgradeWeight: .38,
    versatilityWeight: .22,
    scarcityWeight: .16,
    marketWeight: .08,
    opponentWeight: 0,
    reserveFactor: .33,
    overpayTolerance: 1.16,
    noise: .20,
    lookaheadDepth: 0,
    beamWidth: 1,
    bidSteps: 1
  },
  Professional: {
    needWeight: .70,
    upgradeWeight: .62,
    versatilityWeight: .36,
    scarcityWeight: .38,
    marketWeight: .28,
    opponentWeight: .10,
    reserveFactor: .48,
    overpayTolerance: 1.08,
    noise: .12,
    lookaheadDepth: 1,
    beamWidth: 2,
    bidSteps: 2
  },
  "World Class": {
    needWeight: .98,
    upgradeWeight: .88,
    versatilityWeight: .50,
    scarcityWeight: .66,
    marketWeight: .52,
    opponentWeight: .22,
    reserveFactor: .60,
    overpayTolerance: 1.04,
    noise: .07,
    lookaheadDepth: 3,
    beamWidth: 4,
    bidSteps: 3
  },
  Legendary: {
    needWeight: 1.10,
    upgradeWeight: 1.02,
    versatilityWeight: .58,
    scarcityWeight: .82,
    marketWeight: .66,
    opponentWeight: .32,
    reserveFactor: .70,
    overpayTolerance: 1.02,
    noise: .04,
    lookaheadDepth: 4,
    beamWidth: 6,
    bidSteps: 4
  }
} as const;

const PERSONALITY = {
  BALANCED: { value: 1, need: 1, reserve: 1, star: .02, patience: .45, aggression: 1, versatility: 1 },
  VALUE_HUNTER: { value: .94, need: 1.02, reserve: 1.10, star: 0, patience: .66, aggression: .84, versatility: 1.02 },
  AGGRESSIVE: { value: 1.07, need: 1.02, reserve: .92, star: .025, patience: .24, aggression: 1.18, versatility: .96 },
  STAR_COLLECTOR: { value: 1.01, need: .96, reserve: .96, star: .075, patience: .37, aggression: 1.05, versatility: .96 },
  TACTICIAN: { value: .99, need: 1.13, reserve: 1.04, star: .01, patience: .48, aggression: .97, versatility: 1.18 },
  PATIENT: { value: .96, need: 1.04, reserve: 1.12, star: .01, patience: .78, aggression: .88, versatility: 1.08 }
} as const;

const SUPERSTARS = new Set([
  "lionel messi", "cristiano ronaldo", "kylian mbappé", "neymar", "ronaldinho",
  "ronaldo nazário", "pelé", "ruud gullit", "diego maradona", "johan cruyff"
]);

const ROLE_DEMAND_CACHE = new Map<number, Partial<Record<LineupRole, number>>>();
const VERSATILITY_CACHE = new Map<string, number>();

function roleDemandForStarters(starters: number): Partial<Record<LineupRole, number>> {
  const cached = ROLE_DEMAND_CACHE.get(starters);
  if (cached) return cached;
  const formations = FORMATIONS.filter(formation => formation.slots.length === starters);
  const totals: Partial<Record<LineupRole, number>> = {};
  if (!formations.length) return totals;
  for (const formation of formations) {
    for (const slot of formation.slots) totals[slot.role] = (totals[slot.role] ?? 0) + 1;
  }
  for (const role of Object.keys(totals) as LineupRole[]) totals[role] = (totals[role] ?? 0) / formations.length;
  ROLE_DEMAND_CACHE.set(starters, totals);
  return totals;
}

function naturalRoleCoverage(squad: SquadEntry[], role: LineupRole): number {
  let coverage = 0;
  for (const entry of squad) {
    const player = entry.footballer;
    if (getFootballerPrimaryRoles(player).includes(role)) coverage += 1;
    else if (getFootballerSecondaryRoles(player).includes(role)) coverage += .68;
  }
  return coverage;
}

function positionalNeedScore(squad: SquadEntry[], player: Footballer, settings: GameSettings): number {
  const starters = getStartingLineupSize(settings.squadSize);
  const broadTargets = getSquadPositionTargets(starters);
  const broadOwned = squad.filter(entry => entry.footballer.position === player.position).length;
  const broadNeed = clamp((broadTargets[player.position] - broadOwned) / Math.max(1, broadTargets[player.position]), 0, 1);
  const demand = roleDemandForStarters(starters);
  const primary = getFootballerPrimaryRoles(player);
  const secondary = getFootballerSecondaryRoles(player);
  const scores: number[] = [];
  for (const role of primary) {
    const target = Math.max(.5, demand[role] ?? .5);
    scores.push(clamp((target - naturalRoleCoverage(squad, role)) / target, 0, 1));
  }
  for (const role of secondary) {
    const target = Math.max(.5, demand[role] ?? .5);
    scores.push(clamp((target - naturalRoleCoverage(squad, role)) / target, 0, 1) * .76);
  }
  scores.sort((a, b) => b - a);
  const roleNeed = (scores[0] ?? 0) * .78 + (scores[1] ?? 0) * .22;
  const completion = getSquadCompletion(squad, settings);
  const hardNeed = !completion.goalkeeperReady && player.position === "GK" ? 1 : 0;
  return clamp(Math.max(hardNeed, broadNeed * .55 + roleNeed * .70), 0, 1.25);
}

function lineupUpgradeScore(squad: SquadEntry[], player: Footballer, settings: GameSettings): number {
  const starters = getStartingLineupSize(settings.squadSize);
  const completion = getSquadCompletion(squad, settings);
  const demand = roleDemandForStarters(starters);
  const candidateRoles = getFootballerRoles(player);
  let bestRoleUpgrade = 0;
  let weightedUpgrade = 0;

  for (const role of candidateRoles) {
    const candidateFit = calculatePlayerSlotFit(player, role);
    let bestExisting = 0;
    for (const entry of squad) bestExisting = Math.max(bestExisting, calculatePlayerSlotFit(entry.footballer, role));
    const improvement = Math.max(0, candidateFit - bestExisting) / 32;
    const roleWeight = Math.max(.35, demand[role] ?? .35);
    bestRoleUpgrade = Math.max(bestRoleUpgrade, improvement);
    weightedUpgrade += improvement * Math.min(1, roleWeight);
  }

  let starterVacancy = 0;
  if (!completion.startersComplete) {
    if (!completion.goalkeeperReady && player.position === "GK") starterVacancy = 1;
    else if (player.position !== "GK" && completion.startersRemaining > 0) starterVacancy = .58;
  }

  // Weakest-link thinking without rebuilding every possible formation on every
  // bid: compare the card against the weakest owned player in its broad area.
  const sameArea = squad.filter(entry => entry.footballer.position === player.position).map(entry => entry.footballer.overall);
  const weakest = sameArea.length ? Math.min(...sameArea) : 0;
  const broadUpgrade = weakest ? Math.max(0, player.overall - weakest) / 18 : .45;
  return clamp(starterVacancy * .62 + bestRoleUpgrade * .54 + weightedUpgrade * .14 + broadUpgrade * .24, 0, 1.5);
}

function versatilityScore(player: Footballer, starters: number): number {
  const key = `${player.canonicalId ?? player.catalogId ?? player.id}:${starters}`;
  const cached = VERSATILITY_CACHE.get(key);
  if (cached !== undefined) return cached;
  const primaries = getFootballerPrimaryRoles(player);
  const secondaries = getFootballerSecondaryRoles(player);
  const demand = roleDemandForStarters(starters);
  const playable = new Set(getFootballerRoles(player));
  const demandedRoles = Object.keys(demand) as LineupRole[];
  const fit = demandedRoles.length
    ? demandedRoles.filter(role => playable.has(role)).reduce((sum, role) => sum + Math.min(1, demand[role] ?? 0), 0) / demandedRoles.length
    : 0;
  const score = clamp((primaries.length - 1) * .34 + secondaries.length * .13 + fit * .34, 0, 1.25);
  VERSATILITY_CACHE.set(key, score);
  return score;
}

function scarcityScore(squad: SquadEntry[], player: Footballer, remaining: RemainingPoolSummary, settings: GameSettings): number {
  const need = positionalNeedScore(squad, player, settings);
  if (need <= .05) return 0;
  let best = 0;
  for (const role of getFootballerPrimaryRoles(player)) {
    const count = remaining.byRole[role] ?? remaining.byPosition[rolePosition(role)] ?? 0;
    best = Math.max(best, 1 / Math.max(1, count));
  }
  for (const role of getFootballerSecondaryRoles(player)) {
    const count = remaining.byRole[role] ?? remaining.byPosition[rolePosition(role)] ?? 0;
    best = Math.max(best, .72 / Math.max(1, count));
  }
  const broadRemaining = remaining.byPosition[player.position] ?? 0;
  const broadScarcity = 1 / Math.max(1, broadRemaining);
  return clamp(need * (Math.max(best * 4.2, broadScarcity * 2.2)), 0, 1.2);
}

function averageMarketRatio(history: readonly MarketSale[], player: Footballer): number {
  if (!history.length) return 1;
  const comparable = history.filter(sale =>
    sale.position === player.position ||
    sale.playerType === (player.playerType ?? "CURRENT") ||
    Math.abs(sale.overall - player.overall) <= 2
  ).slice(-18);
  if (!comparable.length) return 1;
  let weighted = 0;
  let weights = 0;
  for (const sale of comparable) {
    let weight = 1;
    if (sale.position === player.position) weight += 1.2;
    if (sale.playerType === (player.playerType ?? "CURRENT")) weight += .5;
    if (Math.abs(sale.overall - player.overall) <= 2) weight += 1;
    const ratio = clamp(sale.price / Math.max(1, sale.basePrice), .35, 2.2);
    weighted += ratio * weight;
    weights += weight;
  }
  return clamp(weighted / Math.max(1, weights), .72, 1.48);
}

function opponentPressureScore(context: BotDecisionContext, need: number): number {
  if (!context.opponents.length || need <= .1) return 0;
  const roles = getFootballerRoles(context.footballer);
  let interest = 0;
  let aggression = 0;
  let observed = 0;
  for (const opponent of context.opponents) {
    const model = context.opponentModels.get(opponent.id);
    if (!model) continue;
    observed++;
    aggression += model.aggressionScore;
    interest += Math.max(0, ...roles.map(role => model.positionInterest[role] ?? 0));
  }
  if (!observed) return 0;
  return clamp((interest / observed) * .65 + (aggression / observed) * .35, 0, 1) * need;
}

function expectedRequiredUnitCost(settings: GameSettings, difficulty: BotDifficulty, personality: BotPersonality, marketRatio: number): number {
  const slots = getConfiguredSquadSize(settings.squadSize, settings.substituteCount);
  const baseUnit = settings.startingBudget / Math.max(getStartingLineupSize(settings.squadSize), slots * .78);
  return Math.max(settings.minimumBid, baseUnit * DIFFICULTY[difficulty].reserveFactor * PERSONALITY[personality].reserve * clamp(marketRatio, .8, 1.25));
}

function reserveAfterHypotheticalPurchase(context: BotDecisionContext, marketRatio: number): number {
  const projected: SquadEntry[] = [...context.bot.squad, { footballer: context.footballer, price: 0, round: 0 }];
  const completion = getSquadCompletion(projected, context.settings);
  const unit = expectedRequiredUnitCost(context.settings, context.difficulty, context.personality, marketRatio);
  const startersReserve = completion.startersRemaining * unit;
  const emergencyBuffer = completion.startersComplete
    ? context.settings.startingBudget * (context.difficulty === "Legendary" ? .035 : context.difficulty === "World Class" ? .025 : .01)
    : context.settings.startingBudget * .02;
  return money(Math.min(context.bot.budget, startersReserve + emergencyBuffer));
}

interface LookaheadInput {
  context: BotDecisionContext;
  need: number;
  upgrade: number;
  scarcity: number;
  fairValue: number;
  reserve: number;
}

function boundedLookahead(input: LookaheadInput): number {
  const { context, need, upgrade, scarcity, fairValue, reserve } = input;
  const config = DIFFICULTY[context.difficulty];
  const loadFactor = clamp(context.loadFactor ?? 0, 0, .85);
  const depth = config.lookaheadDepth <= 0 ? 0 : Math.max(1, Math.round(config.lookaheadDepth * (1 - loadFactor * .58)));
  const beamWidth = config.beamWidth <= 1 ? 1 : Math.max(2, Math.round(config.beamWidth * (1 - loadFactor * .48)));
  if (depth <= 0) return 0;
  const nextBid = context.currentBid === 0 ? context.openingBid : context.currentBid + context.settings.bidIncrement;
  const completion = getSquadCompletion(context.bot.squad, context.settings);
  const marketRatio = averageMarketRatio(context.marketHistory, context.footballer);
  const expectedUnit = expectedRequiredUnitCost(context.settings, context.difficulty, context.personality, marketRatio);

  type State = { root: "BUY" | "PASS"; budget: number; startersMissing: number; score: number; scarcity: number };
  const buyState: State = {
    root: "BUY",
    budget: Math.max(0, context.bot.budget - nextBid),
    startersMissing: Math.max(0, completion.startersRemaining - (need >= .55 ? 1 : 0)),
    score: upgrade * 18 + need * 13 + scarcity * 9 - Math.max(0, nextBid - fairValue) * .16,
    // Securing a genuinely needed scarce role removes most of that future risk.
    scarcity: scarcity * (need >= .55 ? .22 : .70)
  };
  const passState: State = {
    root: "PASS",
    budget: context.bot.budget,
    startersMissing: completion.startersRemaining,
    score: Math.max(0, (context.bot.budget - reserve) / Math.max(1, context.settings.startingBudget)) * 3 - scarcity * need * 8,
    scarcity
  };

  let states = [buyState, passState];
  for (let step = 0; step < depth; step++) {
    const next: State[] = [];
    for (const state of states) {
      const lateMultiplier = 1 + ((step + 1) / depth) * .25;
      if (state.startersMissing > 0 && state.budget >= expectedUnit) {
        next.push({
          ...state,
          budget: state.budget - expectedUnit,
          startersMissing: state.startersMissing - 1,
          score: state.score + 8.5 * lateMultiplier - state.scarcity * 1.5
        });
      }
      next.push({
        ...state,
        score: state.score + (state.startersMissing === 0 ? 1.6 : -2.2 * lateMultiplier) - state.scarcity * state.startersMissing * .8,
        scarcity: clamp(state.scarcity * 1.08, 0, 1.5)
      });
    }
    states = next.sort((a, b) => b.score - a.score).slice(0, beamWidth * 2);
  }

  const bestBuy = Math.max(-Infinity, ...states.filter(state => state.root === "BUY").map(state => state.score));
  const bestPass = Math.max(-Infinity, ...states.filter(state => state.root === "PASS").map(state => state.score));
  if (!Number.isFinite(bestBuy) || !Number.isFinite(bestPass)) return 0;
  return clamp((bestBuy - bestPass) / 18, -1, 1);
}

function alignBid(maxBid: number, context: BotDecisionContext, rng: () => number): number {
  const minimum = context.currentBid === 0 ? context.openingBid : context.currentBid + context.settings.bidIncrement;
  if (maxBid < minimum) return 0;
  const maxSteps = Math.max(0, Math.floor((maxBid - minimum) / context.settings.bidIncrement));
  const personalityAggression = PERSONALITY[context.personality].aggression;
  const difficultySteps = DIFFICULTY[context.difficulty].bidSteps;
  const desiredSteps = Math.min(maxSteps, Math.max(0, Math.floor(rng() * difficultySteps * personalityAggression)));
  return minimum + desiredSteps * context.settings.bidIncrement;
}

export function evaluateBotDecision(context: BotDecisionContext): BotDecision {
  const rng = createSeededRandom(context.seed);
  const config = DIFFICULTY[context.difficulty];
  const personality = PERSONALITY[context.personality];
  const player = context.footballer;
  const factors: BotDecision["factors"] = {
    baseValue: 0,
    positionalNeed: 0,
    lineupUpgrade: 0,
    versatility: 0,
    scarcity: 0,
    lateAuction: 0,
    marketAdjustment: 0,
    opponentPressure: 0,
    starPreference: 0,
    lookahead: 0,
    budgetRisk: 0,
    uncertainty: 0
  };

  if (context.bot.auctionComplete) {
    return { action: "WAIT", confidence: 1, reasons: ["Auction participation already complete."], estimatedValue: 0, maxBid: 0, reserveBudget: context.bot.budget, factors };
  }
  if (context.highestBidderId === context.bot.id) {
    return { action: "WAIT", confidence: .96, reasons: ["Already leading the current footballer."], estimatedValue: context.currentBid, maxBid: context.currentBid, reserveBudget: 0, factors };
  }

  const completion = getSquadCompletion(context.bot.squad, context.settings);
  const maxSquad = getConfiguredSquadSize(context.settings.squadSize, context.settings.substituteCount);
  if (context.bot.squad.length >= maxSquad) {
    return { action: "PASS", confidence: 1, reasons: ["Squad capacity is full."], estimatedValue: 0, maxBid: 0, reserveBudget: context.bot.budget, factors };
  }

  const economyScale = clamp(context.settings.startingBudget / 1000, .42, 2.8);
  const baseValue = Math.max(context.openingBid, player.basePrice * economyScale * (1 + Math.max(0, player.overall - 88) * .009));
  factors.baseValue = baseValue;

  const rawNeed = positionalNeedScore(context.bot.squad, player, context.settings);
  // Once the starting XI is fieldable, positional demand becomes an upgrade/
  // bench consideration rather than an emergency vacancy. Quality improvement
  // still carries full weight through lineupUpgradeScore().
  const need = completion.startersComplete ? rawNeed * .34 : rawNeed;
  const upgrade = lineupUpgradeScore(context.bot.squad, player, context.settings);
  const versatility = versatilityScore(player, getStartingLineupSize(context.settings.squadSize));
  const scarcity = scarcityScore(context.bot.squad, player, context.remainingPool, context.settings) * (completion.startersComplete ? .38 : 1);
  const progress = context.totalRounds <= 1 ? 1 : clamp(context.roundIndex / Math.max(1, context.totalRounds - 1), 0, 1);
  const marketRatio = averageMarketRatio(context.marketHistory, player);
  const pressure = opponentPressureScore(context, need);
  const star = SUPERSTARS.has(player.name.toLowerCase()) || player.overall >= 97 ? 1 : player.overall >= 94 ? .45 : 0;

  factors.positionalNeed = baseValue * need * config.needWeight * personality.need * .42;
  factors.lineupUpgrade = baseValue * upgrade * config.upgradeWeight * .25;
  factors.versatility = baseValue * versatility * config.versatilityWeight * personality.versatility * .12;
  factors.scarcity = baseValue * scarcity * config.scarcityWeight * .22;
  factors.lateAuction = baseValue * progress * (completion.startersComplete ? .04 : .18 * need) * (context.difficulty === "Legendary" ? 1.18 : context.difficulty === "World Class" ? 1 : .65);
  factors.marketAdjustment = baseValue * (marketRatio - 1) * config.marketWeight;
  factors.opponentPressure = baseValue * pressure * config.opponentWeight * .10;
  factors.starPreference = baseValue * star * (personality.star + (player.playerType === "ICON" ? .012 : 0));

  let fairValue = (baseValue * personality.value)
    + factors.positionalNeed
    + factors.lineupUpgrade
    + factors.versatility
    + factors.scarcity
    + factors.lateAuction
    + factors.marketAdjustment
    + factors.opponentPressure
    + factors.starPreference;

  const reserve = reserveAfterHypotheticalPurchase(context, marketRatio);
  const spendable = Math.max(0, context.bot.budget - reserve);
  const nextBid = context.currentBid === 0 ? context.openingBid : context.currentBid + context.settings.bidIncrement;

  let lookahead = boundedLookahead({ context, need, upgrade, scarcity, fairValue, reserve });
  // If a genuinely needed role is objectively scarce, limited lookahead must
  // not become more optimistic about waiting than it is in an abundant market.
  if (need >= .55 && scarcity >= .45) lookahead = Math.max(lookahead, Math.min(1, scarcity * need * 1.4));
  factors.lookahead = baseValue * lookahead * (context.difficulty === "Legendary" ? .16 : context.difficulty === "World Class" ? .11 : .05);
  fairValue += factors.lookahead;

  const optionalPlayer = completion.startersComplete && need < .25 && upgrade < .18;
  if (optionalPlayer) fairValue *= context.difficulty === "Amateur" ? .92 : context.difficulty === "Professional" ? .88 : .82;

  const riskRatio = nextBid / Math.max(1, spendable);
  if (riskRatio > .68) factors.budgetRisk = baseValue * (riskRatio - .68) * (completion.startersComplete ? .32 : .72);
  fairValue -= factors.budgetRisk;

  const uncertainty = (rng() - .5) * 2 * config.noise;
  factors.uncertainty = fairValue * uncertainty;
  fairValue += factors.uncertainty;

  let maxBid = Math.min(context.bot.budget, spendable, fairValue * config.overpayTolerance);
  if (!completion.startersComplete && need >= .72 && progress >= .72) {
    // Endgame necessity can justify spending deeper into the reserve because
    // failing to field a starting XI is worse than a controlled overpay.
    const emergencyCap = context.bot.budget - Math.max(0, completion.startersRemaining - 1) * context.settings.minimumBid;
    maxBid = Math.max(maxBid, Math.min(emergencyCap, fairValue * 1.12));
  }
  maxBid = money(Math.max(0, maxBid));

  const reasons: string[] = [];
  if (need >= .65) reasons.push("fills an important squad need");
  if (upgrade >= .45) reasons.push("meaningfully upgrades the projected starting lineup");
  if (versatility >= .45) reasons.push("adds useful formation flexibility");
  if (scarcity >= .40) reasons.push("the required role is becoming scarce");
  if (progress >= .72 && !completion.startersComplete) reasons.push("late-auction starter urgency");
  if (marketRatio > 1.12) reasons.push("recent public market prices are elevated");
  if (marketRatio < .88) reasons.push("recent public market prices suggest value");
  if (factors.budgetRisk > 0) reasons.push("protects budget for unfinished starting positions");
  if (factors.lookahead < -baseValue * .03) reasons.push("future opportunity cost favors saving budget");
  if (factors.lookahead > baseValue * .03) reasons.push("limited lookahead favors buying now");

  if (nextBid > context.bot.budget || nextBid > maxBid) {
    const over = nextBid > fairValue * 1.12;
    reasons.push(over ? "current price is above strategic value" : "price would consume protected future budget");
    const confidence = clamp((nextBid - maxBid) / Math.max(10, maxBid) + .58, .55, .99);
    return { action: "PASS", confidence, reasons, estimatedValue: money(fairValue), maxBid, reserveBudget: reserve, factors };
  }

  const bidAmount = alignBid(maxBid, context, rng);
  if (!bidAmount) {
    reasons.push("no legal bid remains inside the strategic cap");
    return { action: "PASS", confidence: .9, reasons, estimatedValue: money(fairValue), maxBid, reserveBudget: reserve, factors };
  }
  if (!reasons.length) reasons.push("price remains inside the calculated ownership value");
  const confidence = clamp((maxBid - bidAmount) / Math.max(10, maxBid) * .55 + .48, .48, .98);
  return { action: "BID", bidAmount, confidence, reasons, estimatedValue: money(fairValue), maxBid, reserveBudget: reserve, factors };
}

export function evaluateBotDone(context: BotDoneContext): BotDecision {
  const factors: BotDecision["factors"] = {
    baseValue: 0, positionalNeed: 0, lineupUpgrade: 0, versatility: 0, scarcity: 0,
    lateAuction: 0, marketAdjustment: 0, opponentPressure: 0, starPreference: 0,
    lookahead: 0, budgetRisk: 0, uncertainty: 0
  };
  const completion = getSquadCompletion(context.squad, context.settings);
  if (!completion.startersComplete) {
    return { action: "WAIT", confidence: 1, reasons: [`${completion.startersRemaining} starting slot(s) still need coverage.`], estimatedValue: 0, maxBid: 0, reserveBudget: context.budget, factors };
  }
  if (completion.squadFull) {
    return { action: "DONE", confidence: 1, reasons: ["Squad capacity is full and the starting lineup is valid."], estimatedValue: 0, maxBid: 0, reserveBudget: 0, factors };
  }

  const rng = createSeededRandom(context.seed);
  const starterCount = getStartingLineupSize(context.settings.squadSize);
  const auto = buildAutomaticLineup(context.squad, undefined, starterCount);
  const benchCount = completion.currentSubstitutes;
  const budgetRatio = context.budget / Math.max(1, context.settings.startingBudget);
  const remainingOpportunity = clamp(context.remainingRounds / Math.max(8, starterCount * 2), 0, 1);
  const personality = PERSONALITY[context.personality];

  const desiredBench = context.difficulty === "Amateur" ? 0
    : context.difficulty === "Professional" ? Math.min(1, completion.maxSubstitutes)
      : context.difficulty === "World Class" ? Math.min(2, completion.maxSubstitutes)
        : Math.min(3, completion.maxSubstitutes);

  let continueUtility = 0;
  if (benchCount < desiredBench) continueUtility += (desiredBench - benchCount) * 1.8;
  if (auto.score < 88) continueUtility += (88 - auto.score) * (context.difficulty === "Legendary" ? .22 : .14);
  if (budgetRatio > .18) continueUtility += budgetRatio * 2.5;
  continueUtility *= .55 + remainingOpportunity;
  continueUtility *= 1.05 - personality.patience * .08;

  let doneUtility = 2.3 + benchCount * .42 + auto.score / 45;
  if (budgetRatio < .12) doneUtility += 1.5;
  if (remainingOpportunity < .18) doneUtility += 1.4;
  if (context.personality === "VALUE_HUNTER" && auto.score >= 90) doneUtility += .45;
  if (context.personality === "STAR_COLLECTOR" && remainingOpportunity > .4 && budgetRatio > .2) continueUtility += .6;
  if (context.personality === "PATIENT" && remainingOpportunity > .35) continueUtility += .4;

  const noise = (rng() - .5) * (context.difficulty === "Amateur" ? 1.5 : context.difficulty === "Professional" ? .8 : .35);
  const shouldDone = doneUtility + noise >= continueUtility;
  return {
    action: shouldDone ? "DONE" : "WAIT",
    confidence: clamp(Math.abs(doneUtility - continueUtility) / 4 + .55, .55, .98),
    reasons: shouldDone
      ? ["starting lineup is complete", "remaining auction value is not worth the expected cost"]
      : ["starting lineup is complete", "more bench depth or lineup upgrades still justify continuing"],
    estimatedValue: money(continueUtility * 10),
    maxBid: 0,
    reserveBudget: 0,
    factors
  };
}

export function getBotReactionDelay(context: BotDecisionContext, decision: BotDecision, seed: number): number {
  const rng = createSeededRandom(seed);
  const remaining = Math.max(250, context.timeRemainingMs);
  const personality = PERSONALITY[context.personality];
  const ranges = {
    Amateur: [1500, 4300],
    Professional: [950, 3200],
    "World Class": [620, 2450],
    Legendary: [420, 2050]
  } as const;
  const [low, high] = ranges[context.difficulty];
  let delay = low + rng() * (high - low);
  const lateChance = clamp(personality.patience * (context.difficulty === "Legendary" ? .58 : context.difficulty === "World Class" ? .42 : .22), 0, .62);
  if (decision.action === "BID" && rng() < lateChance && remaining > 1800) delay = remaining * (.62 + rng() * .22);
  if (context.opponents.filter(opponent => !opponent.auctionComplete && !opponent.passedCurrentRound).length === 0) delay = Math.min(delay, 780 + rng() * 420);
  return Math.round(clamp(delay, 220, Math.max(220, remaining - 320)));
}
