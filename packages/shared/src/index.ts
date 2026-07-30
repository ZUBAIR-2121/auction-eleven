export type Position = "GK" | "DEF" | "MID" | "FWD";
export type GamePhase = "lobby" | "auction" | "round_result" | "formation" | "finished";
export type PoolTargets = Record<Position, number>;
export type ManagerLimit = 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type SquadSize = 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17;
export type BotDifficulty = "Amateur" | "Professional" | "World Class" | "Legendary";
export type PricingMode = "normal" | "ovr_scaled";
export type RoomAccess = "public" | "password";
export const MAX_SUBSTITUTES = 10;
/** The number of players placed on the pitch for the selected squad target. */
export const getStartingLineupSize = (squadSize: number): number => Math.min(11, Math.max(6, Math.round(squadSize)));
/** Maximum players a manager may sign, including up to ten substitutes. */
export const getMaximumSquadSize = (squadSize: number): number => getStartingLineupSize(squadSize) + MAX_SUBSTITUTES;
export const SQUAD_POSITION_TARGETS: PoolTargets = { GK: 2, DEF: 6, MID: 5, FWD: 4 };
export function getSquadPositionTargets(size: number): PoolTargets {
  const targets: Record<number, PoolTargets> = {
    6: { GK: 1, DEF: 2, MID: 2, FWD: 1 },
    7: { GK: 1, DEF: 2, MID: 3, FWD: 1 },
    8: { GK: 1, DEF: 3, MID: 3, FWD: 1 },
    9: { GK: 1, DEF: 3, MID: 3, FWD: 2 },
    10: { GK: 1, DEF: 4, MID: 3, FWD: 2 },
    11: { GK: 1, DEF: 4, MID: 3, FWD: 3 },
    12: { GK: 1, DEF: 4, MID: 4, FWD: 3 },
    13: { GK: 1, DEF: 5, MID: 4, FWD: 3 },
    14: { GK: 2, DEF: 5, MID: 4, FWD: 3 },
    15: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
    16: { GK: 2, DEF: 6, MID: 5, FWD: 3 },
    17: SQUAD_POSITION_TARGETS
  };
  return targets[size] ?? SQUAD_POSITION_TARGETS;
}

export type LineupRole =
  | "GK" | "LB" | "CB" | "RB" | "LWB" | "RWB"
  | "CDM" | "CM" | "CAM" | "LM" | "RM"
  | "LW" | "RW" | "CF" | "ST";

export interface FormationSlot {
  id: string;
  role: LineupRole;
  x: number;
  y: number;
}

export interface FormationDefinition {
  id: string;
  name: string;
  style: "Balanced" | "Attacking" | "Defensive" | "Possession" | "Counter";
  slots: FormationSlot[];
}

const slot = (id: string, role: LineupRole, x: number, y: number): FormationSlot => ({ id, role, x, y });
const gk = slot("gk", "GK", 50, 91);
const back4 = [slot("lb", "LB", 14, 72), slot("lcb", "CB", 38, 75), slot("rcb", "CB", 62, 75), slot("rb", "RB", 86, 72)];
const back3 = [slot("lcb", "CB", 24, 74), slot("cb", "CB", 50, 78), slot("rcb", "CB", 76, 74)];
const back5 = [slot("lwb", "LWB", 8, 66), slot("lcb", "CB", 29, 75), slot("cb", "CB", 50, 79), slot("rcb", "CB", 71, 75), slot("rwb", "RWB", 92, 66)];
const formation = (id: string, name: string, style: FormationDefinition["style"], outfield: FormationSlot[]): FormationDefinition => ({ id, name, style, slots: [gk, ...outfield] });

