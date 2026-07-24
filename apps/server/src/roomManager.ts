import crypto from "node:crypto";
import { getMaximumSquadSize, getSquadPositionTargets } from "@auction-eleven/shared";
import type {
  Award,
  BidEntry,
  ChatMessage,
  Footballer,
  GameSettings,
  LineupPick,
  ManagerView,
  PoolTargets,
  Position,
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

interface InternalManager extends ManagerView {
  sessionId: string;
  socketId: string | null;
}

interface InternalRoom extends Omit<RoomState, "managers" | "availableFootballers" | "poolSelectionValid"> {
  managers: InternalManager[];
  footballerPool: Footballer[];
  seenRequestIds: Set<string>;
  timer: NodeJS.Timeout | null;
  botTimers: NodeJS.Timeout[];
  unsoldCounts: Map<string, number>;
  lastChatAt: Map<string, number>;
  lastBidAt: Map<string, number>;
  passedManagerIds: string[];
}

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
const nameSchema = z.string().trim().min(2).max(18).regex(/^[\p{L}\p{N} _-]+$/u, "Use letters, numbers, spaces, - or _ only.");
const poolTargetsSchema = z.object({
  GK: z.number().int().min(15).max(20),
  DEF: z.number().int().min(15).max(20),
  MID: z.number().int().min(15).max(20),
  FWD: z.number().int().min(15).max(20)
});
const settingsSchema = z.object({
  startingBudget: z.number().int().min(300).max(3000).optional(),
  minimumBid: z.number().int().min(1).max(50).optional(),
  bidIncrement: z.number().int().min(1).max(20).optional(),
  auctionSeconds: z.number().int().min(15).max(120).optional(),
  squadSize: z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10), z.literal(11)]).optional(),
  antiSnipeSeconds: z.number().int().min(0).max(8).optional(),
  formationSeconds: z.number().int().min(120).max(600).optional(),
  botDifficulty: z.enum(["Amateur", "Professional", "World Class", "Legendary"]).optional(),
  managerLimit: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)]).optional(),
  poolTargets: poolTargetsSchema.optional()
});
const selectedIdsSchema = z.array(z.string().min(1)).max(80);
const lineupSchema = z.array(z.object({ slotId: z.string().min(1), footballerId: z.string().min(1) })).min(6).max(11);
const chatSchema = z.string().trim().min(1, "Write a message first.").max(300, "Messages can contain up to 300 characters.");

const AVATARS = ["🦁", "🐺", "🦅", "🐉", "🦊", "🐯", "🦈", "⚡", "🔥", "👑", "🦂", "🦬", "🦏"];
const BOT_NAMES = ["Nova AI", "Tactico AI", "Blitz AI", "Orbit AI", "Pressing AI", "Maestro AI", "Counter AI", "Titan AI", "Vortex AI", "Apex AI", "Tempo AI", "Sentinel AI"];
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const shuffle = <T>(input: T[]): T[] => [...input].sort(() => Math.random() - .5);

export class RoomManager {
  private rooms = new Map<string, InternalRoom>();

  constructor(
    private emitState: (code: string, state: RoomState) => void,
    private emitReaction: (code: string, payload: { managerName: string; reaction: string; at: number }) => void
  ) {}

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

  private poolIsValid(ids: string[], targets: PoolTargets): boolean {
    const counts = this.selectionCounts(ids);
    return POSITIONS.every(position => counts[position] === targets[position]);
  }

  private autoSelect(targets: PoolTargets, existing: string[] = []): string[] {
    const unique = [...new Set(existing)].filter(id => FOOTBALLER_BY_ID.has(id));
    const next: string[] = [];
    for (const position of POSITIONS) {
      const kept = unique.filter(id => FOOTBALLER_BY_ID.get(id)?.position === position).slice(0, targets[position]);
      const keptSet = new Set(kept);
      const candidates = shuffle(FOOTBALLERS.filter(player => player.position === position && !keptSet.has(player.id)));
      next.push(...kept, ...candidates.slice(0, targets[position] - kept.length).map(player => player.id));
    }
    return next;
  }

  private catalogueId(player: Footballer): string { return player.catalogId ?? player.id; }

  private managerOwns(manager: InternalManager, player: Footballer): boolean {
    const id = this.catalogueId(player);
    return manager.squad.some(entry => this.catalogueId(entry.footballer) === id);
  }

