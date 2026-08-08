import { describe, expect, it } from "vitest";
import { FOOTBALLERS } from "../src/footballers.js";
import { DEFAULT_SETTINGS } from "../src/gameEngine.js";

const positions = ["GK", "DEF", "MID", "FWD"] as const;

describe("room footballer catalogue", () => {
  it("contains a healthy selectable real-player catalogue in every broad position", () => {
    for (const position of positions) {
      const players = FOOTBALLERS.filter(player => player.position === position);
      expect(players.length).toBeGreaterThanOrEqual(24);
      expect(players.every(player => player.isRealPlayer)).toBe(true);
      expect(new Set(players.map(player => player.id)).size).toBe(players.length);
      expect(new Set(players.map(player => player.canonicalId ?? player.catalogId ?? player.id)).size).toBe(players.length);
    }
  });

  it("uses the expanded 24-player broad-position defaults", () => {
    expect(DEFAULT_SETTINGS.poolTargets).toEqual({ GK: 24, DEF: 24, MID: 24, FWD: 24 });
  });
});
