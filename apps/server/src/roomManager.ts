import crypto from "node:crypto";
import { getConfiguredSquadSize, getFootballerRoles, getMinimumFootballersRequired, getOpeningBid, getSquadCompletion, getSquadPositionTargets, getStartingLineupSize } from "@auction-eleven/shared";
import type {
  AuctionPoolSizeMode,
  Award,
  AuctionStatePatch,
  BidEntry,
  ChatMessage,
  Footballer,
  GameSettings,
  IconFrequency,
  LineupPick,
  ManagerView,
  PlayerPoolMode,
  PoolTargets,
  PoolValidationSummary,
  Position,
  RoomAccess,
  RoomDirectoryEntry,
  RoomDirectoryFilters,
  RoomState
} from "@auction-eleven/shared";
import { z } from "zod";
import { FOOTBALLERS, FOOTBALLER_BY_ID } from "./footballers.js";
import {
  buildAutomaticLineup,
  DEFAULT_SETTINGS,
  getPurchaseValue,
  rankManagers,
  validateAndBuildLineup,
  validateBid
} from "./gameEngine.js";

interface InternalManager extends Omit<ManagerView, "budget"> {
  budget: number;
  sessionId: string;
  socketId: string | null;
}

interface InternalRoom extends Omit<RoomState, "managers" | "availableFootballers" | "poolSelectionValid" | "poolValidation" | "hasPassword"> {
  managers: InternalManager[];
  footballerPool: Footballer[];
  seenRequestIds: Set<string>;
  timer: NodeJS.Timeout | null;
  botTimers: NodeJS.Timeout[];
  unsoldCounts: Map<string, number>;
  lastChatAt: Map<string, number>;
  lastBidAt: Map<string, number>;
  passedManagerIds: string[];
  passwordSalt: string | null;
  passwordHash: string | null;
  playerStatus: Map<string, "QUEUED" | "ACTIVE" | "SOLD" | "SKIPPED" | "FINISHED">;
  transitionRoundId: string | null;
  reauctionQueue: Footballer[];
  reauctionPhase: boolean;
  disconnectTimers: Map<string, NodeJS.Timeout>;
  auctionCompletionStarted: boolean;
}

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
const nameSchema = z.string().trim().min(2).max(18).regex(/^[\p{L}\p{N} _-]+$/u, "Use letters, numbers, spaces, - or _ only.");
const poolTargetsSchema = z.object({
  GK: z.number().int().min(0).max(80),
  DEF: z.number().int().min(0).max(80),
  MID: z.number().int().min(0).max(80),
  FWD: z.number().int().min(0).max(80)
});
const settingsSchema = z.object({
  startingBudget: z.number().int().min(300).max(3000).optional(),
  minimumBid: z.number().int().min(1).max(50).optional(),
  bidIncrement: z.number().int().min(1).max(20).optional(),
  pricingMode: z.enum(["normal", "ovr_scaled"]).optional(),
  playerPoolMode: z.enum(["current", "icons", "mixed", "custom"]).optional(),
  auctionPoolSizeMode: z.enum(["quick", "standard", "large", "all", "custom"]).optional(),
  auctionPoolCustomCount: z.number().int().min(1).max(220).optional(),
  iconFrequency: z.enum(["low", "normal", "high"]).optional(),
  iconSurprise: z.boolean().optional(),
  auctionSeconds: z.number().int().min(10).max(30).optional(),
  squadSize: z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10), z.literal(11), z.literal(12), z.literal(13), z.literal(14), z.literal(15), z.literal(16), z.literal(17)]).optional(),
  substituteCount: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10)]).optional(),
  reauctionUnsold: z.boolean().optional(),
  antiSnipeSeconds: z.number().int().min(0).max(8).optional(),
  formationSeconds: z.number().int().min(120).max(600).optional(),
  botDifficulty: z.enum(["Amateur", "Professional", "World Class", "Legendary"]).optional(),
  managerLimit: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)]).optional(),
  poolTargets: poolTargetsSchema.optional()
});
const selectedIdsSchema = z.array(z.string().min(1)).max(220);
const lineupSchema = z.array(z.object({ slotId: z.string().min(1), footballerId: z.string().min(1) })).min(6).max(11);
const chatSchema = z.string().trim().min(1, "Write a message first.").max(300, "Messages can contain up to 300 characters.");
const accessSchema = z.enum(["public", "password"]);
const passwordSchema = z.string().trim().min(4, "Room passwords need at least four characters.").max(32, "Room passwords can contain up to 32 characters.").regex(/^[^\u0000-\u001f\u007f]+$/, "Room passwords cannot contain control characters.");

const AVATARS = ["🦁", "🐺", "🦅", "🐉", "🦊", "🐯", "🦈", "⚡", "🔥", "👑", "🦂", "🦬", "🦏"];
const BOT_NAMES = ["Bargain Hunter AI", "Aggressive Bidder AI", "Star Collector AI", "Balanced Manager AI", "Tactical Specialist AI", "Last-Second Sniper AI", "Value Scout AI", "Pressure Manager AI", "Elite Collector AI", "Formation Expert AI", "Counter Bidder AI", "Patient Sniper AI"];
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const shuffle = <T>(input: T[]): T[] => {
  const output = [...input];
  for (let index = output.length - 1; index > 0; index--) {
    const swapIndex = crypto.randomInt(index + 1);
    [output[index], output[swapIndex]] = [output[swapIndex]!, output[index]!];
  }
  return output;
};

export class RoomManager {
  private rooms = new Map<string, InternalRoom>();

  constructor(
    private emitState: (socketId: string, state: RoomState) => void,
    private emitReaction: (code: string, payload: { managerName: string; reaction: string; at: number }) => void,
    private emitDirectoryChanged: () => void,
    private emitAuctionPatch: (code: string, patch: AuctionStatePatch) => void = () => undefined
  ) {}

  private makePassword(password: string): { salt: string; hash: string } {
    const parsed = passwordSchema.parse(password);
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(parsed, salt, 32);
    return { salt: salt.toString("hex"), hash: hash.toString("hex") };
  }

  private passwordMatches(room: InternalRoom, passwordInput?: string): boolean {
    if (room.access !== "password" || !room.passwordSalt || !room.passwordHash) return true;
    if (!passwordInput) return false;
    const candidate = crypto.scryptSync(passwordInput.trim(), Buffer.from(room.passwordSalt, "hex"), 32);
    const expected = Buffer.from(room.passwordHash, "hex");
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  }

