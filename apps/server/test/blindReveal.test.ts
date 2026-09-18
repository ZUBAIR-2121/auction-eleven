import { describe, expect, it, vi } from "vitest";
import { BLIND_REVEAL_STAGE_COUNT, getBlindRevealStage } from "@auction-eleven/shared";
import { buildWikimediaThumbnailUrl, renderBlindRevealStage } from "../src/blindReveal.js";
import { FOOTBALLERS } from "../src/footballers.js";
import { getLocalFootballerImageCoverage } from "../src/localPlayerImages.js";

describe("Blind reveal timing and stage assets", () => {
  it("derives deterministic stages from authoritative timestamps", () => {
    const startedAt = 1_000_000;
    const endsAt = startedAt + 20_000;
    const stage = (progress: number) => getBlindRevealStage({
      now: startedAt + 20_000 * progress,
      startedAt,
      endsAt,
      stageCount: BLIND_REVEAL_STAGE_COUNT,
      difficulty: "normal"
    });

    expect(stage(0)).toBe(0);
    expect(stage(.21)).toBe(1);
    expect(stage(.41)).toBe(2);
    expect(stage(.60)).toBe(3);
    expect(stage(.80)).toBe(4);
    expect(getBlindRevealStage({ now: endsAt, startedAt, endsAt, difficulty: "normal" })).toBe(5);
  });

  it("builds protected lower-resolution Wikimedia thumbnails for legacy callers", () => {
    const photo = {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test_Player.jpg/720px-Test_Player.jpg",
      originalUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Test_Player.jpg"
    };
    expect(buildWikimediaThumbnailUrl(photo, 24)).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test_Player.jpg/24px-Test_Player.jpg");

    const originalOnly = {
      url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Test_Player.jpg",
      originalUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Test_Player.jpg"
    };
    expect(buildWikimediaThumbnailUrl(originalOnly, 42)).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test_Player.jpg/42px-Test_Player.jpg");
  });

  it("uses Wikimedia's PNG thumbnail form for SVG originals", () => {
    const photo = {
      url: "https://upload.wikimedia.org/wikipedia/commons/1/12/Player.svg",
      originalUrl: "https://upload.wikimedia.org/wikipedia/commons/1/12/Player.svg"
    };
    expect(buildWikimediaThumbnailUrl(photo, 76)).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Player.svg/76px-Player.svg.png");
  });
});

describe("Blind reveal local player-image pack", () => {
  it("contains a local real-player image for every footballer in the game", async () => {
    const coverage = await getLocalFootballerImageCoverage(FOOTBALLERS);
    expect(coverage.total).toBe(186);
    expect(coverage.available).toBe(186);
    expect(coverage.missing).toEqual([]);
  });

  it("returns the selected player's local image without any network fetch", async () => {
    const player = FOOTBALLERS.find(item => item.canonicalId === "lionel-messi")!;
    const fetchSpy = vi.spyOn(global, "fetch");
    const early = await renderBlindRevealStage(player, 0);
    const clear = await renderBlindRevealStage(player, 5);

    expect(early.contentType).toMatch(/^image\//);
    expect(clear.contentType).toBe(early.contentType);
    expect(clear.buffer.equals(early.buffer)).toBe(true);
    expect(clear.buffer.length).toBeGreaterThan(10_000);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