export const FORMATIONS: FormationDefinition[] = [
  formation("6-2-2-1", "2-2-1 (6-a-side)", "Balanced", [slot("lcb", "CB", 30, 74), slot("rcb", "CB", 70, 74), slot("lcm", "CM", 32, 46), slot("rcm", "CM", 68, 46), slot("st", "ST", 50, 15)]),
  formation("6-1-3-1", "1-3-1 (6-a-side)", "Possession", [slot("cb", "CB", 50, 76), slot("lm", "LM", 18, 48), slot("cm", "CM", 50, 46), slot("rm", "RM", 82, 48), slot("st", "ST", 50, 15)]),
  formation("6-2-1-2", "2-1-2 (6-a-side)", "Attacking", [slot("lcb", "CB", 30, 74), slot("rcb", "CB", 70, 74), slot("cm", "CM", 50, 48), slot("lst", "ST", 34, 16), slot("rst", "ST", 66, 16)]),
  formation("7-2-3-1", "2-3-1 (7-a-side)", "Balanced", [slot("lcb", "CB", 30, 75), slot("rcb", "CB", 70, 75), slot("lm", "LM", 18, 47), slot("cm", "CM", 50, 46), slot("rm", "RM", 82, 47), slot("st", "ST", 50, 15)]),
  formation("7-3-2-1", "3-2-1 (7-a-side)", "Defensive", [slot("lcb", "CB", 24, 74), slot("cb", "CB", 50, 78), slot("rcb", "CB", 76, 74), slot("lcm", "CM", 36, 45), slot("rcm", "CM", 64, 45), slot("st", "ST", 50, 14)]),
  formation("7-2-2-2", "2-2-2 (7-a-side)", "Attacking", [slot("lcb", "CB", 30, 75), slot("rcb", "CB", 70, 75), slot("lcm", "CM", 34, 48), slot("rcm", "CM", 66, 48), slot("lst", "ST", 34, 15), slot("rst", "ST", 66, 15)]),
  formation("8-3-3-1", "3-3-1 (8-a-side)", "Balanced", [slot("lcb", "CB", 24, 75), slot("cb", "CB", 50, 79), slot("rcb", "CB", 76, 75), slot("lm", "LM", 18, 46), slot("cm", "CM", 50, 48), slot("rm", "RM", 82, 46), slot("st", "ST", 50, 14)]),
  formation("8-2-3-2", "2-3-2 (8-a-side)", "Attacking", [slot("lcb", "CB", 30, 75), slot("rcb", "CB", 70, 75), slot("lm", "LM", 18, 47), slot("cm", "CM", 50, 48), slot("rm", "RM", 82, 47), slot("lst", "ST", 35, 15), slot("rst", "ST", 65, 15)]),
  formation("8-3-2-2", "3-2-2 (8-a-side)", "Counter", [slot("lcb", "CB", 24, 75), slot("cb", "CB", 50, 79), slot("rcb", "CB", 76, 75), slot("lcm", "CM", 35, 47), slot("rcm", "CM", 65, 47), slot("lst", "ST", 35, 15), slot("rst", "ST", 65, 15)]),
  formation("9-3-3-2", "3-3-2 (9-a-side)", "Balanced", [slot("lcb", "CB", 24, 75), slot("cb", "CB", 50, 79), slot("rcb", "CB", 76, 75), slot("lm", "LM", 18, 47), slot("cm", "CM", 50, 49), slot("rm", "RM", 82, 47), slot("lst", "ST", 35, 15), slot("rst", "ST", 65, 15)]),
  formation("9-4-2-2", "4-2-2 (9-a-side)", "Defensive", [...back4, slot("lcm", "CM", 35, 47), slot("rcm", "CM", 65, 47), slot("lst", "ST", 35, 15), slot("rst", "ST", 65, 15)]),
  formation("9-3-2-3", "3-2-3 (9-a-side)", "Attacking", [slot("lcb", "CB", 24, 75), slot("cb", "CB", 50, 79), slot("rcb", "CB", 76, 75), slot("lcm", "CM", 36, 48), slot("rcm", "CM", 64, 48), slot("lw", "LW", 18, 17), slot("st", "ST", 50, 13), slot("rw", "RW", 82, 17)]),
  formation("10-4-3-2", "4-3-2 (10-a-side)", "Balanced", [...back4, slot("lcm", "CM", 28, 48), slot("cm", "CM", 50, 52), slot("rcm", "CM", 72, 48), slot("lst", "ST", 36, 15), slot("rst", "ST", 64, 15)]),
  formation("10-3-4-2", "3-4-2 (10-a-side)", "Possession", [...back3, slot("lm", "LM", 13, 48), slot("lcm", "CM", 38, 51), slot("rcm", "CM", 62, 51), slot("rm", "RM", 87, 48), slot("lst", "ST", 36, 15), slot("rst", "ST", 64, 15)]),
  formation("10-4-2-3", "4-2-3 (10-a-side)", "Attacking", [...back4, slot("lcm", "CM", 38, 51), slot("rcm", "CM", 62, 51), slot("lw", "LW", 18, 17), slot("st", "ST", 50, 13), slot("rw", "RW", 82, 17)]),
  formation("4-4-2", "4-4-2 Flat", "Balanced", [...back4, slot("lm", "LM", 13, 45), slot("lcm", "CM", 38, 49), slot("rcm", "CM", 62, 49), slot("rm", "RM", 87, 45), slot("lst", "ST", 38, 18), slot("rst", "ST", 62, 18)]),
  formation("4-3-3-a", "4-3-3 Attack", "Attacking", [...back4, slot("lcm", "CM", 28, 48), slot("cam", "CAM", 50, 37), slot("rcm", "CM", 72, 48), slot("lw", "LW", 16, 18), slot("st", "ST", 50, 13), slot("rw", "RW", 84, 18)]),
  formation("4-3-3-h", "4-3-3 Holding", "Possession", [...back4, slot("lcm", "CM", 28, 44), slot("cdm", "CDM", 50, 58), slot("rcm", "CM", 72, 44), slot("lw", "LW", 16, 18), slot("st", "ST", 50, 13), slot("rw", "RW", 84, 18)]),
  formation("4-2-3-1-w", "4-2-3-1 Wide", "Balanced", [...back4, slot("lcdm", "CDM", 38, 56), slot("rcdm", "CDM", 62, 56), slot("lm", "LM", 14, 35), slot("cam", "CAM", 50, 35), slot("rm", "RM", 86, 35), slot("st", "ST", 50, 13)]),
  formation("4-2-3-1-n", "4-2-3-1 Narrow", "Possession", [...back4, slot("lcdm", "CDM", 38, 57), slot("rcdm", "CDM", 62, 57), slot("lcam", "CAM", 29, 35), slot("cam", "CAM", 50, 31), slot("rcam", "CAM", 71, 35), slot("st", "ST", 50, 12)]),
  formation("4-1-2-1-2-n", "4-1-2-1-2 Narrow", "Possession", [...back4, slot("cdm", "CDM", 50, 59), slot("lcm", "CM", 31, 44), slot("rcm", "CM", 69, 44), slot("cam", "CAM", 50, 31), slot("lst", "ST", 37, 13), slot("rst", "ST", 63, 13)]),
  formation("4-1-2-1-2-w", "4-1-2-1-2 Wide", "Counter", [...back4, slot("cdm", "CDM", 50, 59), slot("lm", "LM", 13, 43), slot("rm", "RM", 87, 43), slot("cam", "CAM", 50, 31), slot("lst", "ST", 37, 13), slot("rst", "ST", 63, 13)]),
  formation("4-5-1", "4-5-1 Flat", "Defensive", [...back4, slot("lm", "LM", 10, 44), slot("lcm", "CM", 30, 48), slot("cm", "CM", 50, 47), slot("rcm", "CM", 70, 48), slot("rm", "RM", 90, 44), slot("st", "ST", 50, 14)]),
  formation("4-1-4-1", "4-1-4-1", "Defensive", [...back4, slot("cdm", "CDM", 50, 59), slot("lm", "LM", 12, 41), slot("lcm", "CM", 37, 43), slot("rcm", "CM", 63, 43), slot("rm", "RM", 88, 41), slot("st", "ST", 50, 14)]),
  formation("4-3-2-1", "4-3-2-1", "Counter", [...back4, slot("lcm", "CM", 28, 50), slot("cm", "CM", 50, 54), slot("rcm", "CM", 72, 50), slot("lcf", "CF", 37, 31), slot("rcf", "CF", 63, 31), slot("st", "ST", 50, 12)]),
  formation("4-2-1-3", "4-2-1-3", "Attacking", [...back4, slot("lcdm", "CDM", 38, 56), slot("rcdm", "CDM", 62, 56), slot("cam", "CAM", 50, 36), slot("lw", "LW", 15, 17), slot("st", "ST", 50, 12), slot("rw", "RW", 85, 17)]),
  formation("4-1-3-2", "4-1-3-2", "Attacking", [...back4, slot("cdm", "CDM", 50, 59), slot("lm", "LM", 14, 41), slot("cm", "CM", 50, 43), slot("rm", "RM", 86, 41), slot("lst", "ST", 37, 14), slot("rst", "ST", 63, 14)]),
  formation("4-4-1-1", "4-4-1-1", "Balanced", [...back4, slot("lm", "LM", 13, 47), slot("lcm", "CM", 38, 50), slot("rcm", "CM", 62, 50), slot("rm", "RM", 87, 47), slot("cf", "CF", 50, 29), slot("st", "ST", 50, 12)]),
  formation("4-2-2-2", "4-2-2-2", "Attacking", [...back4, slot("lcdm", "CDM", 37, 57), slot("rcdm", "CDM", 63, 57), slot("lcam", "CAM", 28, 34), slot("rcam", "CAM", 72, 34), slot("lst", "ST", 38, 13), slot("rst", "ST", 62, 13)]),
  formation("3-5-2", "3-5-2", "Possession", [...back3, slot("lwb", "LWB", 8, 48), slot("lcm", "CM", 32, 50), slot("cam", "CAM", 50, 37), slot("rcm", "CM", 68, 50), slot("rwb", "RWB", 92, 48), slot("lst", "ST", 37, 14), slot("rst", "ST", 63, 14)]),
  formation("3-4-3", "3-4-3", "Attacking", [...back3, slot("lm", "LM", 12, 47), slot("lcm", "CM", 38, 50), slot("rcm", "CM", 62, 50), slot("rm", "RM", 88, 47), slot("lw", "LW", 16, 17), slot("st", "ST", 50, 12), slot("rw", "RW", 84, 17)]),
  formation("3-4-2-1", "3-4-2-1", "Counter", [...back3, slot("lm", "LM", 12, 50), slot("lcm", "CM", 38, 53), slot("rcm", "CM", 62, 53), slot("rm", "RM", 88, 50), slot("lcam", "CAM", 36, 31), slot("rcam", "CAM", 64, 31), slot("st", "ST", 50, 12)]),
  formation("3-1-4-2", "3-1-4-2", "Balanced", [...back3, slot("cdm", "CDM", 50, 62), slot("lm", "LM", 12, 43), slot("lcm", "CM", 38, 46), slot("rcm", "CM", 62, 46), slot("rm", "RM", 88, 43), slot("lst", "ST", 37, 14), slot("rst", "ST", 63, 14)]),
  formation("3-4-1-2", "3-4-1-2", "Attacking", [...back3, slot("lm", "LM", 12, 50), slot("lcm", "CM", 38, 53), slot("rcm", "CM", 62, 53), slot("rm", "RM", 88, 50), slot("cam", "CAM", 50, 32), slot("lst", "ST", 37, 13), slot("rst", "ST", 63, 13)]),
  formation("5-3-2", "5-3-2", "Defensive", [...back5, slot("lcm", "CM", 28, 45), slot("cm", "CM", 50, 50), slot("rcm", "CM", 72, 45), slot("lst", "ST", 38, 14), slot("rst", "ST", 62, 14)]),
  formation("5-4-1", "5-4-1", "Defensive", [...back5, slot("lm", "LM", 13, 43), slot("lcm", "CM", 38, 47), slot("rcm", "CM", 62, 47), slot("rm", "RM", 87, 43), slot("st", "ST", 50, 14)]),
  formation("5-2-3", "5-2-3", "Counter", [...back5, slot("lcm", "CM", 38, 48), slot("rcm", "CM", 62, 48), slot("lw", "LW", 16, 17), slot("st", "ST", 50, 12), slot("rw", "RW", 84, 17)]),
  formation("5-2-1-2", "5-2-1-2", "Balanced", [...back5, slot("lcm", "CM", 38, 49), slot("rcm", "CM", 62, 49), slot("cam", "CAM", 50, 31), slot("lst", "ST", 37, 13), slot("rst", "ST", 63, 13)])
];