  private buildAuctionPool(selected: Footballer[], requiredPlayers: number, managerCount: number): Footballer[] {
    if (!selected.length) return [];
    const pool: Footballer[] = [];
    for (const position of POSITIONS) {
      const candidates = selected.filter(player => player.position === position);
      if (!candidates.length) continue;
      const recommended = getSquadPositionTargets(Math.ceil(requiredPlayers / managerCount));
      const target = managerCount * recommended[position] + Math.max(2, Math.ceil(managerCount / 3));
      let created = 0;
      let cycle = 0;
      while (created < target) {
        for (const player of shuffle(candidates)) {
          if (created >= target) break;
          pool.push(cycle === 0 ? player : {
            ...player,
            id: `${player.id}__mirror_${cycle}_${position}_${created}`,
            catalogId: player.catalogId ?? player.id
          });
          created++;
        }
        cycle++;
      }
    }
    if (pool.length < requiredPlayers) throw new Error("The selected player pool cannot create enough auction cards.");
    return shuffle(pool);
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

  private publicState(room: InternalRoom): RoomState {
    return {
      code: room.code,
      phase: room.phase,
      version: room.version,
      hostId: room.hostId,
      isSolo: room.isSolo,
      managers: room.managers.map(({ sessionId: _session, socketId: _socket, ...manager }) => manager),
      settings: room.settings,
      availableFootballers: room.phase === "lobby" ? FOOTBALLERS : [],
      selectedFootballerIds: room.selectedFootballerIds,
      poolSelectionValid: this.poolIsValid(room.selectedFootballerIds, room.settings.poolTargets),
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
    this.emitState(room.code, this.publicState(room));
  }

  create(nameInput: string, sessionId: string, socketId: string, solo = false): { code: string; managerId: string } {
    const name = nameSchema.parse(nameInput);
    const code = this.code();
    const settings = structuredClone(DEFAULT_SETTINGS);
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
      managers,
      settings,
      selectedFootballerIds: this.autoSelect(settings.poolTargets),
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
      passedManagerIds: []
    };
    this.rooms.set(code, room);
    this.broadcast(room);
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
      sessionId,
      socketId
    };
  }

  join(codeInput: string, nameInput: string, sessionId: string, socketId: string): { code: string; managerId: string } {
    const code = codeInput.trim().toUpperCase();
    const room = this.get(code);
    if (room.isSolo) throw new Error("Solo Practice rooms cannot be joined.");
    if (room.phase !== "lobby") throw new Error("This match has already started.");
    if (room.managers.length >= room.settings.managerLimit) throw new Error(`This room is full (${room.settings.managerLimit} squads).`);
    const name = nameSchema.parse(nameInput);
    if (room.managers.some(manager => manager.name.toLowerCase() === name.toLowerCase())) throw new Error("That manager name is already used in this room.");
    const manager = this.manager(name, sessionId, socketId, false, false, room.settings.startingBudget, room.managers.length);
    room.managers.push(manager);
    this.broadcast(room);
    return { code, managerId: manager.id };
  }

  resume(codeInput: string, sessionId: string, socketId: string): { managerId: string } {
    const room = this.get(codeInput.trim().toUpperCase());
    const manager = room.managers.find(item => item.sessionId === sessionId);
    if (!manager) throw new Error("Your saved seat could not be found.");
    manager.socketId = socketId;
    manager.connected = true;
    this.broadcast(room);
    return { managerId: manager.id };
  }

  leave(code: string, managerId: string): void {
    const room = this.get(code);
    const manager = this.managerIn(room, managerId);

    if (room.isSolo) {
      this.clearTimers(room);
      this.rooms.delete(room.code);
      return;
    }

    if (room.phase === "lobby" || room.phase === "finished") {
      room.managers = room.managers.filter(item => item.id !== manager.id);
      room.lastChatAt.delete(manager.id);
      room.lastBidAt.delete(manager.id);
      if (room.managers.length === 0) {
        this.clearTimers(room);
        this.rooms.delete(room.code);
        return;
      }
      if (room.hostId === manager.id) {
        room.hostId = room.managers[0]!.id;
        room.managers.forEach(item => { item.isHost = item.id === room.hostId; });
      }
      this.broadcast(room);
      return;
    }

    manager.connected = false;
    manager.socketId = null;
    this.broadcast(room);
  }

