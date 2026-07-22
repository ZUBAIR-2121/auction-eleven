import { describe, expect, it } from "vitest";
import { FOOTBALLERS } from "../src/footballers.js";
import { DEFAULT_SETTINGS } from "../src/gameEngine.js";

const positions = ["GK", "DEF", "MID", "FWD"] as const;

describe("room footballer catalogue", () => {
  it("contains 24 selectable real footballers in every position", () => {
    for (const position of positions) {
      const players = FOOTBALLERS.filter(player => player.position === position);
      expect(players).toHaveLength(24);
      expect(players.every(player => player.isRealPlayer)).toBe(true);
      expect(new Set(players.map(player => player.id)).size).toBe(24);
    }
  });

  it("defaults to 17 selected players per position", () => {
    expect(DEFAULT_SETTINGS.poolTargets).toEqual({ GK: 17, DEF: 17, MID: 17, FWD: 17 });
  });
});