export const FORMATION_BY_ID = new Map(FORMATIONS.map(item => [item.id, item]));

export interface Footballer {
  id: string;
  /** Original catalogue id when this is a mirrored auction copy. */
  catalogId?: string;
  name: string;
  photoSearchName?: string;
  country: string;
  club: string;
  position: Position;
  secondary: Position[];
  /** Detailed on-pitch role used by the formation editor. */
  primaryRole: LineupRole;
  /** Additional natural roles. Primary role is never repeated here. */
  secondaryRoles: LineupRole[];
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  goalkeeping: number;
  basePrice: number;
  rarity: "Rising" | "Elite" | "Legend";
  trait: string;
  isRealPlayer: boolean;
}

export function getFootballerRoles(player: Footballer): LineupRole[] {
  const explicit = [player.primaryRole, ...(player.secondaryRoles ?? [])].filter(Boolean) as LineupRole[];
  if (explicit.length) return [...new Set(explicit)];
  // Backward-compatible fallback for rooms created with an older server build.
  if (player.position === "GK") return ["GK"];
  if (player.position === "DEF") return ["CB"];
  if (player.position === "MID") return ["CM"];
  return ["ST"];
}

export function getRoleFitLabel(player: Footballer, role: LineupRole): "PRIMARY" | "SECONDARY" | "OUT OF POSITION" {
  if (player.primaryRole === role) return "PRIMARY";
  return (player.secondaryRoles ?? []).includes(role) ? "SECONDARY" : "OUT OF POSITION";
}