  disconnect(socketId: string): void {
    for (const room of this.rooms.values()) {
      const manager = room.managers.find(item => item.socketId === socketId);
      if (!manager) continue;
      manager.connected = false;
      manager.socketId = null;
      this.broadcast(room);
    }
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
    room.settings = { ...room.settings, ...parsed };
    if (parsed.poolTargets) room.selectedFootballerIds = this.autoSelect(parsed.poolTargets, room.selectedFootballerIds);
    this.syncSoloBots(room);
    room.managers.forEach(manager => { manager.budget = room.settings.startingBudget; });
    this.broadcast(room);
  }

  updatePlayerPool(code: string, managerId: string, selectedFootballerIds: string[]): void {
    const room = this.get(code);
    if (room.hostId !== managerId) throw new Error("Only the host can select the room footballers.");
    if (room.phase !== "lobby") throw new Error("The player pool is locked after kickoff.");
    const parsed = selectedIdsSchema.parse(selectedFootballerIds);
    const unique = [...new Set(parsed)];
    if (unique.length !== parsed.length) throw new Error("The selected pool contains duplicate footballers.");
    if (unique.some(id => !FOOTBALLER_BY_ID.has(id))) throw new Error("The selected pool contains an unknown footballer.");
    const counts = this.selectionCounts(unique);
    for (const position of POSITIONS) {
      if (counts[position] > room.settings.poolTargets[position]) throw new Error(`Select no more than ${room.settings.poolTargets[position]} ${position} players.`);
    }
    room.selectedFootballerIds = unique;
    this.broadcast(room);
  }

