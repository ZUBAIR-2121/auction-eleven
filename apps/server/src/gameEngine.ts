import {
  FORMATION_BY_ID,
  FORMATIONS,
  getFootballerPrimaryRoles,
  getFootballerRoles,
  getMinimumNextBid,
  isValidBidIncrement,
  getConfiguredSquadSize,
  getSquadCompletion,
  getStartingLineupSize,
  type Footballer,
  type FormationDefinition,
  type GameSettings,
  type LineupAssignment,
  type LineupPick,
  type LineupRole,
  type ManagerView,
  type Position,
  type Ranking,
  type SquadEntry
} from "@auction-eleven/shared";

export const DEFAULT_SETTINGS: GameSettings = {
  gameMode: "normal",
  blindRevealSeconds: 20,
  blindDifficulty: "normal",
  blindRevealStyle: "blur",
  blindClues: "normal",
  blindNoGuess: "quick_auction",
  startingBudget: 1000,
  minimumBid: 1,
  bidIncrement: 1,
  pricingMode: "normal",
  playerPoolMode: "current",
  auctionPoolSizeMode: "standard",
  auctionPoolCustomCount: 60,
  iconFrequency: "normal",
  iconSurprise: false,
  auctionSeconds: 12,
  squadSize: 11,
  substituteCount: 5,
  reauctionUnsold: false,
  antiSnipeSeconds: 5,
  formationSeconds: 180,
  botDifficulty: "Professional",
  managerLimit: 6,
  poolTargets: { GK: 24, DEF: 24, MID: 24, FWD: 24 }
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

type BudgetedManager = Omit<ManagerView, "budget"> & { budget: number };

export function validateBid(args: {
  amount: number;
  currentBid: number;
  manager: BudgetedManager;
  settings: GameSettings;
  auctionActive: boolean;
  footballer?: Footballer | null;
}): string | null {
  const { amount, currentBid, manager, settings, auctionActive, footballer } = args;
  if (!auctionActive) return "This auction round is closed.";
  if (!Number.isInteger(amount)) return "Bids must use whole millions.";
  const minimum = getMinimumNextBid(settings, currentBid, footballer);
  if (amount < minimum) return `Minimum valid bid is ${minimum}M.`;
  if (!isValidBidIncrement(amount, settings)) return `Bid must follow the ${settings.bidIncrement}M increment.`;
  if (amount > manager.budget) return "You do not have enough budget.";
  const maximumSquadSize = getConfiguredSquadSize(settings.squadSize, settings.substituteCount);
  if (manager.squad.length >= maximumSquadSize) return `Your squad is full (${getStartingLineupSize(settings.squadSize)} starters + ${settings.substituteCount} substitutes).`;
  const catalogueId = footballer?.canonicalId ?? footballer?.catalogId ?? footballer?.id;
  if (catalogueId && manager.squad.some(entry => (entry.footballer.canonicalId ?? entry.footballer.catalogId ?? entry.footballer.id) === catalogueId)) {
    return `You already own ${footballer?.name ?? "this footballer"}.`;
  }
  const projectedSquad = footballer
    ? [...manager.squad, { footballer, price: amount, round: 0 }]
    : manager.squad;
  const completionAfterWin = getSquadCompletion(projectedSquad, settings);
  const remainingCapacity = Math.max(0, maximumSquadSize - projectedSquad.length);
  if (remainingCapacity < completionAfterWin.startersRemaining) {
    return `This signing would leave too few squad spots to complete your ${completionAfterWin.requiredStarters}-player starting lineup.`;
  }
  const reserve = completionAfterWin.startersRemaining * settings.minimumBid;
  if (manager.budget - amount < reserve) return `Keep at least ${reserve}M to complete your required starting lineup.`;
  return null;
}

export function rolePosition(role: LineupRole): Position {
  if (role === "GK") return "GK";
  if (["LB", "CB", "RB", "LWB", "RWB"].includes(role)) return "DEF";
  if (["CDM", "CM", "CAM", "LM", "RM"].includes(role)) return "MID";
  return "FWD";
}

function roleAbility(player: Footballer, role: LineupRole): number {
  switch (role) {
    case "GK": return player.goalkeeping * .78 + player.passing * .10 + player.physical * .12;
    case "CB": return player.defending * .48 + player.physical * .27 + player.pace * .12 + player.passing * .13;
    case "LB": case "RB": return player.defending * .30 + player.pace * .28 + player.passing * .22 + player.dribbling * .12 + player.physical * .08;
    case "LWB": case "RWB": return player.pace * .30 + player.passing * .25 + player.dribbling * .20 + player.defending * .17 + player.physical * .08;
    case "CDM": return player.defending * .30 + player.passing * .28 + player.physical * .20 + player.dribbling * .12 + player.pace * .10;
    case "CM": return player.passing * .33 + player.dribbling * .22 + player.physical * .17 + player.defending * .14 + player.shooting * .14;
    case "CAM": return player.passing * .32 + player.dribbling * .28 + player.shooting * .22 + player.pace * .10 + player.physical * .08;
    case "LM": case "RM": return player.pace * .27 + player.passing * .27 + player.dribbling * .24 + player.shooting * .12 + player.physical * .10;
    case "LW": case "RW": return player.pace * .31 + player.dribbling * .29 + player.shooting * .23 + player.passing * .12 + player.physical * .05;
    case "CF": return player.shooting * .30 + player.dribbling * .25 + player.passing * .23 + player.pace * .14 + player.physical * .08;
    case "ST": return player.shooting * .39 + player.pace * .23 + player.physical * .18 + player.dribbling * .13 + player.passing * .07;
  }
}

export function calculatePlayerSlotFit(player: Footballer, role: LineupRole): number {
  const required = rolePosition(role);
  const primaryRoles = getFootballerPrimaryRoles(player);
  const playableRoles = getFootballerRoles(player);
  const positionScore = primaryRoles.includes(role) ? 100 : playableRoles.includes(role) ? 98 : player.position === required ? 72 : player.secondary.includes(required) ? 58 : 22;
  return clamp(roleAbility(player, role) * .68 + positionScore * .32);
}

function greedyLineup(squad: SquadEntry[], formation: FormationDefinition): LineupAssignment[] {
  const remaining = new Map(squad.map(entry => [entry.footballer.id, entry.footballer]));
  const assignments: LineupAssignment[] = [];
  const orderedSlots = [...formation.slots].sort((a, b) => {
    const weight = (role: LineupRole) => role === "GK" ? 0 : rolePosition(role) === "DEF" ? 1 : rolePosition(role) === "FWD" ? 2 : 3;
    return weight(a.role) - weight(b.role);
  });

  for (const formationSlot of orderedSlots) {
    const options = [...remaining.values()]
      .filter(player => formationSlot.role === "GK" ? player.position === "GK" : player.position !== "GK")
      .sort((a, b) => {
        const fitDifference = calculatePlayerSlotFit(b, formationSlot.role) - calculatePlayerSlotFit(a, formationSlot.role);
        return fitDifference || b.overall - a.overall;
      });
    const selected = options[0];
    if (!selected) continue;
    assignments.push({
      slotId: formationSlot.id,
      footballerId: selected.id,
      role: formationSlot.role,
      fit: calculatePlayerSlotFit(selected, formationSlot.role)
    });
    remaining.delete(selected.id);
  }

  return formation.slots.map(formationSlot => assignments.find(item => item.slotId === formationSlot.id)).filter((item): item is LineupAssignment => !!item);
}

export function buildAutomaticLineup(squad: SquadEntry[], formationId?: string, requestedStarters?: number): { formationId: string; lineup: LineupAssignment[]; score: number } {
  // Keep the requested pitch size even if an exhausted auction leaves a squad
  // incomplete. The greedy builder can return a partial lineup without throwing,
  // which lets the server finish/recover instead of crashing in a timer callback.
  const starterTarget = requestedStarters === undefined
    ? Math.min(11, Math.max(6, squad.length))
    : getStartingLineupSize(requestedStarters);
  const eligible = FORMATIONS.filter(item => item.slots.length === starterTarget);
  const candidates = formationId
    ? [FORMATION_BY_ID.get(formationId)].filter((item): item is FormationDefinition => !!item && item.slots.length === starterTarget)
    : eligible;
  let best = { formationId: candidates[0]?.id ?? FORMATIONS[0]!.id, lineup: [] as LineupAssignment[], score: -1 };
  for (const candidate of candidates) {
    const lineup = greedyLineup(squad, candidate);
    const selected = new Set(lineup.map(item => item.footballerId));
    const quality = average(squad.filter(entry => selected.has(entry.footballer.id)).map(entry => entry.footballer.overall));
    const fit = average(lineup.map(item => item.fit));
    const score = fit * .64 + quality * .36;
    if (score > best.score) best = { formationId: candidate.id, lineup, score: clamp(score) };
  }
  return best;
}

export function validateAndBuildLineup(squad: SquadEntry[], formationId: string, picks: LineupPick[], requestedStarters?: number): LineupAssignment[] {
  const formation = FORMATION_BY_ID.get(formationId);
  if (!formation) throw new Error("Choose a valid formation.");
  if (squad.length < 6 || squad.length > 27) throw new Error("Your squad must contain between 6 and 27 players before setting the lineup.");
  const starterTarget = Math.min(getStartingLineupSize(requestedStarters ?? 11), squad.length);
  if (formation.slots.length !== starterTarget) throw new Error(`Choose a formation for ${starterTarget} starters.`);
  if (picks.length !== starterTarget) throw new Error(`Select exactly ${starterTarget} starting players.`);
  const slotIds = new Set(formation.slots.map(item => item.id));
  const squadIds = new Set(squad.map(item => item.footballer.id));
  if (picks.some(item => !slotIds.has(item.slotId))) throw new Error("A lineup slot does not belong to the chosen formation.");
  if (picks.some(item => !squadIds.has(item.footballerId))) throw new Error("A selected starter is not in your squad.");

  // Validate goalkeeper restrictions before duplicate checks so the player
  // receives the most useful error when a goalkeeper is dragged outfield.
  for (const formationSlot of formation.slots) {
    const pick = picks.find(item => item.slotId === formationSlot.id);
    const player = squad.find(item => item.footballer.id === pick?.footballerId)?.footballer;
    if (!pick || !player) throw new Error("Every formation slot must have a player.");
    if (formationSlot.role === "GK" && player.position !== "GK") throw new Error("Only a goalkeeper can be placed in the GK slot.");
    if (formationSlot.role !== "GK" && player.position === "GK") throw new Error("Goalkeepers cannot be placed in outfield positions.");
  }

  const uniqueSlots = new Set(picks.map(item => item.slotId));
  const uniquePlayers = new Set(picks.map(item => item.footballerId));
  if (uniqueSlots.size !== starterTarget || uniquePlayers.size !== starterTarget) throw new Error("Every formation slot and starting player must be unique.");

  return formation.slots.map(formationSlot => {
    const pick = picks.find(item => item.slotId === formationSlot.id)!;
    const player = squad.find(item => item.footballer.id === pick.footballerId)!.footballer;
    return { slotId: formationSlot.id, footballerId: player.id, role: formationSlot.role, fit: calculatePlayerSlotFit(player, formationSlot.role) };
  });
}

function playersForRoles(manager: BudgetedManager, roles: LineupRole[]): Footballer[] {
  const playerMap = new Map(manager.squad.map(entry => [entry.footballer.id, entry.footballer]));
  return manager.lineup
    .filter(item => roles.includes(item.role))
    .map(item => playerMap.get(item.footballerId))
    .filter((player): player is Footballer => !!player);
}

const roundMetric = (value: number, digits = 1): number => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const clampMetric = (value: number, min = 0, max = 100, digits = 1): number =>
  roundMetric(Math.max(min, Math.min(max, value)), digits);

function attackScore(player: Footballer): number {
  return player.shooting * .38 + player.pace * .25 + player.dribbling * .22 + player.passing * .10 + player.physical * .05;
}

function midfieldScore(player: Footballer): number {
  return player.passing * .34 + player.dribbling * .23 + player.physical * .16 + player.defending * .14 + player.shooting * .13;
}

function defenceScore(player: Footballer): number {
  return player.defending * .44 + player.physical * .25 + player.pace * .16 + player.passing * .15;
}

function averageOrZero(players: Footballer[], score: (player: Footballer) => number): number {
  return players.length ? average(players.map(score)) : 0;
}

/**
 * Team balance is deliberately a "no weak link" score rather than another
 * copy of overall rating. A strong average still matters, but a weak unit
 * (for example no real goalkeeper) meaningfully drags the team down.
 */
function calculateTeamBalance(attack: number, midfield: number, defence: number, goalkeeping: number): number {
  const units = [attack, midfield, defence, goalkeeping];
  const unitAverage = average(units);
  const weakest = Math.min(...units);
  const spread = Math.max(...units) - weakest;
  const consistency = Math.max(0, 100 - spread);
  return clampMetric(unitAverage * .45 + weakest * .40 + consistency * .15);
}

function purchaseEfficiency(entry: SquadEntry): number {
  const reference = Math.max(1, entry.footballer.basePrice);
  const savingRatio = (reference - entry.price) / reference;
  // 50 = paid the reference price, >50 = bargain, <50 = overpay.
  return clampMetric(50 + savingRatio * 50);
}

function rankingTiebreakReason(a: Omit<Ranking, "rank">, b: Omit<Ranking, "rank">): string {
  const checks: Array<[number, number, string]> = [
    [a.startingXIQuality, b.startingXIQuality, "Stronger Starting XI"],
    [a.lineupFit, b.lineupFit, "Better formation fit"],
    [a.balance, b.balance, "Better team balance"],
    [a.benchStrength, b.benchStrength, "Stronger bench depth"],
    [a.remainingBudget, b.remainingBudget, "More remaining budget"]
  ];
  for (const [left, right, label] of checks) {
    if (Math.abs(left - right) > .0001) return left > right ? label : "";
  }
  return "Exact statistical tie — stable ordering used";
}

function rankingComparator(a: Omit<Ranking, "rank">, b: Omit<Ranking, "rank">): number {
  return b.score - a.score ||
    b.startingXIQuality - a.startingXIQuality ||
    b.lineupFit - a.lineupFit ||
    b.balance - a.balance ||
    b.benchStrength - a.benchStrength ||
    b.remainingBudget - a.remainingBudget ||
    a.managerId.localeCompare(b.managerId);
}

/**
 * Result Engine V2 — Option A: the best football team wins.
 *
 * Winner score with substitutes enabled:
 *   45% Starting XI quality
 *   25% formation/position fit
 *   20% balanced strength across ATT/MID/DEF/GK
 *   10% bench depth
 *
 * With zero substitutes configured, the bench weight is redistributed to the
 * Starting XI and formation fit (50/30/20). Auction price efficiency is kept
 * as an awards/stat metric only and NEVER directly changes the winner score.
 */
export function calculateRanking(manager: BudgetedManager, settings: GameSettings = DEFAULT_SETTINGS): Omit<Ranking, "rank"> {
  const starterTarget = getStartingLineupSize(settings.squadSize);
  const formation = FORMATION_BY_ID.get(manager.formationId ?? "") ??
    FORMATIONS.find(item => item.slots.length === starterTarget) ?? FORMATIONS[0]!;
  const lineupIds = new Set(manager.lineup.map(item => item.footballerId));
  const starters = manager.squad.filter(entry => lineupIds.has(entry.footballer.id));
  const bench = manager.squad.filter(entry => !lineupIds.has(entry.footballer.id));
  const attackers = playersForRoles(manager, ["LW", "RW", "CF", "ST"]);
  const midfielders = playersForRoles(manager, ["CDM", "CM", "CAM", "LM", "RM"]);
  const defenders = playersForRoles(manager, ["LB", "CB", "RB", "LWB", "RWB"]);
  const keepers = playersForRoles(manager, ["GK"]);

  const attack = clampMetric(averageOrZero(attackers, attackScore));
  const midfield = clampMetric(averageOrZero(midfielders, midfieldScore));
  const defence = clampMetric(averageOrZero(defenders, defenceScore));
  const goalkeeping = clampMetric(averageOrZero(keepers, player => player.goalkeeping));
  const lineupFit = clampMetric(average(manager.lineup.map(item => item.fit)));
  const startingXIQuality = clampMetric(average(starters.map(entry => entry.footballer.overall)));
  const lineupCompleteness = clampMetric(starterTarget > 0 ? manager.lineup.length / starterTarget * 100 : 0);
  const isComplete = manager.lineup.length === starterTarget;

  const expectedBench = Math.max(0, Math.round(settings.substituteCount));
  const actualBenchCount = Math.min(expectedBench, bench.length);
  const benchCompleteness = expectedBench > 0 ? clampMetric(actualBenchCount / expectedBench * 100) : 100;
  const rawBenchQuality = bench.length ? average(bench.map(entry => entry.footballer.overall)) : 0;
  const benchStrength = expectedBench > 0
    ? clampMetric(rawBenchQuality * (benchCompleteness / 100))
    : 0;

  const balance = calculateTeamBalance(attack, midfield, defence, goalkeeping);
  const value = clampMetric(average(manager.squad.map(purchaseEfficiency)));

  const hasBenchScoring = expectedBench > 0;
  const startingXIWeight = hasBenchScoring ? .45 : .50;
  const lineupFitWeight = hasBenchScoring ? .25 : .30;
  const balanceWeight = .20;
  const benchWeight = hasBenchScoring ? .10 : 0;
  const completenessMultiplier = Math.max(0, Math.min(1, manager.lineup.length / starterTarget));

  const startingXIContribution = startingXIQuality * startingXIWeight * completenessMultiplier;
  const lineupFitContribution = lineupFit * lineupFitWeight * completenessMultiplier;
  const balanceContribution = balance * balanceWeight * completenessMultiplier;
  const benchContribution = benchStrength * benchWeight * completenessMultiplier;
  const score = roundMetric(
    startingXIContribution + lineupFitContribution + balanceContribution + benchContribution,
    2
  );

  return {
    managerId: manager.id,
    managerName: manager.name,
    score,
    formationId: formation.id,
    formationName: formation.name,
    lineupFit,
    startingXIQuality,
    benchStrength,
    lineupCompleteness,
    benchCompleteness,
    isComplete,
    attack,
    midfield,
    defence,
    goalkeeping,
    balance,
    value,
    remainingBudget: manager.budget,
    scoreBreakdown: {
      startingXIWeight: Math.round(startingXIWeight * 100),
      lineupFitWeight: Math.round(lineupFitWeight * 100),
      balanceWeight: Math.round(balanceWeight * 100),
      benchWeight: Math.round(benchWeight * 100),
      startingXIContribution: roundMetric(startingXIContribution, 2),
      lineupFitContribution: roundMetric(lineupFitContribution, 2),
      balanceContribution: roundMetric(balanceContribution, 2),
      benchContribution: roundMetric(benchContribution, 2),
      completenessMultiplier: roundMetric(completenessMultiplier, 3)
    },
    tieBreakReason: null
  };
}

export function rankManagers(managers: BudgetedManager[], settings: GameSettings = DEFAULT_SETTINGS): Ranking[] {
  const sorted = managers.map(manager => calculateRanking(manager, settings)).sort(rankingComparator);
  return sorted.map((entry, index) => {
    const next = sorted[index + 1];
    const tiedOnDisplayedScore = !!next && Math.abs(entry.score - next.score) < .005;
    const reason = tiedOnDisplayedScore ? rankingTiebreakReason(entry, next) : null;
    return { ...entry, tieBreakReason: reason || null, rank: index + 1 };
  });
}

export function getPurchaseValue(entry: SquadEntry): number {
  return entry.footballer.overall * 2 - entry.price;
}