export interface FootballerPhoto {
  url: string;
  originalUrl: string;
  descriptionUrl: string;
  credit: string;
  license: string;
  licenseUrl: string;
  source: "Wikimedia Commons";
}

export interface SquadEntry {
  footballer: Footballer;
  price: number;
  round: number;
}

export interface LineupPick {
  slotId: string;
  footballerId: string;
}

export interface LineupAssignment extends LineupPick {
  role: LineupRole;
  fit: number;
}

export interface ManagerView {
  id: string;
  name: string;
  avatar: string;
  budget: number;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  squad: SquadEntry[];
  joinedAt: number;
  formationId: string | null;
  lineup: LineupAssignment[];
  lineupSubmitted: boolean;
  lineupScore: number;
  auctionComplete: boolean;
}

export interface BidEntry {
  id: string;
  managerId: string;
  managerName: string;
  amount: number;
  receivedAt: number;
}

export interface GameSettings {
  startingBudget: number;
  minimumBid: number;
  bidIncrement: number;
  pricingMode: PricingMode;
  auctionSeconds: number;
  squadSize: SquadSize;
  antiSnipeSeconds: number;
  formationSeconds: number;
  botDifficulty: BotDifficulty;
  managerLimit: ManagerLimit;
  poolTargets: PoolTargets;
}

