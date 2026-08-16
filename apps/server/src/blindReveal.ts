import type { Footballer } from "@auction-eleven/shared";
import { getFootballerPhoto } from "./photoResolver.js";

export interface BlindRevealAsset {
  buffer: Buffer;
  contentType: string;
}

const assetCache = new Map<string, Promise<BlindRevealAsset>>();

function identity(player: Footballer): string {
  return player.canonicalId ?? player.catalogId ?? player.id;
}

function thumbnailAtWidth(url: string, width: number): string | null {
  // Wikimedia Commons thumb URLs end in /<width>px-<filename>. Re-requesting
  // a smaller server-generated thumbnail means the clear pixels never reach
  // the browser during early Blind stages.
  const match = url.match(/^(.*\/thumb\/.*\/)(\d+)px-([^/]+)$/i);
  if (!match) return null;
  return `${match[1]}${width}px-${match[3]}`;
}

function fallbackSvg(stage: number): BlindRevealAsset {
  const opacity = [.96, .9, .82, .7, .55, .18][stage] ?? .9;
  const svg = `<svg width="420" height="520" viewBox="0 0 420 520" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#06110b"/><stop offset="1" stop-color="#143521"/></linearGradient></defs><rect width="420" height="520" rx="28" fill="url(#g)"/><circle cx="210" cy="180" r="78" fill="#274b36" opacity="${opacity}"/><path d="M78 482c16-124 90-184 132-184s116 60 132 184" fill="#274b36" opacity="${opacity}"/><text x="210" y="500" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" fill="#8cff54">MYSTERY PLAYER</text></svg>`;
  return { buffer: Buffer.from(svg), contentType: "image/svg+xml" };
}

/**
 * Returns only the raster resolution allowed for the current reveal stage.
 * Early stages are genuine low-resolution Wikimedia thumbnails fetched by the
 * trusted server, not a clear image hidden with client-side CSS.
 */
export async function renderBlindRevealStage(player: Footballer, stageInput: number): Promise<BlindRevealAsset> {
  const stage = Math.max(0, Math.min(5, Math.round(stageInput)));
  const key = `${identity(player)}:${stage}`;
  let pending = assetCache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const photo = await getFootballerPhoto(player);
        const widths = [18, 28, 46, 76, 150, 720];
        const sourceUrl = stage === 5 ? photo.url : thumbnailAtWidth(photo.url, widths[stage]!);
        if (!sourceUrl) return fallbackSvg(stage);
        const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(12_000) });
        if (!response.ok) return fallbackSvg(stage);
        const contentType = response.headers.get("content-type") || "image/jpeg";
        return { buffer: Buffer.from(await response.arrayBuffer()), contentType };
      } catch {
        return fallbackSvg(stage);
      }
    })();
    assetCache.set(key, pending);
  }
  try {
    return await pending;
  } catch (error) {
    assetCache.delete(key);
    throw error;
  }
}
