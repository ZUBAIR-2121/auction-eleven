import type { Footballer, FootballerPhoto } from "@auction-eleven/shared";
import { getFootballerPhoto } from "./photoResolver.js";

export interface BlindRevealAsset {
  buffer: Buffer;
  contentType: string;
}

const assetCache = new Map<string, Promise<BlindRevealAsset>>();

function identity(player: Footballer): string {
  return player.canonicalId ?? player.catalogId ?? player.id;
}

/**
 * Builds a Wikimedia thumbnail URL without relying on the exact thumb URL
 * shape returned by the API. This fixes early stages falling back to the same
 * generic silhouette when a photo URL was an original file URL or had a
 * slightly different thumbnail path.
 */
export function buildWikimediaThumbnailUrl(photo: Pick<FootballerPhoto, "url" | "originalUrl">, width: number): string | null {
  const safeWidth = Math.max(8, Math.min(720, Math.round(width)));

  try {
    const existing = new URL(photo.url);
    if (existing.hostname === "upload.wikimedia.org" && existing.pathname.includes("/thumb/")) {
      const parts = existing.pathname.split("/");
      const last = parts.at(-1) ?? "";
      if (/^\d+px-/i.test(last)) {
        parts[parts.length - 1] = last.replace(/^\d+px-/i, `${safeWidth}px-`);
        existing.pathname = parts.join("/");
        return existing.toString();
      }
    }
  } catch { /* fall through to original-url construction */ }

  try {
    const original = new URL(photo.originalUrl);
    if (original.hostname !== "upload.wikimedia.org") return null;
    const marker = "/wikipedia/commons/";
    const index = original.pathname.indexOf(marker);
    if (index < 0) return null;
    const rest = original.pathname.slice(index + marker.length);
    const filename = rest.split("/").at(-1);
    if (!filename) return null;
    const renderedSuffix = /\.svg$/i.test(filename) ? ".png" : "";
    original.pathname = `${marker}thumb/${rest}/${safeWidth}px-${filename}${renderedSuffix}`;
    original.search = "";
    original.hash = "";
    return original.toString();
  } catch {
    return null;
  }
}

function fallbackSvg(stage: number): BlindRevealAsset {
  const safeStage = Math.max(0, Math.min(5, Math.round(stage)));
  const radius = [34, 28, 21, 14, 7, 0][safeStage] ?? 28;
  const opacity = [.98, .92, .82, .68, .48, .18][safeStage] ?? .9;
  const svg = `<svg width="420" height="520" viewBox="0 0 420 520" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#06110b"/><stop offset="1" stop-color="#143521"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="${radius}"/></filter></defs><rect width="420" height="520" rx="28" fill="url(#g)"/><g filter="url(#b)" opacity="${opacity}"><circle cx="210" cy="180" r="78" fill="#315a42"/><path d="M78 482c16-124 90-184 132-184s116 60 132 184" fill="#315a42"/></g><text x="210" y="500" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" fill="#8cff54">MYSTERY PLAYER</text></svg>`;
  return { buffer: Buffer.from(svg), contentType: "image/svg+xml" };
}

/**
 * Returns only the raster resolution legally available for the requested
 * reveal stage. The clear source URL is never sent to the browser before the
 * server authorizes stage 5.
 */
export async function renderBlindRevealStage(player: Footballer, stageInput: number): Promise<BlindRevealAsset> {
  const stage = Math.max(0, Math.min(5, Math.round(stageInput)));
  const key = `${identity(player)}:${stage}`;
  const cached = assetCache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    // Only a genuinely deterministic outcome (no recognizable source URL for
    // this photo at all) is safe to cache long-term. A timeout, a slow
    // on-demand Wikimedia thumbnail render, a bad HTTP status, or an
    // oversized response are transient — caching those forever would mean a
    // single hiccup permanently shows the silhouette for that player/stage,
    // with no way to recover until the server restarts. transientFailure
    // tracks that distinction so the finally-block below can evict the
    // cache entry for anything that should be retried on the next request.
    let transientFailure = false;
    try {
      const photo = await getFootballerPhoto(player);
      // Meaningfully different source resolutions. The browser receives only
      // these reduced pixels, rather than a clear image hidden with CSS.
      const widths = [14, 24, 42, 76, 150, 720] as const;
      const sourceUrl = stage === 5 ? photo.url : buildWikimediaThumbnailUrl(photo, widths[stage]!);
      if (!sourceUrl) return fallbackSvg(stage);

      const response = await fetch(sourceUrl, {
        headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
        signal: AbortSignal.timeout(12_000)
      });
      if (!response.ok) { transientFailure = true; return fallbackSvg(stage); }
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > 8_000_000) { transientFailure = true; return fallbackSvg(stage); }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > 8_000_000) { transientFailure = true; return fallbackSvg(stage); }
      return {
        buffer,
        contentType: response.headers.get("content-type") || "image/jpeg"
      };
    } catch (error) {
      transientFailure = true;
      if (process.env.NODE_ENV !== "production") {
        console.warn(JSON.stringify({
          level: "warn",
          event: "blind_reveal_asset_fallback",
          playerId: identity(player),
          stage,
          message: error instanceof Error ? error.message : "Unknown image error"
        }));
      }
      return fallbackSvg(stage);
    } finally {
      if (transientFailure) assetCache.delete(key);
    }
  })().catch(error => {
    assetCache.delete(key);
    throw error;
  });

  assetCache.set(key, pending);
  return pending;
}