/**
 * Returns the first valid bid for a footballer.
 *
 * - normal: every card opens at the room minimum bid.
 * - ovr_scaled: better cards open higher, while prices scale with the room
 *   budget so low- and high-budget rooms keep a playable economy.
 *
 * The result is always aligned to the configured bid increment.
 */
export function getOpeningBid(
  settings: Pick<GameSettings, "startingBudget" | "minimumBid" | "bidIncrement" | "pricingMode">,
  footballer?: Pick<Footballer, "overall" | "basePrice"> | null
): number {
  const minimumBid = Math.max(1, Math.round(settings.minimumBid));
  const increment = Math.max(1, Math.round(settings.bidIncrement));
  if (settings.pricingMode !== "ovr_scaled" || !footballer) return minimumBid;

  const budgetScale = Math.max(.3, Math.min(3, settings.startingBudget / 1000));
  const eliteCurve = .68 + Math.max(0, footballer.overall - 85) * .025;
  const rawOpening = Math.max(minimumBid, Math.round(footballer.basePrice * eliteCurve * budgetScale));
  const steps = Math.max(0, Math.ceil((rawOpening - minimumBid) / increment));
  return minimumBid + steps * increment;
}

export interface Award {
  title: string;
  managerName: string;
  detail: string;
}

export interface Ranking {
  managerId: string;
  managerName: string;
  score: number;
  formationId: string;
  formationName: string;
  lineupFit: number;
  startingXIQuality: number;
  benchStrength: number;
  attack: number;
  midfield: number;
  defence: number;
  goalkeeping: number;
  balance: number;
  value: number;
  remainingBudget: number;
  rank: number;
}

