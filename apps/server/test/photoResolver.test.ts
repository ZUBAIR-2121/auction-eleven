import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Footballer } from "@auction-eleven/shared";

const PLAYER = { id: "p1", name: "Test Player", photoSearchName: "Test Player" } as unknown as Footballer;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body
  } as unknown as Response;
}

describe("photoResolver Wikidata + Wikipedia-summary fallback", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("resolves normally via Wikidata when a P18 image claim exists", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("wbsearchentities")) {
        return jsonResponse({ search: [{ id: "Q1", label: "Test Player", description: "a footballer" }] });
      }
      if (url.includes("wbgetentities")) {
        return jsonResponse({ entities: { Q1: { claims: { P18: [{ mainsnak: { datavalue: { value: "Test_Player.jpg" } } }] } } } });
      }
      if (url.includes("commons.wikimedia.org")) {
        return jsonResponse({
          query: {
            pages: {
              "1": {
                imageinfo: [{
                  url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Test_Player.jpg",
                  thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test_Player.jpg/720px-Test_Player.jpg",
                  descriptionurl: "https://commons.wikimedia.org/wiki/File:Test_Player.jpg",
                  extmetadata: {}
                }]
              }
            }
          }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { getFootballerPhoto } = await import("../src/photoResolver.js");
    const photo = await getFootballerPhoto(PLAYER);
    expect(photo.url).toContain("720px-Test_Player.jpg");
    expect(photo.source).toBe("Wikimedia Commons");
  });

  it("falls back to the Wikipedia summary API when Wikidata has no P18 image", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("wbsearchentities")) {
        return jsonResponse({ search: [{ id: "Q1", label: "Test Player", description: "a footballer" }] });
      }
      if (url.includes("wbgetentities")) {
        // No P18 claim at all.
        return jsonResponse({ entities: { Q1: { claims: {} } } });
      }
      if (url.includes("en.wikipedia.org/api/rest_v1/page/summary")) {
        return jsonResponse({
          title: "Test Player",
          description: "German footballer",
          extract: "Test Player is a footballer who plays as a defender.",
          thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test_Player.jpg/320px-Test_Player.jpg" },
          originalimage: { source: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Test_Player.jpg" },
          content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Test_Player" } }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { getFootballerPhoto } = await import("../src/photoResolver.js");
    const photo = await getFootballerPhoto(PLAYER);
    expect(photo.url).toContain("320px-Test_Player.jpg");
    expect(photo.originalUrl).toContain("Test_Player.jpg");
    expect(photo.descriptionUrl).toBe("https://en.wikipedia.org/wiki/Test_Player");
  });

  it("rejects a Wikipedia summary that clearly isn't a footballer, and surfaces the original Wikidata error", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("wbsearchentities")) return jsonResponse({ search: [] });
      if (url.includes("en.wikipedia.org/api/rest_v1/page/summary")) {
        return jsonResponse({
          title: "Test Player",
          description: "a jazz musician",
          extract: "Test Player is a musician known for saxophone.",
          thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test_Player.jpg/320px-Test_Player.jpg" }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { getFootballerPhoto } = await import("../src/photoResolver.js");
    await expect(getFootballerPhoto(PLAYER)).rejects.toThrow(/No Wikimedia footballer record found/);
  });

  it("surfaces the original Wikidata error when the Wikipedia summary fetch itself fails", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("wbsearchentities")) {
        return jsonResponse({ search: [{ id: "Q1", label: "Test Player", description: "a footballer" }] });
      }
      if (url.includes("wbgetentities")) return jsonResponse({ entities: { Q1: { claims: {} } } });
      if (url.includes("en.wikipedia.org/api/rest_v1/page/summary")) return jsonResponse({}, false, 404);
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { getFootballerPhoto } = await import("../src/photoResolver.js");
    await expect(getFootballerPhoto(PLAYER)).rejects.toThrow(/No Wikimedia Commons portrait is attached/);
  });
});