  private code(): string {
    for (let tries = 0; tries < 30; tries++) {
      let code = "";
      for (let i = 0; i < 6; i++) code += ROOM_ALPHABET[crypto.randomInt(ROOM_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("Could not create a unique room code.");
  }

  private id(prefix: string): string { return `${prefix}_${crypto.randomUUID()}`; }

  private selectionCounts(ids: string[]): PoolTargets {
    const counts: PoolTargets = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const id of ids) {
      const player = FOOTBALLER_BY_ID.get(id);
      if (player) counts[player.position]++;
    }
    return counts;
  }

  private playerIdentity(player: Footballer): string {
    return player.canonicalId ?? player.catalogId ?? player.id;
  }

  private eligiblePlayers(settings: GameSettings, modeOverride?: PlayerPoolMode): Footballer[] {
    const mode = modeOverride ?? settings.playerPoolMode;
    if (mode === "current") return FOOTBALLERS.filter(player => (player.playerType ?? "CURRENT") === "CURRENT");
    if (mode === "icons") return FOOTBALLERS.filter(player => player.playerType === "ICON");
    return FOOTBALLERS;
  }

  private iconRatio(frequency: IconFrequency): number {
    return frequency === "low" ? .20 : frequency === "high" ? .50 : .35;
  }

  private plannedManagerCount(room: InternalRoom): number {
    // In the lobby the host is configuring a room for its advertised capacity,
    // so size the automatic pool and summary for that capacity instead of only
    // the managers who have joined so far. Once a match starts, hard validation
    // uses the managers actually participating.
    return room.phase === "lobby" ? room.settings.managerLimit : room.managers.length;
  }

  private recommendedPoolSize(managerCount: number, settings: GameSettings, eligibleCount: number): number {
    const required = getMinimumFootballersRequired(managerCount, settings.squadSize, settings.substituteCount);
    return Math.min(eligibleCount, Math.max(required, Math.ceil(required * 1.25)));
  }

  private targetPoolSize(managerCount: number, settings: GameSettings, eligibleCount: number): number {
    const required = getMinimumFootballersRequired(managerCount, settings.squadSize, settings.substituteCount);
    const mode: AuctionPoolSizeMode = settings.auctionPoolSizeMode ?? "standard";
    if (mode === "all") return eligibleCount;
    if (mode === "custom") return Math.min(eligibleCount, Math.max(1, Math.round(settings.auctionPoolCustomCount ?? required)));
    if (mode === "quick") return Math.min(eligibleCount, Math.max(required, Math.ceil(required * 1.08)));
    if (mode === "large") return Math.min(eligibleCount, Math.max(required, Math.ceil(required * 1.55)));
    return this.recommendedPoolSize(managerCount, settings, eligibleCount);
  }

  private minimumPositionCounts(managerCount: number, settings: GameSettings): PoolTargets {
    // These are hard viability floors, not a forced formation. Requiring four
    // defenders per manager for every 10/11-a-side room incorrectly rejected
    // perfectly valid 3-at-the-back formations in large rooms. The automatic
    // selector still aims for a healthier distribution via
    // recommendedPositionCounts, while kickoff only blocks genuinely impossible
    // broad-position coverage.
    const starters = getStartingLineupSize(settings.squadSize);
    const viableByStarterCount: Record<number, PoolTargets> = {
      6: { GK: 1, DEF: 2, MID: 2, FWD: 1 },
      7: { GK: 1, DEF: 2, MID: 2, FWD: 2 },
      8: { GK: 1, DEF: 2, MID: 3, FWD: 2 },
      9: { GK: 1, DEF: 3, MID: 3, FWD: 2 },
      10: { GK: 1, DEF: 3, MID: 3, FWD: 3 },
      11: { GK: 1, DEF: 3, MID: 4, FWD: 3 }
    };
    const starterTargets = viableByStarterCount[starters] ?? getSquadPositionTargets(starters);
    return {
      GK: starterTargets.GK * managerCount,
      DEF: starterTargets.DEF * managerCount,
      MID: starterTargets.MID * managerCount,
      FWD: starterTargets.FWD * managerCount
    };
  }

  private recommendedPositionCounts(managerCount: number, settings: GameSettings, total: number): PoolTargets {
    const minimum = this.minimumPositionCounts(managerCount, settings);
    const result: PoolTargets = { ...minimum };
    let remaining = Math.max(0, total - Object.values(result).reduce((sum, value) => sum + value, 0));
    const cycle: Position[] = ["DEF", "MID", "FWD", "DEF", "MID", "FWD", "GK"];
    let cursor = 0;
    while (remaining-- > 0) {
      result[cycle[cursor % cycle.length]!]++;
      cursor++;
    }
    return result;
  }

  private chooseMixed(candidates: Footballer[], count: number, frequency: IconFrequency): Footballer[] {
    const icons = shuffle(candidates.filter(player => player.playerType === "ICON"));
    const current = shuffle(candidates.filter(player => (player.playerType ?? "CURRENT") === "CURRENT"));
    const desiredIcons = Math.min(icons.length, Math.round(count * this.iconRatio(frequency)));
    const desiredCurrent = Math.min(current.length, count - desiredIcons);
    const chosen = [...icons.slice(0, desiredIcons), ...current.slice(0, desiredCurrent)];
    if (chosen.length < count) {
      const used = new Set(chosen.map(player => this.playerIdentity(player)));
      chosen.push(...shuffle(candidates.filter(player => !used.has(this.playerIdentity(player)))).slice(0, count - chosen.length));
    }
    return chosen;
  }

  private uniquePlayers(players: Footballer[]): Footballer[] {
    return [...new Map(players.map(player => [this.playerIdentity(player), player])).values()];
  }

  private eligiblePlayersForRoom(room: InternalRoom): Footballer[] {
    if (room.settings.playerPoolMode !== "custom") return this.uniquePlayers(this.eligiblePlayers(room.settings));
    return this.uniquePlayers(room.customPlayerIds.map(id => FOOTBALLER_BY_ID.get(id)).filter((player): player is Footballer => !!player));
  }

  private roleCoverageTargets(managerCount: number, settings: GameSettings): Array<{ roles: string[]; target: number }> {
    const starters = getStartingLineupSize(settings.squadSize);
    return [
      { roles: ["GK"], target: managerCount },
      { roles: ["CB"], target: starters >= 8 ? managerCount * 2 : managerCount },
      { roles: ["LB", "LWB"], target: starters >= 9 ? managerCount : 0 },
      { roles: ["RB", "RWB"], target: starters >= 9 ? managerCount : 0 },
      { roles: ["CM", "CDM", "CAM"], target: starters >= 7 ? managerCount * 2 : managerCount },
      { roles: ["LM", "LW"], target: starters >= 10 ? managerCount : 0 },
      { roles: ["RM", "RW"], target: starters >= 10 ? managerCount : 0 },
      { roles: ["ST", "CF"], target: managerCount }
    ].filter(group => group.target > 0);
  }

  private selectBalancedFromEligible(
    settings: GameSettings,
    managerCount: number,
    eligibleInput: Footballer[],
    total: number,
    mixedSelection: boolean
  ): string[] {
    const eligible = shuffle(this.uniquePlayers(eligibleInput));
    const limitedTotal = Math.min(Math.max(0, total), eligible.length);
    if (limitedTotal >= eligible.length) return eligible.map(player => player.id);

    const selected: Footballer[] = [];
    const used = new Set<string>();
    const add = (player: Footballer | undefined) => {
      if (!player || selected.length >= limitedTotal) return false;
      const identity = this.playerIdentity(player);
      if (used.has(identity)) return false;
      used.add(identity);
      selected.push(player);
      return true;
    };
    const available = () => eligible.filter(player => !used.has(this.playerIdentity(player)));

    // Seed scarce tactical roles first. A dual-primary or secondary-role player
    // can satisfy a coverage group while still counting as one unique card.
    for (const group of this.roleCoverageTargets(managerCount, settings)) {
      const matches = () => selected.filter(player => getFootballerRoles(player).some(role => group.roles.includes(role))).length;
      let missing = Math.max(0, group.target - matches());
      if (!missing) continue;
      const candidates = shuffle(available().filter(player => getFootballerRoles(player).some(role => group.roles.includes(role))));
      for (const candidate of candidates) {
        if (!missing || selected.length >= limitedTotal) break;
        if (add(candidate)) missing--;
      }
    }

    // Then satisfy broad-position health so the auction cannot become wildly
    // attacker-heavy or goalkeeper-light merely because of random ordering.
    const targets = this.recommendedPositionCounts(managerCount, settings, limitedTotal);
    for (const position of POSITIONS) {
      const have = selected.filter(player => player.position === position).length;
      const wanted = Math.max(0, Math.min(targets[position] - have, limitedTotal - selected.length));
      if (!wanted) continue;
      const candidates = available().filter(player => player.position === position);
      const chosen = mixedSelection
        ? this.chooseMixed(candidates, wanted, settings.iconFrequency)
        : shuffle(candidates).slice(0, wanted);
      chosen.forEach(add);
    }

    if (selected.length < limitedTotal) {
      const remaining = available();
      const chosen = mixedSelection
        ? this.chooseMixed(remaining, limitedTotal - selected.length, settings.iconFrequency)
        : shuffle(remaining).slice(0, limitedTotal - selected.length);
      chosen.forEach(add);
    }

    return selected.slice(0, limitedTotal).map(player => player.id);
  }

  private autoSelectForRoom(room: InternalRoom, managerCount = this.plannedManagerCount(room)): string[] {
    const eligible = this.eligiblePlayersForRoom(room);
    const total = this.targetPoolSize(managerCount, room.settings, eligible.length);
    const mixedSelection = room.settings.playerPoolMode === "mixed" || room.settings.playerPoolMode === "custom";
    return this.selectBalancedFromEligible(room.settings, managerCount, eligible, total, mixedSelection);
  }

  private poolValidationFor(room: InternalRoom, managerCount = this.plannedManagerCount(room)): PoolValidationSummary {
    const selected = room.selectedFootballerIds.map(id => FOOTBALLER_BY_ID.get(id)).filter((player): player is Footballer => !!player);
    const uniqueSelected = this.uniquePlayers(selected);
    const eligible = this.eligiblePlayersForRoom(room);
    const eligibleIds = new Set(eligible.map(player => player.id));
    const required = getMinimumFootballersRequired(managerCount, room.settings.squadSize, room.settings.substituteCount);
    const recommended = this.recommendedPoolSize(managerCount, room.settings, eligible.length);
    const target = this.targetPoolSize(managerCount, room.settings, eligible.length);
    const minimum = this.minimumPositionCounts(managerCount, room.settings);
    const counts = this.selectionCounts(uniqueSelected.map(player => player.id));
    const missingByPosition: PoolTargets = {
      GK: Math.max(0, minimum.GK - counts.GK),
      DEF: Math.max(0, minimum.DEF - counts.DEF),
      MID: Math.max(0, minimum.MID - counts.MID),
      FWD: Math.max(0, minimum.FWD - counts.FWD)
    };
    const errors: string[] = [];
    const warnings: string[] = [];

    if (room.settings.playerPoolMode === "custom" && room.customPlayerIds.length === 0) {
      errors.push("Custom Player Pool is empty. Select footballers before starting the match.");
    }
    if (eligible.length < required) {
      const source = room.settings.playerPoolMode === "custom" ? "Your custom selection" : room.settings.playerPoolMode === "icons" ? "Icons" : room.settings.playerPoolMode === "current" ? "Current players" : "Eligible players";
      errors.push(`${source} contains ${eligible.length} unique footballers, but this setup needs at least ${required}. Add players, reduce substitutes/managers, or choose a larger player type.`);
    }
    if (room.settings.auctionPoolSizeMode === "custom" && room.settings.auctionPoolCustomCount < required) {
      errors.push(`Custom auction count is ${room.settings.auctionPoolCustomCount}, but this room needs at least ${required} footballers.`);
    }
    if (uniqueSelected.length < required) errors.push(`The actual auction pool has ${uniqueSelected.length} footballers, but this room needs ${required}. Increase Auction Pool Size.`);
    if (uniqueSelected.some(player => !eligibleIds.has(player.id))) errors.push("The actual auction pool contains a footballer outside the selected eligibility rules.");
    for (const position of POSITIONS) if (missingByPosition[position] > 0) errors.push(`Add ${missingByPosition[position]} more ${position} footballer${missingByPosition[position] === 1 ? "" : "s"} for healthy squad coverage.`);

    const roleCount = (roles: string[]) => uniqueSelected.filter(player => getFootballerRoles(player).some(role => roles.includes(role))).length;
    const managers = managerCount;
    const starters = getStartingLineupSize(room.settings.squadSize);
    if (starters >= 9 && roleCount(["LB", "LWB"]) < managers) warnings.push(`Only ${roleCount(["LB", "LWB"])} natural left-back options are selected for ${managers} managers.`);
    if (starters >= 9 && roleCount(["RB", "RWB"]) < managers) warnings.push(`Only ${roleCount(["RB", "RWB"])} natural right-back options are selected for ${managers} managers.`);
    if (starters >= 8 && roleCount(["CB"]) < managers * 2) warnings.push("The pool is light on natural centre-backs; some formations may be harder to build.");
    if (roleCount(["CM", "CDM", "CAM"]) < managers * Math.max(1, Math.floor(starters / 4))) warnings.push("The pool is light on central midfield options.");
    if (room.settings.auctionPoolSizeMode === "all" && uniqueSelected.length >= 100) warnings.push(`ALL mode will auction ${uniqueSelected.length} footballers and may create a long match.`);

    return {
      selected: uniqueSelected.length,
      required,
      recommended,
      target,
      eligibleAvailable: eligible.length,
      selectedCurrent: uniqueSelected.filter(player => (player.playerType ?? "CURRENT") === "CURRENT").length,
      selectedIcons: uniqueSelected.filter(player => player.playerType === "ICON").length,
      missingByPosition,
      warnings,
      errors
    };
  }

  private refreshAutoPool(room: InternalRoom): void {
    room.selectedFootballerIds = this.autoSelectForRoom(room);
    room.settings.poolTargets = this.selectionCounts(room.selectedFootballerIds);
  }

  private catalogueId(player: Footballer): string { return this.playerIdentity(player); }

  private managerOwns(manager: InternalManager, player: Footballer): boolean {
    const id = this.catalogueId(player);
    return manager.squad.some(entry => this.catalogueId(entry.footballer) === id);
  }

  private buildAuctionPool(selected: Footballer[], settings: GameSettings): Footballer[] {
    const unique = [...new Map(selected.map(player => [this.playerIdentity(player), player])).values()];
    if (!(settings.playerPoolMode === "mixed" && settings.iconSurprise)) return shuffle(unique);
    const current = shuffle(unique.filter(player => (player.playerType ?? "CURRENT") === "CURRENT"));
    const icons = shuffle(unique.filter(player => player.playerType === "ICON"));
    const ordered: Footballer[] = [];
    let currentCursor = 0;
    let iconCursor = 0;
    while (currentCursor < current.length || iconCursor < icons.length) {
      const run = settings.iconFrequency === "low"
        ? 4 + crypto.randomInt(3)
        : settings.iconFrequency === "high"
          ? 1 + crypto.randomInt(2)
          : 2 + crypto.randomInt(2);
      ordered.push(...current.slice(currentCursor, currentCursor + run));
      currentCursor += run;
      if (iconCursor < icons.length) ordered.push(icons[iconCursor++]!);
      if (currentCursor >= current.length && iconCursor < icons.length) {
        ordered.push(...icons.slice(iconCursor));
        iconCursor = icons.length;
      }
    }
    return ordered;
  }

  private configuredSquadSize(room: InternalRoom): number {
    return getConfiguredSquadSize(room.settings.squadSize, room.settings.substituteCount);
  }

  private syncAutomaticAuctionCompletion(room: InternalRoom): void {
    const botBenchTargets = { Amateur: 0, Professional: 1, "World Class": 2, Legendary: 3 } as const;
    for (const manager of room.managers) {
      if (manager.auctionComplete) continue;
      const completion = getSquadCompletion(manager.squad, room.settings);
      // A full, valid squad has no legal room for another purchase, so treating
      // it as auction-complete prevents dead rounds without changing the human
      // player's choice while bench space still exists.
      if (completion.squadFull && completion.startersComplete) {
        manager.auctionComplete = true;
        continue;
      }
      if (!manager.isBot || !completion.startersComplete) continue;
      const desiredBench = Math.min(completion.maxSubstitutes, botBenchTargets[room.settings.botDifficulty]);
      if (completion.currentSubstitutes >= desiredBench) manager.auctionComplete = true;
    }
  }

  private allManagersAuctionComplete(room: InternalRoom): boolean {
    this.syncAutomaticAuctionCompletion(room);
    return room.managers.every(manager => manager.auctionComplete);
  }

  /**
   * Managers who can still submit the next legal bid for the active footballer.
   * This is deliberately server-authoritative and excludes passed/disconnected
   * managers before deciding whether a round can end early.
   */
  private managersAbleToChallenge(room: InternalRoom): InternalManager[] {
    const footballer = room.currentFootballer;
    if (!footballer || room.phase !== "auction") return [];
    const maximumSquadSize = this.configuredSquadSize(room);
    const requiredBid = room.currentBid === 0
      ? getOpeningBid(room.settings, footballer)
      : room.currentBid + room.settings.bidIncrement;
    return room.managers.filter(manager => {
      if (!(manager.isBot || manager.connected)) return false;
      if (manager.auctionComplete || manager.squad.length >= maximumSquadSize) return false;
      if (room.passedManagerIds.includes(manager.id) || this.managerOwns(manager, footballer)) return false;
      return validateBid({
        amount: requiredBid,
        currentBid: room.currentBid,
        manager,
        settings: room.settings,
        footballer,
        auctionActive: true
      }) === null;
    });
  }

  /**
   * The single authoritative early-completion gate for the current auction.
   * It is called after every event that changes bidder eligibility. endRound()
   * remains idempotent via transitionRoundId, so timer/pass/bid races cannot
   * sell or advance the same round more than once.
   */
  private evaluateAuctionCompletion(room: InternalRoom): boolean {
    if (room.phase !== "auction" || room.transitionRoundId || !room.currentFootballer) return false;
    const active = this.managersAbleToChallenge(room);

    if (room.highestBidderId) {
      // The current leader does not need to bid again. If nobody else can place
      // a legal next bid, finalize immediately at the existing winning price.
      const challengers = active.filter(manager => manager.id !== room.highestBidderId);
      if (challengers.length === 0) {
        this.endRound(room.code, room.roundId);
        return true;
      }
      return false;
    }

    // With no bid yet, one remaining manager must still submit the opening bid.
    // Only an empty active set means everybody passed/became ineligible.
    if (active.length === 0) {
      this.endRound(room.code, room.roundId);
      return true;
    }
    return false;
  }

  private markManagerPassedForCurrentRound(room: InternalRoom, managerId: string): void {
    if (room.phase !== "auction" || room.transitionRoundId || !room.currentFootballer) return;
    if (!room.passedManagerIds.includes(managerId)) room.passedManagerIds = [...room.passedManagerIds, managerId];
  }

  private safeTimer(room: InternalRoom, label: string, callback: () => void, delay: number): NodeJS.Timeout {
    return setTimeout(() => {
      try { callback(); }
      catch (error) {
        console.error(JSON.stringify({
          level: "error",
          event: label,
          roomId: room.code,
          auctionRoundId: room.roundId,
          phase: room.phase,
          message: error instanceof Error ? error.message : "Unknown timer error"
        }));
      }
    }, Math.max(0, delay));
  }

  private clearDisconnectTimer(room: InternalRoom, managerId: string): void {
    const timer = room.disconnectTimers.get(managerId);
    if (timer) clearTimeout(timer);
    room.disconnectTimers.delete(managerId);
  }

  private scheduleLobbyDisconnectCleanup(room: InternalRoom, managerId: string): void {
    this.clearDisconnectTimer(room, managerId);
    const timer = this.safeTimer(room, "lobby_disconnect_grace_expired", () => {
      const latest = this.rooms.get(room.code);
      if (!latest || latest.phase !== "lobby") return;
      const manager = latest.managers.find(item => item.id === managerId);
      if (!manager || manager.connected) return;
      latest.managers = latest.managers.filter(item => item.id !== managerId);
      latest.lastChatAt.delete(managerId);
      latest.lastBidAt.delete(managerId);
      latest.disconnectTimers.delete(managerId);
      if (latest.managers.length === 0) {
        this.clearTimers(latest);
        this.rooms.delete(latest.code);
        this.emitDirectoryChanged();
        return;
      }
      this.migrateHostIfNeeded(latest);
      this.broadcast(latest);
      this.emitDirectoryChanged();
    }, 30_000);
    room.disconnectTimers.set(managerId, timer);
  }

  private syncSoloBots(room: InternalRoom): void {
    if (!room.isSolo || room.phase !== "lobby") return;
    const host = room.managers.find(manager => !manager.isBot);
    if (!host) return;
    const desiredBots = room.settings.managerLimit - 1;
    const bots = room.managers.filter(manager => manager.isBot);
    if (bots.length > desiredBots) {
      const removeIds = new Set(bots.slice(desiredBots).map(manager => manager.id));
      room.managers = room.managers.filter(manager => !removeIds.has(manager.id));
    }
    while (room.managers.filter(manager => manager.isBot).length < desiredBots) {
      const index = room.managers.filter(manager => manager.isBot).length;
      const bot = this.manager(BOT_NAMES[index] ?? `Manager AI ${index + 1}`, `bot-${this.id("session")}`, null, false, true, room.settings.startingBudget, room.managers.length);
      bot.ready = true;
      room.managers.push(bot);
    }
    host.ready = true;
  }

  private publicState(room: InternalRoom, viewerManagerId?: string): RoomState {
    const revealAllBudgets = room.phase === "finished";
    const poolValidation = this.poolValidationFor(room);
    return {
      code: room.code,
      phase: room.phase,
      version: room.version,
      hostId: room.hostId,
      isSolo: room.isSolo,
      access: room.access,
      hasPassword: room.access === "password" && Boolean(room.passwordHash),
      createdAt: room.createdAt,
      managers: room.managers.map(({ sessionId: _session, socketId: _socket, ...manager }) => ({
        ...manager,
        budget: revealAllBudgets || manager.id === viewerManagerId ? manager.budget : null
      })),
      settings: room.settings,
      availableFootballers: room.phase === "lobby" ? FOOTBALLERS : [],
      selectedFootballerIds: room.selectedFootballerIds,
      customPlayerIds: room.phase === "lobby" ? room.customPlayerIds : [],
      poolSelectionValid: poolValidation.errors.length === 0,
      poolValidation,
      roundIndex: room.roundIndex,
      roundId: room.roundId,
      totalRounds: room.totalRounds,
      currentFootballer: room.currentFootballer,
      currentBid: room.currentBid,
      highestBidderId: room.highestBidderId,
      endsAt: room.endsAt,
      formationEndsAt: room.formationEndsAt,
      bidHistory: room.bidHistory,
      passedManagerIds: room.passedManagerIds,
      lastWinner: room.lastWinner,
      rankings: room.rankings,
      awards: room.awards,
      chatMessages: room.chatMessages
    };
  }

  private broadcast(room: InternalRoom): void {
    room.version++;
    for (const manager of room.managers) {
      if (!manager.socketId || manager.isBot) continue;
      this.emitState(manager.socketId, this.publicState(room, manager.id));
    }
  }

  /** Small high-frequency patch used for bids/passes so the full room snapshot is not rebroadcast. */
  private broadcastAuctionPatch(room: InternalRoom): void {
    room.version++;
    this.emitAuctionPatch(room.code, {
      code: room.code,
      version: room.version,
      roundId: room.roundId,
      currentBid: room.currentBid,
      highestBidderId: room.highestBidderId,
      endsAt: room.endsAt,
      bidHistory: room.bidHistory,
      passedManagerIds: room.passedManagerIds
    });
  }

  private migrateHostIfNeeded(room: InternalRoom): void {
    const currentHost = room.managers.find(manager => manager.id === room.hostId);
    if (currentHost?.connected) return;
    const next = room.managers.find(manager => manager.connected && !manager.isBot)
      ?? room.managers.find(manager => manager.connected)
      ?? room.managers[0];
    if (!next) return;
    room.hostId = next.id;
    room.managers.forEach(manager => { manager.isHost = manager.id === next.id; });
  }

  create(nameInput: string, sessionId: string, socketId: string, solo = false, accessInput: RoomAccess = "public", passwordInput?: string): { code: string; managerId: string } {
    const name = nameSchema.parse(nameInput);
    const code = this.code();
    const settings = structuredClone(DEFAULT_SETTINGS);
    const access = solo ? "public" : accessSchema.parse(accessInput);
    const password = access === "password" ? this.makePassword(passwordInput ?? "") : null;
    const host = this.manager(name, sessionId, socketId, true, false, settings.startingBudget, 0);
    const managers = [host];
    if (solo) {
      BOT_NAMES.slice(0, settings.managerLimit - 1).forEach((botName, index) => {
        managers.push(this.manager(botName, `bot-${this.id("session")}`, null, false, true, settings.startingBudget, index + 1));
      });
      managers.forEach(manager => { manager.ready = true; });
    }
    const room: InternalRoom = {
      code,
      phase: "lobby",
      version: 0,
      hostId: host.id,
      isSolo: solo,
      access,
      createdAt: Date.now(),
      managers,
      settings,
      selectedFootballerIds: [],
      customPlayerIds: [],
      roundIndex: 0,
      totalRounds: 0,
      currentFootballer: null,
      currentBid: 0,
      highestBidderId: null,
      endsAt: null,
      formationEndsAt: null,
      bidHistory: [],
      lastWinner: null,
      rankings: [],
      awards: [],
      chatMessages: [],
      footballerPool: [],
      seenRequestIds: new Set(),
      roundId: "",
      timer: null,
      botTimers: [],
      unsoldCounts: new Map(),
      lastChatAt: new Map(),
      lastBidAt: new Map(),
      passedManagerIds: [],
      passwordSalt: password?.salt ?? null,
      passwordHash: password?.hash ?? null,
      playerStatus: new Map(),
      transitionRoundId: null,
      reauctionQueue: [],
      reauctionPhase: false,
      disconnectTimers: new Map(),
      auctionCompletionStarted: false
    };
    this.refreshAutoPool(room);
    this.rooms.set(code, room);
    this.broadcast(room);
    this.emitDirectoryChanged();
    return { code, managerId: host.id };
  }

  private manager(name: string, sessionId: string, socketId: string | null, isHost: boolean, isBot: boolean, budget: number, joinedAt: number): InternalManager {
    return {
      id: this.id("manager"),
      name,
      avatar: AVATARS[joinedAt % AVATARS.length]!,
      budget,
      ready: false,
      connected: true,
      isHost,
      isBot,
      squad: [],
      joinedAt: Date.now() + joinedAt,
      formationId: null,
      lineup: [],
      lineupSubmitted: false,
      lineupScore: 0,
      auctionComplete: false,
      sessionId,
      socketId
    };
  }

  join(codeInput: string, nameInput: string, sessionId: string, socketId: string, passwordInput?: string): { code: string; managerId: string } {
    const code = codeInput.trim().toUpperCase();
    const room = this.get(code);
    if (room.isSolo) throw new Error("Solo Practice rooms cannot be joined.");

    // A browser that already owns a seat should reconnect to that seat instead
    // of consuming another room slot or creating a duplicate manager.
    const existing = room.managers.find(manager => !manager.isBot && manager.sessionId === sessionId);
    if (existing) {
      this.clearDisconnectTimer(room, existing.id);
      existing.socketId = socketId;
      existing.connected = true;
      this.broadcast(room);
      this.emitDirectoryChanged();
      return { code, managerId: existing.id };
    }

    if (room.phase !== "lobby") throw new Error("This match has already started.");
    if (room.managers.length >= room.settings.managerLimit) throw new Error(`Room full: ${room.managers.length}/${room.settings.managerLimit} managers have already joined.`);
    if (!this.passwordMatches(room, passwordInput)) throw new Error("Incorrect room password.");
    const name = nameSchema.parse(nameInput);
    if (room.managers.some(manager => manager.name.toLowerCase() === name.toLowerCase())) throw new Error("That manager name is already used in this room.");
    const manager = this.manager(name, sessionId, socketId, false, false, room.settings.startingBudget, room.managers.length);
    room.managers.push(manager);
    // Pool sizing is based on configured managerLimit while in the lobby, so a
    // join must not silently reroll or replace the host's visible player pool.
    this.broadcast(room);
    this.emitDirectoryChanged();
    return { code, managerId: manager.id };
  }


  listRooms(filters: RoomDirectoryFilters = {}): RoomDirectoryEntry[] {
    return [...this.rooms.values()]
      .filter(room => !room.isSolo && room.phase === "lobby")
      .filter(room => filters.managerLimit === undefined || room.settings.managerLimit === filters.managerLimit)
      .filter(room => filters.pricingMode === undefined || room.settings.pricingMode === filters.pricingMode)
      .filter(room => filters.playerPoolMode === undefined || room.settings.playerPoolMode === filters.playerPoolMode)
      .filter(room => filters.access === undefined || room.access === filters.access)
      .map(room => ({
        code: room.code,
        hostName: room.managers.find(manager => manager.id === room.hostId)?.name ?? "Host",
        access: room.access,
        hasPassword: room.access === "password" && Boolean(room.passwordHash),
        managerCount: room.managers.length,
        managerLimit: room.settings.managerLimit,
        openSlots: Math.max(0, room.settings.managerLimit - room.managers.length),
        pricingMode: room.settings.pricingMode,
        playerPoolMode: room.settings.playerPoolMode,
        squadSize: room.settings.squadSize,
        substituteCount: room.settings.substituteCount,
        auctionSeconds: room.settings.auctionSeconds,
        createdAt: room.createdAt
      }))
      .sort((a, b) => Number(a.openSlots > 0) === Number(b.openSlots > 0) ? b.createdAt - a.createdAt : Number(b.openSlots > 0) - Number(a.openSlots > 0));
  }

  updateAccess(code: string, managerId: string, accessInput: RoomAccess, passwordInput?: string): void {
    const room = this.get(code);
    if (room.hostId !== managerId) throw new Error("Only the host can change room access.");
    if (room.phase !== "lobby") throw new Error("Room access is locked after kickoff.");
    if (room.isSolo) throw new Error("Solo Practice does not use public room access.");
    const access = accessSchema.parse(accessInput);
    let nextSalt = room.passwordSalt;
    let nextHash = room.passwordHash;
    if (access === "public") {
      nextSalt = null;
      nextHash = null;
    } else if (passwordInput?.trim()) {
      const password = this.makePassword(passwordInput);
      nextSalt = password.salt;
      nextHash = password.hash;
    } else if (!nextHash || !nextSalt) {
      throw new Error("Enter a password with at least four characters.");
    }
    room.access = access;
    room.passwordSalt = nextSalt;
    room.passwordHash = nextHash;
    this.broadcast(room);
    this.emitDirectoryChanged();
  }

  resume(codeInput: string, sessionId: string, socketId: string): { managerId: string } {
    const room = this.get(codeInput.trim().toUpperCase());
    const manager = room.managers.find(item => item.sessionId === sessionId);
    if (!manager) throw new Error("Your saved seat could not be found.");
    this.clearDisconnectTimer(room, manager.id);
    manager.socketId = socketId;
    manager.connected = true;
    this.broadcast(room);
    this.emitDirectoryChanged();
    return { managerId: manager.id };
  }

  leave(code: string, managerId: string): void {
    const room = this.get(code);
    const manager = this.managerIn(room, managerId);
    this.clearDisconnectTimer(room, manager.id);

    if (room.isSolo) {
      this.clearTimers(room);
      room.disconnectTimers.forEach(clearTimeout);
      room.disconnectTimers.clear();
      this.rooms.delete(room.code);
      return;
    }

    if (room.phase === "lobby" || room.phase === "finished") {
      room.managers = room.managers.filter(item => item.id !== manager.id);
      room.lastChatAt.delete(manager.id);
      room.lastBidAt.delete(manager.id);
      if (room.managers.length === 0) {
        this.clearTimers(room);
        room.disconnectTimers.forEach(clearTimeout);
        room.disconnectTimers.clear();
        this.rooms.delete(room.code);
        this.emitDirectoryChanged();
        return;
      }
      if (room.hostId === manager.id) {
        room.hostId = room.managers[0]!.id;
        room.managers.forEach(item => { item.isHost = item.id === room.hostId; });
      }
      this.broadcast(room);
      this.emitDirectoryChanged();
      return;
    }

    manager.connected = false;
    manager.socketId = null;
    this.migrateHostIfNeeded(room);
    this.markManagerPassedForCurrentRound(room, manager.id);
    if (!this.evaluateAuctionCompletion(room)) this.broadcast(room);
    this.emitDirectoryChanged();
  }

  disconnect(socketId: string): void {
    for (const room of this.rooms.values()) {
      const manager = room.managers.find(item => item.socketId === socketId);
      if (!manager) continue;
      manager.connected = false;
      manager.socketId = null;
      this.migrateHostIfNeeded(room);
      if (room.phase === "lobby" && !room.isSolo) this.scheduleLobbyDisconnectCleanup(room, manager.id);
      this.markManagerPassedForCurrentRound(room, manager.id);
      if (!this.evaluateAuctionCompletion(room)) this.broadcast(room);
      this.emitDirectoryChanged();
    }
  }

  assertSocketOwner(code: string, managerId: string, socketId: string): void {
    const room = this.get(code);
    const manager = this.managerIn(room, managerId);
    if (!manager.isBot && manager.socketId !== socketId) {
      throw new Error("This manager seat is active in another tab or device. Reconnect here to take control.");
    }
  }

  replaceWithAI(code: string, hostId: string, targetManagerId: string): void {
    const room = this.get(code);
    if (room.hostId !== hostId) throw new Error("Only the host can replace a disconnected manager.");
    const target = this.managerIn(room, targetManagerId);
    if (target.connected) throw new Error("That manager is still connected.");
    if (target.isHost) throw new Error("The host seat cannot be replaced by AI.");
    this.clearDisconnectTimer(room, target.id);
    target.isBot = true;
    target.connected = true;
    target.socketId = null;
    target.sessionId = `bot-${this.id("session")}`;
    target.name = `${target.name.replace(/ AI$/, "")} AI`;
    target.ready = true;
    if (room.phase === "formation" && !target.lineupSubmitted) target.lineupSubmitted = true;
    this.broadcast(room);
    if (room.phase === "auction") this.scheduleBots(room);
    if (room.phase === "formation" && room.managers.every(manager => manager.lineupSubmitted)) this.finish(room);
  }

  setReady(code: string, managerId: string, ready: boolean): void {
    const room = this.get(code);
    const manager = this.managerIn(room, managerId);
    if (room.phase !== "lobby") throw new Error("Ready status is locked after kickoff.");
    manager.ready = ready;
    this.broadcast(room);
  }

  updateSettings(code: string, managerId: string, patch: Partial<GameSettings>): void {
    const room = this.get(code);
    if (room.hostId !== managerId) throw new Error("Only the host can change match settings.");
    if (room.phase !== "lobby") throw new Error("Settings are locked after kickoff.");
    const parsed = settingsSchema.parse(patch);
    if (parsed.managerLimit && !room.isSolo && parsed.managerLimit < room.managers.length) {
      throw new Error(`This room already has ${room.managers.length} managers. Choose a larger squad limit.`);
    }

    const previousSelected = [...room.selectedFootballerIds];
    const enteringCustom = parsed.playerPoolMode === "custom" && room.settings.playerPoolMode !== "custom";
    room.settings = { ...room.settings, ...parsed };
    if (enteringCustom) {
      if (room.customPlayerIds.length === 0) room.customPlayerIds = previousSelected;
      // Manual player selection means exactly those IDs are eligible by default.
      // Hosts can deliberately choose QUICK/STANDARD/LARGE afterwards if they
      // want the server to take a balanced subset of their custom eligibility.
      if (parsed.auctionPoolSizeMode === undefined) room.settings.auctionPoolSizeMode = "all";
    }

    this.syncSoloBots(room);
    const poolAffectingChange =
      parsed.playerPoolMode !== undefined ||
      parsed.auctionPoolSizeMode !== undefined ||
      parsed.auctionPoolCustomCount !== undefined ||
      parsed.iconFrequency !== undefined ||
      parsed.managerLimit !== undefined ||
      parsed.squadSize !== undefined ||
      parsed.substituteCount !== undefined ||
      parsed.poolTargets !== undefined;
    if (poolAffectingChange) this.refreshAutoPool(room);
    room.managers.forEach(manager => { manager.budget = room.settings.startingBudget; });
    this.broadcast(room);
    this.emitDirectoryChanged();
  }

  updatePlayerPool(code: string, managerId: string, selectedFootballerIds: string[]): void {
    const room = this.get(code);
    if (room.hostId !== managerId) throw new Error("Only the host can select the room footballers.");
    if (room.phase !== "lobby") throw new Error("The player pool is locked after kickoff.");
    if (room.settings.playerPoolMode !== "custom") throw new Error("Switch Player Pool to Custom before manually changing footballers.");
    const parsed = selectedIdsSchema.parse(selectedFootballerIds);
    const uniqueIds = [...new Set(parsed)];
    if (uniqueIds.length !== parsed.length) throw new Error("The selected pool contains duplicate footballer IDs.");
    const players = uniqueIds.map(id => FOOTBALLER_BY_ID.get(id));
    if (players.some(player => !player)) throw new Error("The selected pool contains an unknown footballer.");
    const identities = new Set<string>();
    for (const player of players as Footballer[]) {
      const identity = this.playerIdentity(player);
      if (identities.has(identity)) throw new Error(`The custom pool contains a duplicate footballer: ${player.name}.`);
      identities.add(identity);
    }
    room.customPlayerIds = uniqueIds;
    this.refreshAutoPool(room);
    this.broadcast(room);
  }

  autoBuildPlayerPool(code: string, managerId: string): void {
    const room = this.get(code);
    if (room.hostId !== managerId) throw new Error("Only the host can auto-build the player pool.");
    if (room.phase !== "lobby") throw new Error("The player pool is locked after kickoff.");
    if (room.settings.playerPoolMode === "custom") {
      const managerCount = this.plannedManagerCount(room);
      const desired = this.recommendedPoolSize(managerCount, room.settings, FOOTBALLERS.length);
      room.customPlayerIds = this.selectBalancedFromEligible(room.settings, managerCount, FOOTBALLERS, desired, true);
      room.settings.auctionPoolSizeMode = "all";
    }
    this.refreshAutoPool(room);
    this.broadcast(room);
  }

  start(code: string, managerId: string): void {
    const room = this.get(code);
    if (room.hostId !== managerId) throw new Error("Only the host can start the match.");
    const humans = room.managers.filter(manager => !manager.isBot);
    if (humans.length < 2 && !room.isSolo) throw new Error("Add another manager or use Solo Practice.");
    if (room.managers.some(manager => !manager.ready)) throw new Error("Every manager must be ready.");
    const validation = this.poolValidationFor(room, room.managers.length);
    if (validation.errors.length) throw new Error(validation.errors[0]!);
    const selected = room.selectedFootballerIds.map(id => FOOTBALLER_BY_ID.get(id)).filter((player): player is Footballer => !!player);
    const selectedUnique = new Map(selected.map(player => [this.playerIdentity(player), player]));
    room.phase = "auction";
    this.emitDirectoryChanged();
    room.footballerPool = this.buildAuctionPool([...selectedUnique.values()], room.settings);
    room.totalRounds = room.footballerPool.length;
    room.roundIndex = 0;
    room.unsoldCounts.clear();
    room.playerStatus = new Map(room.footballerPool.map(player => [player.id, "QUEUED" as const]));
    room.transitionRoundId = null;
    room.reauctionQueue = [];
    room.reauctionPhase = false;
    room.auctionCompletionStarted = false;
    room.rankings = [];
    room.awards = [];
    room.formationEndsAt = null;
    room.passedManagerIds = [];
    room.managers.forEach(manager => {
      manager.budget = room.settings.startingBudget;
      manager.squad = [];
      manager.formationId = null;
      manager.lineup = [];
      manager.lineupSubmitted = false;
      manager.lineupScore = 0;
      manager.auctionComplete = false;
    });
    this.beginRound(room);
  }

  private beginRound(room: InternalRoom): void {
    this.clearTimers(room);
    room.transitionRoundId = null;
    this.syncAutomaticAuctionCompletion(room);
    if (this.allManagersAuctionComplete(room)) {
      this.beginFormation(room);
      return;
    }
    const maximumSquadSize = this.configuredSquadSize(room);
    const openingFloor = room.settings.minimumBid;
    const noManagerCanBuyMore = room.managers.every(manager =>
      manager.auctionComplete || manager.squad.length >= maximumSquadSize || manager.budget < openingFloor
    );
    if (noManagerCanBuyMore) {
      this.beginFormation(room);
      return;
    }

    while (room.roundIndex < room.footballerPool.length) {
      const candidate = room.footballerPool[room.roundIndex]!;
      const status = room.playerStatus.get(candidate.id);
      if (status === "SOLD" || status === "SKIPPED" || status === "FINISHED") room.roundIndex++;
      else break;
    }

    if (room.roundIndex >= room.footballerPool.length) {
      if (room.settings.reauctionUnsold && !room.reauctionPhase && room.reauctionQueue.length > 0) {
        room.reauctionPhase = true;
        room.footballerPool = shuffle([...new Map(room.reauctionQueue.map(player => [player.id, player])).values()]);
        room.roundIndex = 0;
        room.reauctionQueue = [];
        for (const player of room.footballerPool) room.playerStatus.set(player.id, "QUEUED");
      } else {
        // Never throw from an asynchronous timer. If the configured reserve was
        // exhausted, move forward safely with the squads that were actually won.
        this.beginFormation(room);
        return;
      }
    }

    const footballer = room.footballerPool[room.roundIndex];
    if (!footballer) {
      this.beginFormation(room);
      return;
    }

    room.phase = "auction";
    room.currentFootballer = footballer;
    room.playerStatus.set(footballer.id, "ACTIVE");
    room.currentBid = 0;
    room.highestBidderId = null;
    room.bidHistory = [];
    room.passedManagerIds = [];
    room.lastWinner = null;
    room.roundId = this.id("round");
    room.seenRequestIds.clear();
    room.endsAt = Date.now() + room.settings.auctionSeconds * 1000;
    this.scheduleEnd(room);
    this.scheduleBots(room);
    this.broadcast(room);
  }

  private scheduleEnd(room: InternalRoom): void {
    if (room.timer) clearTimeout(room.timer);
    const roundId = room.roundId;
    const delay = Math.max(0, (room.endsAt ?? Date.now()) - Date.now());
    room.timer = this.safeTimer(room, "auction_timer_complete", () => this.endRound(room.code, roundId), delay);
  }

  private scheduleBots(room: InternalRoom): void {
    room.botTimers.forEach(clearTimeout);
    room.botTimers = [];
    const footballer = room.currentFootballer;
    if (!footballer || room.phase !== "auction") return;
    const roundId = room.roundId;
    const openingBid = getOpeningBid(room.settings, footballer);
    const profiles = {
      Amateur: { value: .72, variance: .24, attempts: [1, 2], reaction: 3400, need: .10 },
      Professional: { value: .92, variance: .28, attempts: [2, 4], reaction: 2300, need: .22 },
      "World Class": { value: 1.10, variance: .22, attempts: [3, 5], reaction: 1450, need: .38 },
      Legendary: { value: 1.24, variance: .16, attempts: [4, 7], reaction: 850, need: .52 }
    } as const;
    const profile = profiles[room.settings.botDifficulty];
    room.managers.filter(manager => manager.isBot && !manager.auctionComplete && manager.squad.length < this.configuredSquadSize(room) && manager.budget >= openingBid).forEach((bot, index) => {
      const reserve = Math.max(0, this.configuredSquadSize(room) - bot.squad.length - 1) * room.settings.minimumBid;
      const targets = getSquadPositionTargets(getStartingLineupSize(room.settings.squadSize));
      const ownedAtPosition = bot.squad.filter(entry => entry.footballer.position === footballer.position).length;
      const broadNeed = Math.max(0, targets[footballer.position] - ownedAtPosition) / Math.max(1, targets[footballer.position]);
      const playerRoles = getFootballerRoles(footballer);
      const roleNeeds = this.roleCoverageTargets(1, room.settings)
        .filter(group => playerRoles.some(role => group.roles.includes(role)))
        .map(group => {
          const owned = bot.squad.filter(entry => getFootballerRoles(entry.footballer).some(role => group.roles.includes(role))).length;
          return Math.max(0, group.target - owned) / Math.max(1, group.target);
        });
      const positionalNeed = Math.max(broadNeed, ...roleNeeds, 0);
      const versatilityBoost = Math.max(0, playerRoles.length - 1) * .018;
      const qualityBoost = Math.max(0, footballer.overall - 82) * .012 + (footballer.playerType === "ICON" ? .08 : 0) + versatilityBoost;
      const personalityIndex = room.managers.filter(item => item.isBot).findIndex(item => item.id === bot.id) % 6;
      const personality = [
        { value: -.18, need: .08, late: .10 },
        { value: .24, need: .08, late: .18 },
        { value: footballer.overall >= 88 ? .34 : -.10, need: 0, late: .24 },
        { value: 0, need: .12, late: .28 },
        { value: -.03, need: .38, late: .32 },
        { value: .06, need: .12, late: .88 }
      ][personalityIndex]!;
      const multiplier = profile.value + personality.value + positionalNeed * (profile.need + personality.need) + qualityBoost + (Math.random() - .5) * profile.variance;
      const max = Math.max(0, Math.min(bot.budget - reserve, Math.round(footballer.basePrice * multiplier)));
      const attempts = profile.attempts[0] + Math.floor(Math.random() * (profile.attempts[1] - profile.attempts[0] + 1));
      for (let attempt = 0; attempt < attempts; attempt++) {
        const roundWindow = Math.max(2500, room.settings.auctionSeconds * 1000 - 1800);
        const strategicLateBias = Math.max(personality.late, room.settings.botDifficulty === "Legendary" ? .58 : room.settings.botDifficulty === "World Class" ? .42 : .18);
        const randomPoint = Math.random();
        const delay = strategicLateBias && randomPoint < strategicLateBias
          ? Math.max(profile.reaction, roundWindow * (.70 + Math.random() * .24))
          : profile.reaction + Math.floor(Math.random() * Math.max(1200, roundWindow - profile.reaction));
        const timer = this.safeTimer(room, "bot_bid", () => {
          if (room.phase !== "auction" || room.roundId !== roundId || room.currentFootballer?.id !== footballer.id || room.highestBidderId === bot.id) return;
          const next = room.currentBid === 0 ? openingBid : room.currentBid + room.settings.bidIncrement;
          if (next <= max) {
            try { this.bid(room.code, bot.id, next, this.id("botbid"), roundId); } catch { /* another action won the race */ }
          }
        }, delay + index * 80 + attempt * 110);
        room.botTimers.push(timer);
      }
    });
  }

  bid(code: string, managerId: string, amount: number, requestId: string, roundId: string): void {
    const room = this.get(code);
    const manager = this.managerIn(room, managerId);
    if (room.transitionRoundId) throw new Error("This auction round has already ended. Waiting for the next footballer.");
    if (roundId !== room.roundId) throw new Error("That bid belongs to an older auction round.");
    if (!requestId || requestId.length > 100) throw new Error("Invalid bid request.");
    if (room.seenRequestIds.has(requestId)) return;
    room.seenRequestIds.add(requestId);
    if (manager.auctionComplete) throw new Error("You marked your auction squad as complete.");
    if (room.passedManagerIds.includes(manager.id)) throw new Error("You passed on this footballer and cannot bid again this round.");
    const now = Date.now();
    const lastBid = room.lastBidAt.get(manager.id) ?? 0;
    if (!manager.isBot && now - lastBid < 180) throw new Error("Bid requests are arriving too quickly.");
    room.lastBidAt.set(manager.id, now);
    const error = validateBid({
      amount,
      currentBid: room.currentBid,
      manager,
      settings: room.settings,
      footballer: room.currentFootballer,
      auctionActive: room.phase === "auction" && !!room.endsAt && Date.now() < room.endsAt
    });
    if (error) throw new Error(error);
    room.currentBid = amount;
    room.highestBidderId = manager.id;
    const entry: BidEntry = { id: this.id("bid"), managerId: manager.id, managerName: manager.name, amount, receivedAt: Date.now() };
    room.bidHistory = [entry, ...room.bidHistory].slice(0, 12);

    // A valid bid can make the bidder the only remaining competitor. Resolve
    // that state before extending/restarting the timer so a sole bidder wins
    // immediately instead of waiting for the countdown.
    if (this.evaluateAuctionCompletion(room)) return;

    if (room.endsAt && room.endsAt - Date.now() <= room.settings.antiSnipeSeconds * 1000) {
      room.endsAt = Date.now() + room.settings.antiSnipeSeconds * 1000;
      this.scheduleEnd(room);
    }
    this.broadcastAuctionPatch(room);
  }

  pass(code: string, managerId: string, requestId: string, roundId: string): void {
    const room = this.get(code);
    const manager = this.managerIn(room, managerId);
    if (room.transitionRoundId) return;
    if (room.phase !== "auction" || !room.endsAt || Date.now() >= room.endsAt) throw new Error("This auction round is closed.");
    if (roundId !== room.roundId) throw new Error("That pass belongs to an older auction round.");
    if (!requestId || requestId.length > 100) throw new Error("Invalid pass request.");
    if (room.seenRequestIds.has(requestId)) return;
    room.seenRequestIds.add(requestId);
    if (manager.auctionComplete) throw new Error("You already finished bidding for this auction.");
    if (room.passedManagerIds.includes(manager.id)) return;

    this.markManagerPassedForCurrentRound(room, manager.id);
    if (this.evaluateAuctionCompletion(room)) return;
    this.broadcastAuctionPatch(room);
  }

  completeAuction(code: string, managerId: string): void {
    const room = this.get(code);
    if (room.phase !== "auction" && room.phase !== "round_result") throw new Error("You can only finish bidding during the auction.");
    const manager = this.managerIn(room, managerId);
    if (manager.auctionComplete) return;

    const completion = getSquadCompletion(manager.squad, room.settings);
    if (!completion.startersComplete) {
      const goalkeeperHint = completion.goalkeeperReady ? "" : " including a goalkeeper";
      throw new Error(`You cannot finish bidding yet. You still need ${completion.startersRemaining} starting player${completion.startersRemaining === 1 ? "" : "s"}${goalkeeperHint}.`);
    }
    if (room.phase === "auction" && room.highestBidderId === manager.id) {
      throw new Error("Finish the current auction round before leaving bidding. You are the highest bidder.");
    }

    manager.auctionComplete = true;
    this.markManagerPassedForCurrentRound(room, manager.id);

    if (this.allManagersAuctionComplete(room)) {
      this.beginFormation(room);
      return;
    }
    if (room.phase === "auction" && this.evaluateAuctionCompletion(room)) return;
    this.broadcast(room);
  }

  private endRound(code: string, roundId: string): void {
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room || room.roundId !== roundId || room.phase !== "auction") return;
    if (room.transitionRoundId === roundId) return;
    room.transitionRoundId = roundId;
    this.clearTimers(room);
    room.endsAt = null;
    const footballer = room.currentFootballer;

    if (room.highestBidderId && footballer) {
      const winner = this.managerIn(room, room.highestBidderId);
      if (winner.squad.length < this.configuredSquadSize(room) && !this.managerOwns(winner, footballer)) {
        winner.budget -= room.currentBid;
        winner.squad.push({ footballer, price: room.currentBid, round: room.roundIndex + 1 });
        this.syncAutomaticAuctionCompletion(room);
        room.playerStatus.set(footballer.id, "SOLD");
        room.lastWinner = { managerName: winner.name, footballerName: footballer.name, amount: room.currentBid };
      } else {
        room.playerStatus.set(footballer.id, "FINISHED");
        room.lastWinner = null;
      }
    } else if (footballer) {
      room.playerStatus.set(footballer.id, "SKIPPED");
      room.lastWinner = null;
      if (room.settings.reauctionUnsold && !room.reauctionPhase) room.reauctionQueue.push(footballer);
    }

    room.phase = "round_result";
    this.broadcast(room);
    room.timer = this.safeTimer(room, "round_result_complete", () => {
      const latest = this.rooms.get(room.code);
      if (!latest || latest.roundId !== roundId || latest.phase !== "round_result") return;
      latest.roundIndex++;
      this.beginRound(latest);
    }, 2000);
  }

  private beginFormation(room: InternalRoom): void {
    if (room.auctionCompletionStarted || room.phase === "formation" || room.phase === "finished") return;
    room.auctionCompletionStarted = true;
    this.clearTimers(room);
    room.transitionRoundId = room.roundId || room.transitionRoundId;
    if (room.phase === "auction" && room.currentFootballer && room.playerStatus.get(room.currentFootballer.id) === "ACTIVE") {
      room.playerStatus.set(room.currentFootballer.id, "FINISHED");
    }
    room.phase = "formation";
    room.currentFootballer = null;
    room.currentBid = 0;
    room.highestBidderId = null;
    room.endsAt = null;
    room.bidHistory = [];
    room.lastWinner = null;
    room.formationEndsAt = Date.now() + room.settings.formationSeconds * 1000;

    for (const manager of room.managers) {
      const automatic = buildAutomaticLineup(manager.squad, undefined, getStartingLineupSize(room.settings.squadSize));
      manager.formationId = automatic.formationId;
      manager.lineup = automatic.lineup;
      manager.lineupScore = automatic.score;
      manager.lineupSubmitted = manager.isBot || manager.squad.length < getStartingLineupSize(room.settings.squadSize);
    }

    this.broadcast(room);
    if (room.managers.every(manager => manager.lineupSubmitted)) {
      this.finish(room);
      return;
    }
    room.timer = this.safeTimer(room, "formation_timer_complete", () => {
      const latest = this.rooms.get(room.code);
      if (!latest || latest.phase !== "formation") return;
      latest.managers.forEach(manager => { manager.lineupSubmitted = true; });
      this.finish(latest);
    }, room.settings.formationSeconds * 1000);
  }

  submitLineup(code: string, managerId: string, formationId: string, picksInput: LineupPick[]): void {
    const room = this.get(code);
    if (room.phase !== "formation") throw new Error("Lineups can only be submitted after the auction.");
    const manager = this.managerIn(room, managerId);
    if (manager.isBot) throw new Error("AI lineups are controlled by the server.");
    const picks = lineupSchema.parse(picksInput);
    const lineup = validateAndBuildLineup(manager.squad, formationId, picks, getStartingLineupSize(room.settings.squadSize));
    manager.formationId = formationId;
    manager.lineup = lineup;
    manager.lineupScore = Math.round(lineup.reduce((sum, item) => sum + item.fit, 0) / lineup.length);
    manager.lineupSubmitted = true;
    this.broadcast(room);
    if (room.managers.every(item => item.lineupSubmitted)) this.finish(room);
  }

  private finish(room: InternalRoom): void {
    this.clearTimers(room);
    room.phase = "finished";
    room.currentFootballer = null;
    room.endsAt = null;
    room.formationEndsAt = null;
    room.rankings = rankManagers(room.managers);
    const allPurchases = room.managers.flatMap(manager => manager.squad.map(entry => ({ manager, entry })));
    const awards: Award[] = [];
    const bestFit = [...room.rankings].sort((a, b) => b.lineupFit - a.lineupFit)[0];
    const bestAttack = [...room.rankings].sort((a, b) => b.attack - a.attack)[0];
    const bestBench = [...room.rankings].sort((a, b) => b.benchStrength - a.benchStrength)[0];
    const bestValue = [...room.rankings].sort((a, b) => b.value - a.value)[0];
    const expensive = [...allPurchases].sort((a, b) => b.entry.price - a.entry.price)[0];
    const bargain = [...allPurchases].sort((a, b) => getPurchaseValue(b.entry) - getPurchaseValue(a.entry))[0];
    if (bestFit) awards.push({ title: "Best Formation Fit", managerName: bestFit.managerName, detail: `${bestFit.formationName} • Fit ${bestFit.lineupFit}` });
    if (bestAttack) awards.push({ title: "Best Attack", managerName: bestAttack.managerName, detail: `Attack rating ${bestAttack.attack}` });
    if (bestBench && room.managers.some(manager => manager.squad.length > getStartingLineupSize(room.settings.squadSize))) awards.push({ title: "Strongest Bench", managerName: bestBench.managerName, detail: `Bench strength ${bestBench.benchStrength}` });
    if (bestValue) awards.push({ title: "Best Value", managerName: bestValue.managerName, detail: `Value rating ${bestValue.value}` });
    if (expensive) awards.push({ title: "Record Signing", managerName: expensive.manager.name, detail: `${expensive.entry.footballer.name} for ${expensive.entry.price}M` });
    if (bargain) awards.push({ title: "Biggest Bargain", managerName: bargain.manager.name, detail: `${bargain.entry.footballer.name} for ${bargain.entry.price}M` });
    if (room.settings.playerPoolMode === "mixed" || room.settings.playerPoolMode === "custom") {
      const iconPurchases = allPurchases.filter(item => item.entry.footballer.playerType === "ICON");
      const currentPurchases = allPurchases.filter(item => (item.entry.footballer.playerType ?? "CURRENT") === "CURRENT");
      const bestIcon = [...iconPurchases].sort((a, b) => getPurchaseValue(b.entry) - getPurchaseValue(a.entry))[0];
      const bestCurrent = [...currentPurchases].sort((a, b) => getPurchaseValue(b.entry) - getPurchaseValue(a.entry))[0];
      const expensiveIcon = [...iconPurchases].sort((a, b) => b.entry.price - a.entry.price)[0];
      if (bestIcon) awards.push({ title: "Best Icon Signing", managerName: bestIcon.manager.name, detail: `${bestIcon.entry.footballer.name} • OVR ${bestIcon.entry.footballer.overall}` });
      if (bestCurrent) awards.push({ title: "Best Current Signing", managerName: bestCurrent.manager.name, detail: `${bestCurrent.entry.footballer.name} • OVR ${bestCurrent.entry.footballer.overall}` });
      if (expensiveIcon) awards.push({ title: "Most Expensive Icon", managerName: expensiveIcon.manager.name, detail: `${expensiveIcon.entry.footballer.name} for ${expensiveIcon.entry.price}M` });
    }
    room.awards = awards;
    this.broadcast(room);
  }

  quitSolo(code: string, managerId: string): void {
    const room = this.get(code);
    if (!room.isSolo) throw new Error("The quit-match option is only available in Solo Practice.");
    const manager = this.managerIn(room, managerId);
    if (manager.isBot) throw new Error("AI managers cannot quit the match.");
    this.clearTimers(room);
    room.disconnectTimers.forEach(clearTimeout);
    room.disconnectTimers.clear();
    this.rooms.delete(room.code);
  }

  sendChat(code: string, managerId: string, textInput: string): void {
    const room = this.get(code);
    const manager = this.managerIn(room, managerId);
    if (manager.isBot) throw new Error("AI managers cannot send chat messages.");
    const now = Date.now();
    const lastSent = room.lastChatAt.get(manager.id) ?? 0;
    if (now - lastSent < 700) throw new Error("You are sending messages too quickly.");
    const text = chatSchema.parse(textInput).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    const message: ChatMessage = {
      id: this.id("chat"),
      managerId: manager.id,
      managerName: manager.name,
      avatar: manager.avatar,
      text,
      sentAt: now
    };
    room.lastChatAt.set(manager.id, now);
    room.chatMessages = [...room.chatMessages, message].slice(-100);
    this.broadcast(room);
  }

  typing(code: string, managerId: string, isTyping: boolean): { managerId: string; managerName: string; isTyping: boolean } {
    const room = this.get(code);
    const manager = this.managerIn(room, managerId);
    return { managerId: manager.id, managerName: manager.name, isTyping: !!isTyping };
  }

  reaction(code: string, managerId: string, reaction: string): void {
    const room = this.get(code);
    const manager = this.managerIn(room, managerId);
    const allowed = ["🔥", "👏", "😱", "💸", "⚡", "🧠"];
    if (!allowed.includes(reaction)) return;
    this.emitReaction(room.code, { managerName: manager.name, reaction, at: Date.now() });
  }

  getState(code: string, viewerManagerId?: string): RoomState { return this.publicState(this.get(code), viewerManagerId); }

  private get(code: string): InternalRoom {
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) throw new Error("Room not found. Check the six-character code.");
    return room;
  }

  private managerIn(room: InternalRoom, id: string): InternalManager {
    const manager = room.managers.find(item => item.id === id);
    if (!manager) throw new Error("Manager seat not found.");
    return manager;
  }

  private clearTimers(room: InternalRoom): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.botTimers.forEach(clearTimeout);
    room.botTimers = [];
  }
}