export interface ChatMessage {
  id: string;
  managerId: string;
  managerName: string;
  avatar: string;
  text: string;
  sentAt: number;
}

export interface RoomDirectoryEntry {
  code: string;
  hostName: string;
  access: RoomAccess;
  hasPassword: boolean;
  managerCount: number;
  managerLimit: ManagerLimit;
  openSlots: number;
  pricingMode: PricingMode;
  squadSize: SquadSize;
  auctionSeconds: number;
  createdAt: number;
}

export interface RoomDirectoryFilters {
  managerLimit?: ManagerLimit;
  pricingMode?: PricingMode;
  access?: RoomAccess;
}

export interface RoomState {
  code: string;
  phase: GamePhase;
  version: number;
  hostId: string;
  isSolo: boolean;
  access: RoomAccess;
  hasPassword: boolean;
  createdAt: number;
  managers: ManagerView[];
  settings: GameSettings;
  availableFootballers: Footballer[];
  selectedFootballerIds: string[];
  poolSelectionValid: boolean;
  roundIndex: number;
  roundId: string;
  totalRounds: number;
  currentFootballer: Footballer | null;
  currentBid: number;
  highestBidderId: string | null;
  endsAt: number | null;
  formationEndsAt: number | null;
  bidHistory: BidEntry[];
  passedManagerIds: string[];
  lastWinner: { managerName: string; footballerName: string; amount: number; automatic?: boolean } | null;
  rankings: Ranking[];
  awards: Award[];
  chatMessages: ChatMessage[];
}

export interface ClientToServerEvents {
  "room:create": (payload: { name: string; sessionId: string; solo?: boolean; access?: RoomAccess; password?: string }, ack: Ack<{ code: string; managerId: string }>) => void;
  "room:join": (payload: { code: string; name: string; sessionId: string; password?: string }, ack: Ack<{ code: string; managerId: string }>) => void;
  "rooms:list": (payload: { filters?: RoomDirectoryFilters }, ack: Ack<RoomDirectoryEntry[]>) => void;
  "room:updateAccess": (payload: { code: string; access: RoomAccess; password?: string }, ack: Ack<null>) => void;
  "room:resume": (payload: { code: string; sessionId: string }, ack: Ack<{ managerId: string }>) => void;
  "room:leave": (payload: { code: string }, ack: Ack<null>) => void;
  "room:replaceWithAI": (payload: { code: string; managerId: string }, ack: Ack<null>) => void;
  "room:ready": (payload: { code: string; ready: boolean }, ack: Ack<null>) => void;
  "room:updateSettings": (payload: { code: string; settings: Partial<GameSettings> }, ack: Ack<null>) => void;
  "room:updatePlayerPool": (payload: { code: string; selectedFootballerIds: string[] }, ack: Ack<null>) => void;
  "game:start": (payload: { code: string }, ack: Ack<null>) => void;
  "game:quitSolo": (payload: { code: string }, ack: Ack<null>) => void;
  "auction:bid": (payload: { code: string; amount: number; requestId: string; roundId: string }, ack: Ack<null>) => void;
  "auction:pass": (payload: { code: string; roundId: string }, ack: Ack<null>) => void;
  "auction:complete": (payload: { code: string }, ack: Ack<null>) => void;
  "lineup:submit": (payload: { code: string; formationId: string; picks: LineupPick[] }, ack: Ack<null>) => void;
  "room:reaction": (payload: { code: string; reaction: string }) => void;
  "chat:send": (payload: { code: string; text: string }, ack: Ack<null>) => void;
  "chat:typing": (payload: { code: string; isTyping: boolean }) => void;
}

export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
  "rooms:changed": () => void;
  "room:error": (message: string) => void;
  "room:reaction": (payload: { managerName: string; reaction: string; at: number }) => void;
  "chat:typing": (payload: { managerId: string; managerName: string; isTyping: boolean }) => void;
}

export type Ack<T> = (response: { ok: true; data: T } | { ok: false; error: string }) => void;
