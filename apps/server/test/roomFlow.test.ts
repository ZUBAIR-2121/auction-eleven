import { describe, expect, it } from "vitest";
import type { RoomState } from "@auction-eleven/shared";
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
    expect(latest?.phase).toBe("formation");
    const host = latest!.managers.find(participant => participant.isHost)!;
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
