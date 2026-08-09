import {
  FORMATION_BY_ID,
  FORMATIONS,
  getFootballerPrimaryRoles,
  getFootballerRoles,
  getOpeningBid,
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
  const openingBid = getOpeningBid(settings, footballer);
  const minimum = currentBid === 0 ? openingBid : currentBid + settings.bidIncrement;
  if (amount < minimum) return `Minimum valid bid is ${minimum}M.`;
  if ((amount - settings.minimumBid) % settings.bidIncrement !== 0) return `Bid must follow the ${settings.bidIncrement}M increment.`;
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
  return manager.lineup.filter(item => roles.includes(item.role)).map(item => playerMap.get(item.footballerId)).filter((player): player is Footballer => !!player);
}

function attackScore(player: Footballer): number { return player.shooting * .38 + player.pace * .25 + player.dribbling * .22 + player.passing * .10 + player.physical * .05; }
function midfieldScore(player: Footballer): number { return player.passing * .34 + player.dribbling * .23 + player.physical * .16 + player.defending * .14 + player.shooting * .13; }
function defenceScore(player: Footballer): number { return player.defending * .44 + player.physical * .25 + player.pace * .16 + player.passing * .15; }

export function calculateRanking(manager: BudgetedManager): Omit<Ranking, "rank"> {
  const formation = FORMATION_BY_ID.get(manager.formationId ?? "") ?? FORMATIONS[0]!;
  const lineupIds = new Set(manager.lineup.map(item => item.footballerId));
  const starters = manager.squad.filter(entry => lineupIds.has(entry.footballer.id));
  const bench = manager.squad.filter(entry => !lineupIds.has(entry.footballer.id));
  const attackers = playersForRoles(manager, ["LW", "RW", "CF", "ST"]);
  const midfielders = playersForRoles(manager, ["CDM", "CM", "CAM", "LM", "RM"]);
  const defenders = playersForRoles(manager, ["LB", "CB", "RB", "LWB", "RWB"]);
  const keepers = playersForRoles(manager, ["GK"]);
  const attack = clamp(average((attackers.length ? attackers : starters.map(entry => entry.footballer)).map(attackScore)));
  const midfield = clamp(average((midfielders.length ? midfielders : starters.map(entry => entry.footballer)).map(midfieldScore)));
  const defence = clamp(average((defenders.length ? defenders : starters.map(entry => entry.footballer)).map(defenceScore)));
  const goalkeeping = clamp(average((keepers.length ? keepers : starters.map(entry => entry.footballer)).map(player => player.goalkeeping)));
  const lineupFit = clamp(average(manager.lineup.map(item => item.fit)));
  const startingXIQuality = clamp(average(starters.map(entry => entry.footballer.overall)));
  const benchStrength = clamp(bench.length ? average(bench.map(entry => entry.footballer.overall)) : average(starters.map(entry => entry.footballer.overall)));
  const positionCoverage = new Set(manager.squad.map(entry => entry.footballer.position)).size / 4 * 100;
  const balance = clamp(lineupFit * .72 + positionCoverage * .28);
  const overspend = average(manager.squad.map(entry => Math.max(0, entry.price - entry.footballer.basePrice)));
  const value = clamp(100 - overspend * 1.8);
  const starterTarget = Math.min(11, manager.squad.length);
  const completeness = manager.squad.length >= 6 ? Math.min(1, manager.lineup.length / starterTarget) : 0;
  const score = clamp((
    startingXIQuality * .32 + lineupFit * .20 + attack * .10 + midfield * .10 + defence * .10 +
    goalkeeping * .07 + benchStrength * .06 + value * .03 + balance * .02
  ) * completeness);
  return {
    managerId: manager.id,
    managerName: manager.name,
    score,
    formationId: formation.id,
    formationName: formation.name,
    lineupFit,
    startingXIQuality,
    benchStrength,
    attack,
    midfield,
    defence,
    goalkeeping,
    balance,
    value,
    remainingBudget: manager.budget
  };
}

export function rankManagers(managers: BudgetedManager[]): Ranking[] {
  return managers.map(calculateRanking)
    .sort((a, b) => b.score - a.score || b.lineupFit - a.lineupFit || b.startingXIQuality - a.startingXIQuality || b.benchStrength - a.benchStrength || b.remainingBudget - a.remainingBudget)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function getPurchaseValue(entry: SquadEntry): number {
  return entry.footballer.overall * 2 - entry.price;
}
