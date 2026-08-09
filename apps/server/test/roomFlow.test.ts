import { describe, expect, it, vi } from "vitest";
import { getOpeningBid, type RoomState } from "@auction-eleven/shared";
import { FOOTBALLERS } from "../src/footballers.js";
import { RoomManager } from "../src/roomManager.js";

type UnsafeRoomManager = {
  rooms: Map<string, {
    managers: Array<{
      id: string;
      isHost: boolean;
      squad: Array<{ footballer: (typeof FOOTBALLERS)[number]; price: number; round: number }>;
    }>;
  }>;
  beginFormation: (room: unknown) => void;
};

describe("full squad room flow", () => {
  it("moves a completed solo auction into formation selection and final podium results", () => {
    let latest: RoomState | null = null;
    const manager = new RoomManager((_code, state) => { latest = state; }, () => undefined, () => undefined);
    const created = manager.create("Tester", "session-test", "socket-test", true);
    const unsafe = manager as unknown as UnsafeRoomManager;
    const room = unsafe.rooms.get(created.code)!;
    const balancedSquad = [
      ...FOOTBALLERS.filter(player => player.position === "GK").slice(0, 2),
      ...FOOTBALLERS.filter(player => player.position === "DEF").slice(0, 6),
      ...FOOTBALLERS.filter(player => player.position === "MID").slice(0, 5),
      ...FOOTBALLERS.filter(player => player.position === "FWD").slice(0, 4)
    ];
    for (const [managerIndex, participant] of room.managers.entries()) {
      participant.squad = balancedSquad.map((base, index) => {
        const footballer = managerIndex === 0
          ? base
          : { ...base, id: `${base.id}-test-${managerIndex}-${index}`, catalogId: base.id };
        return { footballer, price: footballer.basePrice, round: index + 1 };
      });
    }

    unsafe.beginFormation(room);
    expect((latest as RoomState | null)?.phase).toBe("formation");
    const host = (latest as unknown as RoomState).managers.find(participant => participant.isHost)!;
    expect(host.lineup).toHaveLength(11);
    expect(host.squad.length - host.lineup.length).toBe(6);

    manager.submitLineup(created.code, host.id, host.formationId!, host.lineup.map(item => ({ slotId: item.slotId, footballerId: item.footballerId })));
    const finished = manager.getState(created.code);
    expect(finished.phase).toBe("finished");
    expect(finished.rankings).toHaveLength(6);
    expect(finished.rankings.slice(0, 3).map(item => item.rank)).toEqual([1, 2, 3]);
  });

  it("expands Solo Practice to the maximum 8-manager room capacity", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const created = manager.create("Host", "session-limit", "socket-limit", true);
    manager.updateSettings(created.code, created.managerId, { managerLimit: 8 });
    const state = manager.getState(created.code);
    expect(state.settings.managerLimit).toBe(8);
    expect(state.managers).toHaveLength(8);
    expect(state.managers.filter(item => item.isBot)).toHaveLength(7);
  });

  it("accepts every selectable squad size from 6 through 17", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const created = manager.create("Host", "session-size", "socket-size", true);
    for (const squadSize of [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] as const) {
      manager.updateSettings(created.code, created.managerId, { squadSize });
      expect(manager.getState(created.code).settings.squadSize).toBe(squadSize);
    }
  });


  it.each([
    { managers: 2, starters: 11, substitutes: 10 },
    { managers: 3, starters: 11, substitutes: 10 },
    { managers: 4, starters: 11, substitutes: 10 },
    { managers: 5, starters: 11, substitutes: 8 },
    { managers: 6, starters: 11, substitutes: 5 },
    { managers: 7, starters: 11, substitutes: 2 },
    { managers: 8, starters: 10, substitutes: 2 }
  ] as const)("starts a synchronized $managers-manager online room with dynamic squad capacity", ({ managers: managerCount, starters, substitutes }) => {
    vi.useFakeTimers();
    try {
      let latest: RoomState | null = null;
      const manager = new RoomManager((_code, state) => { latest = state; }, () => undefined, () => undefined);
      const created = manager.create(`Host${managerCount}`, `session-host-${managerCount}`, `socket-host-${managerCount}`, false);
      manager.updateSettings(created.code, created.managerId, { managerLimit: managerCount, squadSize: starters, substituteCount: substitutes });
      const ids = [created.managerId];
      for (let index = 1; index < managerCount; index++) {
        const joined = manager.join(created.code, `Guest${managerCount}_${index}`, `session-${managerCount}-${index}`, `socket-${managerCount}-${index}`);
        ids.push(joined.managerId);
      }
      ids.forEach(id => manager.setReady(created.code, id, true));
      expect(() => manager.start(created.code, created.managerId)).not.toThrow();
      expect((latest as RoomState | null)?.phase).toBe("auction");
      expect((latest as RoomState | null)?.managers).toHaveLength(managerCount);
      expect((latest as RoomState | null)?.settings.substituteCount).toBe(substitutes);
      expect(new Set((latest as RoomState | null)?.managers.map(item => item.id) ?? []).size).toBe(managerCount);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("starts a 3-manager room with 11 starters and 5 substitutes (48 minimum)", () => {
    vi.useFakeTimers();
    try {
      const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
      const host = manager.create("Host48", "session-48-host", "socket-48-host", false);
      manager.updateSettings(host.code, host.managerId, { managerLimit: 3, squadSize: 11, substituteCount: 5 });
      const guest2 = manager.join(host.code, "Guest48A", "session-48-a", "socket-48-a");
      const guest3 = manager.join(host.code, "Guest48B", "session-48-b", "socket-48-b");
      [host.managerId, guest2.managerId, guest3.managerId].forEach(id => manager.setReady(host.code, id, true));
      expect(() => manager.start(host.code, host.managerId)).not.toThrow();
      const state = manager.getState(host.code);
      expect(state.phase).toBe("auction");
      expect(state.managers).toHaveLength(3);
      expect(state.settings.substituteCount).toBe(5);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("explains impossible player-pool configurations before kickoff", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const created = manager.create("LimitHost", "session-limit-host", "socket-limit-host", true);
    manager.updateSettings(created.code, created.managerId, { managerLimit: 8, squadSize: 11, substituteCount: 10, playerPoolMode: "icons" });
    expect(() => manager.start(created.code, created.managerId)).toThrow(/needs 168 unique players/i);
  });

  it("never repeats skipped footballers when re-auction is disabled", () => {
    vi.useFakeTimers();
    try {
      const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
      const host = manager.create("SkipHost", "session-skip-host", "socket-skip-host", false);
      manager.updateSettings(host.code, host.managerId, { managerLimit: 2, squadSize: 6, substituteCount: 0, reauctionUnsold: false });
      const guest = manager.join(host.code, "SkipGuest", "session-skip-guest", "socket-skip-guest");
      manager.setReady(host.code, host.managerId, true);
      manager.setReady(host.code, guest.managerId, true);
      manager.start(host.code, host.managerId);

      const seen = new Set<string>();
      for (let round = 0; round < 10; round++) {
        const current = manager.getState(host.code);
        expect(current.phase).toBe("auction");
        const id = current.currentFootballer?.id;
        expect(id).toBeTruthy();
        expect(seen.has(id!)).toBe(false);
        seen.add(id!);
        manager.pass(host.code, host.managerId, `pass-host-${round}`, current.roundId);
        manager.pass(host.code, guest.managerId, `pass-guest-${round}`, current.roundId);
        vi.advanceTimersByTime(2100);
      }
      expect(seen.size).toBe(10);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("never repeats a sold footballer and finalizes a round only once", () => {
    vi.useFakeTimers();
    try {
      const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
      const host = manager.create("SoldHost", "session-sold-host", "socket-sold-host", false);
      manager.updateSettings(host.code, host.managerId, { managerLimit: 2, squadSize: 6, substituteCount: 0, reauctionUnsold: false });
      const guest = manager.join(host.code, "SoldGuest", "session-sold-guest", "socket-sold-guest");
      manager.setReady(host.code, host.managerId, true);
      manager.setReady(host.code, guest.managerId, true);
      manager.start(host.code, host.managerId);

      const first = manager.getState(host.code);
      const soldId = first.currentFootballer!.id;
      manager.bid(host.code, host.managerId, 1, "request-sold-1", first.roundId);
      manager.pass(host.code, guest.managerId, "pass-sold-guest", first.roundId);
      // A late duplicate pass/callback cannot finalize the same round twice.
      manager.pass(host.code, host.managerId, "pass-sold-host-late", first.roundId);
      expect(manager.getState(host.code).phase).toBe("round_result");
      vi.advanceTimersByTime(2100);
      const next = manager.getState(host.code);
      expect(next.phase).toBe("auction");
      expect(next.currentFootballer?.id).not.toBe(soldId);
      expect(next.managers.find(item => item.id === host.managerId)?.squad.filter(entry => entry.footballer.id === soldId)).toHaveLength(1);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("immediately sells to the last remaining bidder after everyone else passes", () => {
    vi.useFakeTimers();
    try {
      const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
      const host = manager.create("EarlyHost", "session-early-host", "socket-early-host", false);
      manager.updateSettings(host.code, host.managerId, { managerLimit: 2, squadSize: 6, substituteCount: 0 });
      const guest = manager.join(host.code, "EarlyGuest", "session-early-guest", "socket-early-guest");
      manager.setReady(host.code, host.managerId, true);
      manager.setReady(host.code, guest.managerId, true);
      manager.start(host.code, host.managerId);
      const round = manager.getState(host.code, guest.managerId);
      manager.pass(host.code, host.managerId, "pass-early-host", round.roundId);
      expect(manager.getState(host.code, guest.managerId).phase).toBe("auction");
      const opening = getOpeningBid(round.settings, round.currentFootballer);
      manager.bid(host.code, guest.managerId, opening, "bid-early-guest", round.roundId);
      const result = manager.getState(host.code, guest.managerId);
      expect(result.phase).toBe("round_result");
      expect(result.lastWinner?.managerName).toBe("EarlyGuest");
      expect(result.lastWinner?.amount).toBe(opening);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("immediately sells the existing highest bid when the last challenger passes", () => {
    vi.useFakeTimers();
    try {
      const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
      const host = manager.create("LeaderHost", "session-leader-host", "socket-leader-host", false);
      manager.updateSettings(host.code, host.managerId, { managerLimit: 2, squadSize: 6, substituteCount: 0 });
      const guest = manager.join(host.code, "LeaderGuest", "session-leader-guest", "socket-leader-guest");
      manager.setReady(host.code, host.managerId, true);
      manager.setReady(host.code, guest.managerId, true);
      manager.start(host.code, host.managerId);
      const round = manager.getState(host.code, host.managerId);
      const opening = getOpeningBid(round.settings, round.currentFootballer);
      manager.bid(host.code, host.managerId, opening, "bid-existing-leader", round.roundId);
      expect(manager.getState(host.code, host.managerId).phase).toBe("auction");
      manager.pass(host.code, guest.managerId, "pass-existing-challenger", round.roundId);
      const result = manager.getState(host.code, host.managerId);
      expect(result.phase).toBe("round_result");
      expect(result.lastWinner?.managerName).toBe("LeaderHost");
      expect(result.lastWinner?.amount).toBe(opening);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("waits for an opening bid when exactly one of three managers remains, then sells immediately", () => {
    vi.useFakeTimers();
    try {
      const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
      const host = manager.create("ThreeHost", "session-three-host", "socket-three-host", false);
      manager.updateSettings(host.code, host.managerId, { managerLimit: 3, squadSize: 6, substituteCount: 0 });
      const second = manager.join(host.code, "ThreeSecond", "session-three-second", "socket-three-second");
      const third = manager.join(host.code, "ThreeThird", "session-three-third", "socket-three-third");
      for (const id of [host.managerId, second.managerId, third.managerId]) manager.setReady(host.code, id, true);
      manager.start(host.code, host.managerId);
      const round = manager.getState(host.code, third.managerId);
      manager.pass(host.code, host.managerId, "pass-three-host", round.roundId);
      manager.pass(host.code, second.managerId, "pass-three-second", round.roundId);
      expect(manager.getState(host.code, third.managerId).phase).toBe("auction");
      expect(manager.getState(host.code, third.managerId).highestBidderId).toBeNull();
      const opening = getOpeningBid(round.settings, round.currentFootballer);
      manager.bid(host.code, third.managerId, opening, "bid-three-third", round.roundId);
      expect(manager.getState(host.code, third.managerId).phase).toBe("round_result");
      expect(manager.getState(host.code, third.managerId).lastWinner?.managerName).toBe("ThreeThird");
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("keeps bidding open while another eligible challenger remains", () => {
    vi.useFakeTimers();
    try {
      const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
      const host = manager.create("OpenHost", "session-open-host", "socket-open-host", false);
      manager.updateSettings(host.code, host.managerId, { managerLimit: 3, squadSize: 6, substituteCount: 0 });
      const second = manager.join(host.code, "OpenSecond", "session-open-second", "socket-open-second");
      const third = manager.join(host.code, "OpenThird", "session-open-third", "socket-open-third");
      for (const id of [host.managerId, second.managerId, third.managerId]) manager.setReady(host.code, id, true);
      manager.start(host.code, host.managerId);
      const round = manager.getState(host.code, second.managerId);
      manager.pass(host.code, host.managerId, "pass-open-host", round.roundId);
      const opening = getOpeningBid(round.settings, round.currentFootballer);
      manager.bid(host.code, second.managerId, opening, "bid-open-second", round.roundId);
      const current = manager.getState(host.code, second.managerId);
      expect(current.phase).toBe("auction");
      expect(current.highestBidderId).toBe(second.managerId);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("marks the round skipped immediately when everyone passes without a bid", () => {
    vi.useFakeTimers();
    try {
      const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
      const host = manager.create("AllPassHost", "session-allpass-host", "socket-allpass-host", false);
      manager.updateSettings(host.code, host.managerId, { managerLimit: 2, squadSize: 6, substituteCount: 0, reauctionUnsold: false });
      const guest = manager.join(host.code, "AllPassGuest", "session-allpass-guest", "socket-allpass-guest");
      manager.setReady(host.code, host.managerId, true);
      manager.setReady(host.code, guest.managerId, true);
      manager.start(host.code, host.managerId);
      const round = manager.getState(host.code, host.managerId);
      manager.pass(host.code, host.managerId, "pass-all-host", round.roundId);
      manager.pass(host.code, guest.managerId, "pass-all-guest", round.roundId);
      const result = manager.getState(host.code, host.managerId);
      expect(result.phase).toBe("round_result");
      expect(result.lastWinner).toBeNull();
      expect(result.endsAt).toBeNull();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("reuses the same manager seat for the same reconnect session", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const host = manager.create("ReconnectHost", "session-reconnect-host", "socket-old", false);
    const joinedAgain = manager.join(host.code, "ReconnectHost", "session-reconnect-host", "socket-new");
    const state = manager.getState(host.code);
    expect(joinedAgain.managerId).toBe(host.managerId);
    expect(state.managers).toHaveLength(1);
    expect(() => manager.assertSocketOwner(host.code, host.managerId, "socket-old")).toThrow(/another tab or device/i);
    expect(() => manager.assertSocketOwner(host.code, host.managerId, "socket-new")).not.toThrow();
  });

  it("migrates host control when the active host disconnects", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const host = manager.create("HostMove", "session-move-host", "socket-move-host", false);
    const guest = manager.join(host.code, "GuestMove", "session-move-guest", "socket-move-guest");
    manager.disconnect("socket-move-host");
    const state = manager.getState(host.code);
    expect(state.hostId).toBe(guest.managerId);
    expect(state.managers.find(item => item.id === guest.managerId)?.isHost).toBe(true);
  });

  it("stores validated real-time room chat and exposes typing state", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const created = manager.create("Chatter", "session-chat", "socket-chat", false);
    manager.sendChat(created.code, created.managerId, "Hello room ⚽");
    const state = manager.getState(created.code);
    expect(state.chatMessages).toHaveLength(1);
    expect(state.chatMessages[0]?.text).toBe("Hello room ⚽");
    expect(manager.typing(created.code, created.managerId, true)).toMatchObject({ managerName: "Chatter", isTyping: true });
    expect(() => manager.sendChat(created.code, created.managerId, "   ")).toThrow();
  });

  it("lets a manager return to the menu from a lobby and transfers host ownership", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const created = manager.create("Host", "session-host", "socket-host", false);
    const joined = manager.join(created.code, "Guest", "session-guest", "socket-guest");
    manager.leave(created.code, created.managerId);
    const state = manager.getState(created.code);
    expect(state.managers).toHaveLength(1);
    expect(state.hostId).toBe(joined.managerId);
    expect(state.managers[0]?.isHost).toBe(true);

    manager.leave(created.code, joined.managerId);
    expect(() => manager.getState(created.code)).toThrow(/room not found/i);
  });

  it("allows the human manager to quit and destroy a Solo Practice room", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const created = manager.create("Quitter", "session-quit", "socket-quit", true);
    manager.quitSolo(created.code, created.managerId);
    expect(() => manager.getState(created.code)).toThrow(/room not found/i);
  });

  it("lists open and password rooms without exposing passwords", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const open = manager.create("Open Host", "session-open", "socket-open", false, "public");
    const locked = manager.create("Locked Host", "session-lock", "socket-lock", false, "password", "secret-26");

    const allRooms = manager.listRooms();
    expect(allRooms.map(room => room.code)).toEqual(expect.arrayContaining([open.code, locked.code]));
    expect(allRooms.find(room => room.code === open.code)).toMatchObject({ access: "public", hasPassword: false, managerCount: 1 });
    expect(allRooms.find(room => room.code === locked.code)).toMatchObject({ access: "password", hasPassword: true, managerCount: 1 });
    expect(JSON.stringify(manager.getState(locked.code))).not.toContain("secret-26");
    expect(manager.listRooms({ access: "password" })).toHaveLength(1);
  });

  it("requires the correct password and blocks joining a full room", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const created = manager.create("Host", "session-host-lock", "socket-host-lock", false, "password", "goal-2026");
    manager.updateSettings(created.code, created.managerId, { managerLimit: 2 });

    expect(() => manager.join(created.code, "Wrong", "session-wrong", "socket-wrong", "bad-pass")).toThrow(/incorrect room password/i);
    manager.join(created.code, "Guest", "session-good", "socket-good", "goal-2026");
    expect(manager.listRooms().find(room => room.code === created.code)).toMatchObject({ managerCount: 2, openSlots: 0 });
    expect(() => manager.join(created.code, "Late", "session-late", "socket-late", "goal-2026")).toThrow(/room full/i);
  });

});

describe("v1.6 player pools and private budgets", () => {
  it("builds current-only, icon-only and generations pools from the server", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const created = manager.create("PoolHost", "session-pool-host", "socket-pool-host", false);

    let state = manager.getState(created.code, created.managerId);
    let selected = state.selectedFootballerIds.map(id => FOOTBALLERS.find(player => player.id === id)!);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every(player => (player.playerType ?? "CURRENT") === "CURRENT")).toBe(true);

    manager.updateSettings(created.code, created.managerId, { playerPoolMode: "icons" });
    state = manager.getState(created.code, created.managerId);
    selected = state.selectedFootballerIds.map(id => FOOTBALLERS.find(player => player.id === id)!);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every(player => player.playerType === "ICON")).toBe(true);

    manager.updateSettings(created.code, created.managerId, { playerPoolMode: "mixed", iconFrequency: "normal" });
    state = manager.getState(created.code, created.managerId);
    selected = state.selectedFootballerIds.map(id => FOOTBALLERS.find(player => player.id === id)!);
    expect(selected.some(player => player.playerType === "ICON")).toBe(true);
    expect(selected.some(player => (player.playerType ?? "CURRENT") === "CURRENT")).toBe(true);
  });

  it("custom mode uses only the host-selected footballers and rejects duplicate canonical identities", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const created = manager.create("CustomHost", "session-custom-host", "socket-custom-host", false);
    manager.updateSettings(created.code, created.managerId, { playerPoolMode: "custom" });
    const current = FOOTBALLERS.find(player => (player.playerType ?? "CURRENT") === "CURRENT")!;
    const icon = FOOTBALLERS.find(player => player.playerType === "ICON")!;
    manager.updatePlayerPool(created.code, created.managerId, [current.id, icon.id]);
    const state = manager.getState(created.code, created.managerId);
    expect(state.selectedFootballerIds).toEqual([current.id, icon.id]);
    expect(state.poolValidation.selectedCurrent).toBe(1);
    expect(state.poolValidation.selectedIcons).toBe(1);
  });

  it("never exposes an opponent's exact budget in lobby or active auction state", () => {
    vi.useFakeTimers();
    try {
      const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
      const host = manager.create("PrivateHost", "session-private-host", "socket-private-host", false);
      manager.updateSettings(host.code, host.managerId, { managerLimit: 2, squadSize: 6, substituteCount: 0 });
      const guest = manager.join(host.code, "PrivateGuest", "session-private-guest", "socket-private-guest");

      const hostLobby = manager.getState(host.code, host.managerId);
      const guestLobby = manager.getState(host.code, guest.managerId);
      expect(hostLobby.managers.find(item => item.id === host.managerId)?.budget).toBe(hostLobby.settings.startingBudget);
      expect(hostLobby.managers.find(item => item.id === guest.managerId)?.budget).toBeNull();
      expect(guestLobby.managers.find(item => item.id === guest.managerId)?.budget).toBe(guestLobby.settings.startingBudget);
      expect(guestLobby.managers.find(item => item.id === host.managerId)?.budget).toBeNull();

      manager.setReady(host.code, host.managerId, true);
      manager.setReady(host.code, guest.managerId, true);
      manager.start(host.code, host.managerId);
      const hostAuction = manager.getState(host.code, host.managerId);
      expect(hostAuction.phase).toBe("auction");
      expect(hostAuction.managers.find(item => item.id === guest.managerId)?.budget).toBeNull();
      expect(hostAuction.managers.find(item => item.id === host.managerId)?.budget).toBe(hostAuction.settings.startingBudget);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("filters public room discovery by player-pool mode", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const current = manager.create("CurrentHost", "session-current-directory", "socket-current-directory", false);
    const icons = manager.create("IconHost", "session-icon-directory", "socket-icon-directory", false);
    manager.updateSettings(icons.code, icons.managerId, { playerPoolMode: "icons" });
    expect(manager.listRooms({ playerPoolMode: "current" }).map(room => room.code)).toContain(current.code);
    expect(manager.listRooms({ playerPoolMode: "current" }).map(room => room.code)).not.toContain(icons.code);
    expect(manager.listRooms({ playerPoolMode: "icons" }).map(room => room.code)).toContain(icons.code);
  });

  it("auto-builds extra auction variety while keeping the selected pool unique", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const host = manager.create("VarietyHost", "session-variety-host", "socket-variety-host", false);
    manager.updateSettings(host.code, host.managerId, { managerLimit: 3, squadSize: 11, substituteCount: 5, playerPoolMode: "mixed" });
    const state = manager.getState(host.code, host.managerId);
    expect(state.poolValidation.required).toBe(48);
    expect(state.poolValidation.recommended).toBeGreaterThan(48);
    expect(state.poolValidation.selected).toBe(state.poolValidation.recommended);
    expect(new Set(state.selectedFootballerIds).size).toBe(state.selectedFootballerIds.length);
    expect(state.poolSelectionValid).toBe(true);
  });
});

describe("v1.8 canonical eligible pools, manual selection and pool sizes", () => {
  it("makes the full CURRENT, ICON and MIXED databases eligible in ALL mode", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const created = manager.create("AllPoolHost", "session-all-pool", "socket-all-pool", false);

    manager.updateSettings(created.code, created.managerId, { playerPoolMode: "current", auctionPoolSizeMode: "all" });
    let state = manager.getState(created.code, created.managerId);
    const currentCount = FOOTBALLERS.filter(player => (player.playerType ?? "CURRENT") === "CURRENT").length;
    expect(state.poolValidation.eligibleAvailable).toBe(currentCount);
    expect(state.selectedFootballerIds).toHaveLength(currentCount);

    manager.updateSettings(created.code, created.managerId, { playerPoolMode: "icons", auctionPoolSizeMode: "all" });
    state = manager.getState(created.code, created.managerId);
    const iconCount = FOOTBALLERS.filter(player => player.playerType === "ICON").length;
    expect(state.poolValidation.eligibleAvailable).toBe(iconCount);
    expect(state.selectedFootballerIds).toHaveLength(iconCount);

    manager.updateSettings(created.code, created.managerId, { playerPoolMode: "mixed", auctionPoolSizeMode: "all" });
    state = manager.getState(created.code, created.managerId);
    expect(state.poolValidation.eligibleAvailable).toBe(FOOTBALLERS.length);
    expect(state.selectedFootballerIds).toHaveLength(FOOTBALLERS.length);
    expect(new Set(state.selectedFootballerIds).size).toBe(FOOTBALLERS.length);
  });

  it("keeps an exact manual star-and-icon selection as the only CUSTOM eligibility set", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const created = manager.create("NamedCustomHost", "session-named-custom", "socket-named-custom", false);
    manager.updateSettings(created.code, created.managerId, { playerPoolMode: "custom", auctionPoolSizeMode: "all" });
    const canonicalIds = ["lionel-messi", "cristiano-ronaldo", "kylian-mbappe", "neymar", "ruud-gullit", "ronaldinho", "paolo-maldini", "gianluigi-buffon"];
    const ids = canonicalIds.map(canonicalId => {
      const player = FOOTBALLERS.find(item => item.canonicalId === canonicalId);
      expect(player, `Missing ${canonicalId}`).toBeTruthy();
      return player!.id;
    });
    manager.updatePlayerPool(created.code, created.managerId, ids);
    const state = manager.getState(created.code, created.managerId);
    expect(state.customPlayerIds).toEqual(ids);
    expect(new Set(state.selectedFootballerIds)).toEqual(new Set(ids));
    expect(state.poolValidation.eligibleAvailable).toBe(ids.length);
  });

  it("keeps the host's custom eligible IDs unchanged when another manager joins", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const created = manager.create("ManualHost", "session-manual-host", "socket-manual-host", false);
    manager.updateSettings(created.code, created.managerId, { managerLimit: 2, squadSize: 6, substituteCount: 0, playerPoolMode: "custom" });
    const selected = [
      ...FOOTBALLERS.filter(player => player.position === "GK").slice(0, 2),
      ...FOOTBALLERS.filter(player => player.position === "DEF").slice(0, 4),
      ...FOOTBALLERS.filter(player => player.position === "MID").slice(0, 4),
      ...FOOTBALLERS.filter(player => player.position === "FWD").slice(0, 2)
    ];
    const ids = selected.map(player => player.id);
    manager.updatePlayerPool(created.code, created.managerId, ids);
    expect(manager.getState(created.code, created.managerId).customPlayerIds).toEqual(ids);

    manager.join(created.code, "ManualGuest", "session-manual-guest", "socket-manual-guest");
    const afterJoin = manager.getState(created.code, created.managerId);
    expect(afterJoin.customPlayerIds).toEqual(ids);
    expect(new Set(afterJoin.selectedFootballerIds)).toEqual(new Set(ids));
  });

  it("starts CUSTOM mode with the exact validated manual IDs instead of regenerating them", () => {
    vi.useFakeTimers();
    try {
      const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
      const created = manager.create("ExactHost", "session-exact-host", "socket-exact-host", false);
      manager.updateSettings(created.code, created.managerId, { managerLimit: 2, squadSize: 6, substituteCount: 0, playerPoolMode: "custom", auctionPoolSizeMode: "all" });
      const manual = [
        ...FOOTBALLERS.filter(player => player.position === "GK").slice(0, 2),
        ...FOOTBALLERS.filter(player => player.position === "DEF").slice(0, 4),
        ...FOOTBALLERS.filter(player => player.position === "MID").slice(0, 4),
        ...FOOTBALLERS.filter(player => player.position === "FWD").slice(0, 2)
      ];
      const manualIds = manual.map(player => player.id);
      manager.updatePlayerPool(created.code, created.managerId, manualIds);
      const guest = manager.join(created.code, "ExactGuest", "session-exact-guest", "socket-exact-guest");
      manager.setReady(created.code, created.managerId, true);
      manager.setReady(created.code, guest.managerId, true);
      manager.start(created.code, created.managerId);
      const state = manager.getState(created.code, created.managerId);
      expect(state.totalRounds).toBe(manualIds.length);
      expect(new Set(state.selectedFootballerIds)).toEqual(new Set(manualIds));
      expect(state.currentFootballer && manualIds.includes(state.currentFootballer.id)).toBe(true);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("supports QUICK, STANDARD, LARGE, ALL and custom-count queue sizes without going below the squad requirement", () => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const created = manager.create("SizeHost", "session-size-host-v18", "socket-size-host-v18", false);
    manager.updateSettings(created.code, created.managerId, { managerLimit: 3, squadSize: 11, substituteCount: 5, playerPoolMode: "mixed" });
    const required = 48;

    manager.updateSettings(created.code, created.managerId, { auctionPoolSizeMode: "quick" });
    const quick = manager.getState(created.code, created.managerId).poolValidation.selected;
    manager.updateSettings(created.code, created.managerId, { auctionPoolSizeMode: "standard" });
    const standard = manager.getState(created.code, created.managerId).poolValidation.selected;
    manager.updateSettings(created.code, created.managerId, { auctionPoolSizeMode: "large" });
    const large = manager.getState(created.code, created.managerId).poolValidation.selected;
    manager.updateSettings(created.code, created.managerId, { auctionPoolSizeMode: "all" });
    const all = manager.getState(created.code, created.managerId).poolValidation.selected;
    manager.updateSettings(created.code, created.managerId, { auctionPoolSizeMode: "custom", auctionPoolCustomCount: 60 });
    const custom = manager.getState(created.code, created.managerId).poolValidation.selected;

    expect(quick).toBeGreaterThanOrEqual(required);
    expect(standard).toBeGreaterThanOrEqual(quick);
    expect(large).toBeGreaterThanOrEqual(standard);
    expect(all).toBe(FOOTBALLERS.length);
    expect(custom).toBe(60);
  });
});

describe("v1.9 starter-based I'M DONE completion", () => {
  type MutableManager = {
    id: string;
    auctionComplete: boolean;
    squad: Array<{ footballer: (typeof FOOTBALLERS)[number]; price: number; round: number }>;
  };
  type MutableRoom = { managers: MutableManager[] };
  type MutableRoomManager = { rooms: Map<string, MutableRoom> };

  const squadWithValidStarters = (starterCount: number, extraSubs = 0) => {
    const goalkeeper = FOOTBALLERS.find(player => player.position === "GK")!;
    const outfield = FOOTBALLERS.filter(player => player.position !== "GK").slice(0, starterCount - 1 + extraSubs);
    return [goalkeeper, ...outfield].map((footballer, index) => ({ footballer, price: footballer.basePrice, round: index + 1 }));
  };

  const squadWithoutGoalkeeper = (count: number) => FOOTBALLERS
    .filter(player => player.position !== "GK")
    .slice(0, count)
    .map((footballer, index) => ({ footballer, price: footballer.basePrice, round: index + 1 }));

  const startTwoManagerRoom = (starterCount = 11, substituteCount = 6) => {
    const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
    const host = manager.create("DoneHost", `session-done-host-${starterCount}-${substituteCount}`, `socket-done-host-${starterCount}-${substituteCount}`, false);
    manager.updateSettings(host.code, host.managerId, { managerLimit: 2, squadSize: starterCount as 6 | 7 | 8 | 9 | 10 | 11, substituteCount: substituteCount as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 });
    const guest = manager.join(host.code, "DoneGuest", `session-done-guest-${starterCount}-${substituteCount}`, `socket-done-guest-${starterCount}-${substituteCount}`);
    manager.setReady(host.code, host.managerId, true);
    manager.setReady(host.code, guest.managerId, true);
    manager.start(host.code, host.managerId);
    return { manager, host, guest, room: (manager as unknown as MutableRoomManager).rooms.get(host.code)! };
  };

  it("allows I'M DONE with all required starters and zero substitutes", () => {
    vi.useFakeTimers();
    try {
      const { manager, host, room } = startTwoManagerRoom(11, 6);
      room.managers.find(item => item.id === host.managerId)!.squad = squadWithValidStarters(11, 0);
      expect(() => manager.completeAuction(host.code, host.managerId)).not.toThrow();
      expect(manager.getState(host.code, host.managerId).managers.find(item => item.id === host.managerId)?.auctionComplete).toBe(true);
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });

  it("allows I'M DONE with a partially filled optional bench", () => {
    vi.useFakeTimers();
    try {
      const { manager, host, room } = startTwoManagerRoom(11, 6);
      room.managers.find(item => item.id === host.managerId)!.squad = squadWithValidStarters(11, 3);
      expect(() => manager.completeAuction(host.code, host.managerId)).not.toThrow();
      expect(manager.getState(host.code, host.managerId).managers.find(item => item.id === host.managerId)?.auctionComplete).toBe(true);
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });

  it("allows I'M DONE with a full bench and prevents purchases beyond capacity", () => {
    vi.useFakeTimers();
    try {
      const { manager, host, room } = startTwoManagerRoom(11, 6);
      room.managers.find(item => item.id === host.managerId)!.squad = squadWithValidStarters(11, 6);
      expect(() => manager.completeAuction(host.code, host.managerId)).not.toThrow();
      const state = manager.getState(host.code, host.managerId);
      expect(state.managers.find(item => item.id === host.managerId)?.auctionComplete).toBe(true);
      expect(() => manager.bid(host.code, host.managerId, 1, "done-full-bid", state.roundId)).toThrow(/complete|finished bidding/i);
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });

  it("rejects I'M DONE when total ownership is large but the starting lineup is invalid", () => {
    vi.useFakeTimers();
    try {
      const { manager, host, room } = startTwoManagerRoom(11, 6);
      room.managers.find(item => item.id === host.managerId)!.squad = squadWithoutGoalkeeper(16);
      expect(() => manager.completeAuction(host.code, host.managerId)).toThrow(/still need 1 starting player.*goalkeeper/i);
      expect(manager.getState(host.code, host.managerId).managers.find(item => item.id === host.managerId)?.auctionComplete).toBe(false);
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });

  it("uses the configured smaller starter count instead of hard-coding eleven", () => {
    vi.useFakeTimers();
    try {
      const { manager, host, room } = startTwoManagerRoom(8, 4);
      room.managers.find(item => item.id === host.managerId)!.squad = squadWithValidStarters(8, 0);
      expect(() => manager.completeAuction(host.code, host.managerId)).not.toThrow();
      expect(manager.getState(host.code, host.managerId).managers.find(item => item.id === host.managerId)?.auctionComplete).toBe(true);
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });

  it("keeps DONE persistent across rounds and reconnects while PASS resets", () => {
    vi.useFakeTimers();
    try {
      const { manager, host, guest, room } = startTwoManagerRoom(6, 3);
      room.managers.find(item => item.id === host.managerId)!.squad = squadWithValidStarters(6, 0);
      manager.completeAuction(host.code, host.managerId);
      let state = manager.getState(host.code, host.managerId);
      manager.pass(host.code, guest.managerId, "guest-pass-after-host-done", state.roundId);
      expect(manager.getState(host.code, host.managerId).phase).toBe("round_result");
      vi.advanceTimersByTime(2100);
      state = manager.getState(host.code, host.managerId);
      expect(state.phase).toBe("auction");
      expect(state.managers.find(item => item.id === host.managerId)?.auctionComplete).toBe(true);
      expect(state.passedManagerIds).not.toContain(host.managerId);
      manager.resume(host.code, "session-done-host-6-3", "socket-done-host-reconnected");
      expect(manager.getState(host.code, host.managerId).managers.find(item => item.id === host.managerId)?.auctionComplete).toBe(true);
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });

  it("rejects crafted bids and passes from a DONE manager", () => {
    vi.useFakeTimers();
    try {
      const { manager, host, room } = startTwoManagerRoom(6, 3);
      room.managers.find(item => item.id === host.managerId)!.squad = squadWithValidStarters(6, 0);
      manager.completeAuction(host.code, host.managerId);
      const state = manager.getState(host.code, host.managerId);
      expect(() => manager.bid(host.code, host.managerId, 1, "crafted-done-bid", state.roundId)).toThrow(/complete|finished bidding/i);
      expect(() => manager.pass(host.code, host.managerId, "crafted-done-pass", state.roundId)).toThrow(/finished bidding/i);
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });

  it("does not allow the unresolved highest bidder to press I'M DONE", () => {
    vi.useFakeTimers();
    try {
      const { manager, host, room } = startTwoManagerRoom(6, 3);
      room.managers.find(item => item.id === host.managerId)!.squad = squadWithValidStarters(6, 0);
      const state = manager.getState(host.code, host.managerId);
      manager.bid(host.code, host.managerId, 1, "leader-before-done", state.roundId);
      expect(() => manager.completeAuction(host.code, host.managerId)).toThrow(/highest bidder/i);
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });

  it("moves to formation exactly once when the last manager declares DONE", () => {
    vi.useFakeTimers();
    try {
      const { manager, host, guest, room } = startTwoManagerRoom(6, 3);
      room.managers.find(item => item.id === host.managerId)!.squad = squadWithValidStarters(6, 0);
      room.managers.find(item => item.id === guest.managerId)!.squad = squadWithValidStarters(6, 0);
      const formationSpy = vi.spyOn(manager as unknown as { beginFormation: (room: unknown) => void }, "beginFormation");
      manager.completeAuction(host.code, host.managerId);
      expect(manager.getState(host.code, host.managerId).phase).toBe("auction");
      manager.completeAuction(host.code, guest.managerId);
      expect(manager.getState(host.code, host.managerId).phase).toBe("formation");
      expect(formationSpy).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(30000);
      expect(formationSpy).toHaveBeenCalledTimes(1);
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });

  it("DONE managers are excluded from last-bidder completion logic", () => {
    vi.useFakeTimers();
    try {
      const manager = new RoomManager(() => undefined, () => undefined, () => undefined);
      const host = manager.create("DoneA", "session-done-a", "socket-done-a", false);
      manager.updateSettings(host.code, host.managerId, { managerLimit: 3, squadSize: 6, substituteCount: 3 });
      const b = manager.join(host.code, "DoneB", "session-done-b", "socket-done-b");
      const c = manager.join(host.code, "DoneC", "session-done-c", "socket-done-c");
      [host.managerId, b.managerId, c.managerId].forEach(id => manager.setReady(host.code, id, true));
      manager.start(host.code, host.managerId);
      const room = (manager as unknown as MutableRoomManager).rooms.get(host.code)!;
      room.managers.find(item => item.id === host.managerId)!.squad = squadWithValidStarters(6, 0);
      manager.completeAuction(host.code, host.managerId);
      let state = manager.getState(host.code, c.managerId);
      manager.bid(host.code, c.managerId, 1, "c-leads-with-a-done", state.roundId);
      expect(manager.getState(host.code, c.managerId).phase).toBe("auction");
      manager.pass(host.code, b.managerId, "b-passes-with-a-done", state.roundId);
      state = manager.getState(host.code, c.managerId);
      expect(state.phase).toBe("round_result");
      expect(state.lastWinner?.managerName).toBe("DoneC");
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });
});
