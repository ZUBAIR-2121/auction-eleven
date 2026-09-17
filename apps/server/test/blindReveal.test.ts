import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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

describe("Blind reveal asset caching (regression: a transient failure must not be cached forever)", () => {
  const FAKE_PHOTO = {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test_Player.jpg/720px-Test_Player.jpg",
    originalUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Test_Player.jpg",
    descriptionUrl: "https://commons.wikimedia.org/wiki/File:Test_Player.jpg",
    credit: "Test",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    source: "Wikimedia Commons" as const
  };
  const PLAYER = { id: "p1", canonicalId: "p1", catalogId: "p1", name: "Test Player" } as unknown as import("@auction-eleven/shared").Footballer;

  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.doUnmock("../src/photoResolver.js");
  });

  it("retries and recovers after a transient fetch failure instead of caching the fallback forever", async () => {
    vi.doMock("../src/photoResolver.js", () => ({ getFootballerPhoto: vi.fn().mockResolvedValue(FAKE_PHOTO) }));
    let attempt = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) return { ok: false, status: 503, headers: new Headers() } as Response;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/jpeg", "content-length": "9" }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const { renderBlindRevealStage } = await import("../src/blindReveal.js");

    const first = await renderBlindRevealStage(PLAYER, 0);
    expect(first.contentType).toBe("image/svg+xml");

    const second = await renderBlindRevealStage(PLAYER, 0);
    expect(second.contentType).toBe("image/jpeg");
    expect(second.buffer.length).toBe(9);
    expect(attempt).toBe(2);
  });

  it("does cache a genuinely successful fetch so it isn't re-requested on every stage read", async () => {
    vi.doMock("../src/photoResolver.js", () => ({ getFootballerPhoto: vi.fn().mockResolvedValue(FAKE_PHOTO) }));
    let attempt = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      attempt += 1;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/jpeg", "content-length": "4" }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const { renderBlindRevealStage } = await import("../src/blindReveal.js");
    await renderBlindRevealStage(PLAYER, 1);
    await renderBlindRevealStage(PLAYER, 1);
    expect(attempt).toBe(1);
  });
});