  start(code: string, managerId: string): void {
    const room = this.get(code);
    if (room.hostId !== managerId) throw new Error("Only the host can start the match.");
    const humans = room.managers.filter(manager => !manager.isBot);
    if (humans.length < 2 && !room.isSolo) throw new Error("Add another manager or use Solo Practice.");
    if (room.managers.some(manager => !manager.ready)) throw new Error("Every manager must be ready.");
    if (!this.poolIsValid(room.selectedFootballerIds, room.settings.poolTargets)) {
      const counts = this.selectionCounts(room.selectedFootballerIds);
      throw new Error(`Complete the player pool: GK ${counts.GK}/${room.settings.poolTargets.GK}, DEF ${counts.DEF}/${room.settings.poolTargets.DEF}, MID ${counts.MID}/${room.settings.poolTargets.MID}, FWD ${counts.FWD}/${room.settings.poolTargets.FWD}.`);
    }
    const requiredPlayers = room.managers.length * getMaximumSquadSize(room.settings.squadSize);
    const selected = room.selectedFootballerIds.map(id => FOOTBALLER_BY_ID.get(id)).filter((player): player is Footballer => !!player);
    room.phase = "auction";
    room.footballerPool = this.buildAuctionPool(selected, requiredPlayers, room.managers.length);
    room.totalRounds = room.footballerPool.length;
    room.roundIndex = 0;
    room.unsoldCounts.clear();
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
    });
    this.beginRound(room);
  }

  private beginRound(room: InternalRoom): void {
    this.clearTimers(room);
    const maximumSquadSize = getMaximumSquadSize(room.settings.squadSize);
    const noManagerCanBuyMore = room.managers.every(manager => manager.squad.length >= maximumSquadSize || manager.budget < room.settings.minimumBid);
    if (noManagerCanBuyMore) {
      this.beginFormation(room);
      return;
    }
    if (room.roundIndex >= room.footballerPool.length) {
      throw new Error("The selected pool ended before every squad was complete. Add more room footballers.");
    }
    room.phase = "auction";
    room.currentFootballer = room.footballerPool[room.roundIndex]!;
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
    const delay = Math.max(0, (room.endsAt ?? Date.now()) - Date.now());
    room.timer = setTimeout(() => this.endRound(room.code, room.roundId), delay);
  }

  private scheduleBots(room: InternalRoom): void {
    room.botTimers.forEach(clearTimeout);
    room.botTimers = [];
    const profiles = {
      Amateur: { value: .72, variance: .24, attempts: [1, 2], reaction: 3400, need: .10 },
      Professional: { value: .92, variance: .28, attempts: [2, 4], reaction: 2300, need: .22 },
      "World Class": { value: 1.10, variance: .22, attempts: [3, 5], reaction: 1450, need: .38 },
      Legendary: { value: 1.24, variance: .16, attempts: [4, 7], reaction: 850, need: .52 }
    } as const;
    const profile = profiles[room.settings.botDifficulty];
    room.managers.filter(manager => manager.isBot && manager.squad.length < getMaximumSquadSize(room.settings.squadSize) && manager.budget >= room.settings.minimumBid).forEach((bot, index) => {
      const footballer = room.currentFootballer!;
      const reserve = Math.max(0, room.settings.squadSize - bot.squad.length - 1) * room.settings.minimumBid;
      const targets = getSquadPositionTargets(room.settings.squadSize);
      const ownedAtPosition = bot.squad.filter(entry => entry.footballer.position === footballer.position).length;
      const positionalNeed = Math.max(0, targets[footballer.position] - ownedAtPosition) / Math.max(1, targets[footballer.position]);
      const qualityBoost = Math.max(0, footballer.overall - 82) * .012;
      const multiplier = profile.value + positionalNeed * profile.need + qualityBoost + (Math.random() - .5) * profile.variance;
      const max = Math.max(0, Math.min(bot.budget - reserve, Math.round(footballer.basePrice * multiplier)));
      const attempts = profile.attempts[0] + Math.floor(Math.random() * (profile.attempts[1] - profile.attempts[0] + 1));
      for (let attempt = 0; attempt < attempts; attempt++) {
        const roundWindow = Math.max(2500, room.settings.auctionSeconds * 1000 - 1800);
        const strategicLateBias = room.settings.botDifficulty === "Legendary" ? .58 : room.settings.botDifficulty === "World Class" ? .42 : .18;
        const randomPoint = Math.random();
        const delay = strategicLateBias && randomPoint < strategicLateBias
          ? Math.max(profile.reaction, roundWindow * (.70 + Math.random() * .24))
          : profile.reaction + Math.floor(Math.random() * Math.max(1200, roundWindow - profile.reaction));
        const timer = setTimeout(() => {
          if (room.phase !== "auction" || room.currentFootballer?.id !== footballer.id || room.highestBidderId === bot.id) return;
          const next = room.currentBid === 0 ? room.settings.minimumBid : room.currentBid + room.settings.bidIncrement;
          if (next <= max) {
            try { this.bid(room.code, bot.id, next, this.id("botbid"), room.roundId); } catch { /* another bid won the race */ }
          }
        }, delay + index * 80 + attempt * 110);
        room.botTimers.push(timer);
      }
    });
  }

  bid(code: string, managerId: string, amount: number, requestId: string, roundId: string): void {
    const room = this.get(code);
    const manager = this.managerIn(room, managerId);
    if (roundId !== room.roundId) throw new Error("That bid belongs to an older auction round.");
    if (!requestId || requestId.length > 100) throw new Error("Invalid bid request.");
    if (room.seenRequestIds.has(requestId)) return;
    room.seenRequestIds.add(requestId);
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
    if (room.endsAt && room.endsAt - Date.now() <= room.settings.antiSnipeSeconds * 1000) {
      room.endsAt = Date.now() + room.settings.antiSnipeSeconds * 1000;
      this.scheduleEnd(room);
    }
    this.broadcast(room);
  }

  pass(code: string, managerId: string, roundId: string): void {
    const room = this.get(code);
    const manager = this.managerIn(room, managerId);
    if (room.phase !== "auction" || !room.endsAt || Date.now() >= room.endsAt) throw new Error("This auction round is closed.");
    if (roundId !== room.roundId) throw new Error("That pass belongs to an older auction round.");
    if (room.passedManagerIds.includes(manager.id)) return;

    room.passedManagerIds = [...room.passedManagerIds, manager.id];
    this.broadcast(room);

    const maximumSquadSize = getMaximumSquadSize(room.settings.squadSize);
    const eligible = room.managers.filter(item =>
      item.squad.length < maximumSquadSize &&
      item.budget >= room.settings.minimumBid &&
      !!room.currentFootballer &&
      !this.managerOwns(item, room.currentFootballer)
    );

    if (eligible.length > 0 && eligible.every(item => room.passedManagerIds.includes(item.id))) {
      this.endRound(room.code, room.roundId);
    }
  }

  private endRound(code: string, roundId: string): void {
    const room = this.rooms.get(code);
    if (!room || room.roundId !== roundId || room.phase !== "auction") return;
    this.clearTimers(room);
    room.endsAt = null;
    const footballer = room.currentFootballer;

    if (room.highestBidderId && footballer) {
      const winner = this.managerIn(room, room.highestBidderId);
      winner.budget -= room.currentBid;
      winner.squad.push({ footballer, price: room.currentBid, round: room.roundIndex + 1 });
      room.lastWinner = { managerName: winner.name, footballerName: footballer.name, amount: room.currentBid };
    } else if (footballer) {
      const attempts = (room.unsoldCounts.get(footballer.id) ?? 0) + 1;
      room.unsoldCounts.set(footballer.id, attempts);
      if (attempts >= 2) {
        const eligible = room.managers
          .filter(manager => manager.squad.length < getMaximumSquadSize(room.settings.squadSize) && manager.budget >= room.settings.minimumBid && !!footballer && !this.managerOwns(manager, footballer) && !room.passedManagerIds.includes(manager.id))
          .sort((a, b) => a.squad.length - b.squad.length || b.budget - a.budget || a.joinedAt - b.joinedAt);
        const recipient = eligible[0];
        if (recipient) {
          recipient.budget -= room.settings.minimumBid;
          recipient.squad.push({ footballer, price: room.settings.minimumBid, round: room.roundIndex + 1 });
          room.lastWinner = { managerName: recipient.name, footballerName: footballer.name, amount: room.settings.minimumBid, automatic: true };
        } else {
          room.lastWinner = null;
        }
      } else {
        room.footballerPool.push(footballer);
        room.totalRounds = room.footballerPool.length;
        room.lastWinner = null;
      }
    }

    room.phase = "round_result";
    this.broadcast(room);
    room.timer = setTimeout(() => {
      room.roundIndex++;
      this.beginRound(room);
    }, 2600);
  }

  private beginFormation(room: InternalRoom): void {
    this.clearTimers(room);
    room.phase = "formation";
    room.currentFootballer = null;
    room.currentBid = 0;
    room.highestBidderId = null;
    room.endsAt = null;
    room.bidHistory = [];
    room.lastWinner = null;
    room.formationEndsAt = Date.now() + room.settings.formationSeconds * 1000;

    for (const manager of room.managers) {
      const automatic = buildAutomaticLineup(manager.squad, undefined, room.settings.squadSize);
      manager.formationId = automatic.formationId;
      manager.lineup = automatic.lineup;
      manager.lineupScore = automatic.score;
      manager.lineupSubmitted = manager.isBot;
    }

    this.broadcast(room);
    if (room.managers.every(manager => manager.lineupSubmitted)) {
      this.finish(room);
      return;
    }
    room.timer = setTimeout(() => {
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
    const lineup = validateAndBuildLineup(manager.squad, formationId, picks, room.settings.squadSize);
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
    if (bestBench && room.managers.some(manager => manager.squad.length > room.settings.squadSize)) awards.push({ title: "Strongest Bench", managerName: bestBench.managerName, detail: `Bench strength ${bestBench.benchStrength}` });
    if (bestValue) awards.push({ title: "Best Value", managerName: bestValue.managerName, detail: `Value rating ${bestValue.value}` });
    if (expensive) awards.push({ title: "Record Signing", managerName: expensive.manager.name, detail: `${expensive.entry.footballer.name} for ${expensive.entry.price}M` });
    if (bargain) awards.push({ title: "Biggest Bargain", managerName: bargain.manager.name, detail: `${bargain.entry.footballer.name} for ${bargain.entry.price}M` });
    room.awards = awards;
    this.broadcast(room);
  }

  quitSolo(code: string, managerId: string): void {
    const room = this.get(code);
    if (!room.isSolo) throw new Error("The quit-match option is only available in Solo Practice.");
    const manager = this.managerIn(room, managerId);
    if (manager.isBot) throw new Error("AI managers cannot quit the match.");
    this.clearTimers(room);
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

  getState(code: string): RoomState { return this.publicState(this.get(code)); }

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
