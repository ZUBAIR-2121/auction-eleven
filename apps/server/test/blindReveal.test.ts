import { describe, expect, it } from "vitest";
import { BLIND_REVEAL_STAGE_COUNT, getBlindRevealStage } from "@auction-eleven/shared";
import { buildWikimediaThumbnailUrl } from "../src/blindReveal.js";

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

  it("builds protected lower-resolution Wikimedia thumbnails from both thumb and original URLs", () => {
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
