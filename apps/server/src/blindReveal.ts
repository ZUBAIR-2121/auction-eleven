import type { Footballer, FootballerPhoto } from "@auction-eleven/shared";
import { getLocalFootballerImage } from "./localPlayerImages.js";

export interface BlindRevealAsset {
  buffer: Buffer;
  contentType: string;
}

function identity(player: Footballer): string {
  return player.canonicalId ?? player.catalogId ?? player.id;
}

/**
 * Kept for backwards compatibility with the existing test suite and any
 * integrations that used this helper. Blind Auction itself no longer depends
 * on Wikimedia at runtime; it uses the bundled real-player image pack.
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
 * Blind Auction now reads the exact selected footballer's real photo from the
 * bundled local player-image pack. The browser receives this same photograph
 * for the round and the UI progressively removes its blur as clarity rises.
 *
 * This deliberately avoids Wikimedia/Wikipedia network calls during a match,
 * so HTTP 429/rate-limit failures can no longer replace the player with the
 * generic green mystery image.
 */
export async function renderBlindRevealStage(player: Footballer, stageInput: number): Promise<BlindRevealAsset> {
  const stage = Math.max(0, Math.min(5, Math.round(stageInput)));
  try {
    const image = await getLocalFootballerImage(player);
    return { buffer: image.buffer, contentType: image.contentType };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "blind_local_player_image_missing",
      playerId: identity(player),
      playerName: player.name,
      stage,
      message: error instanceof Error ? error.message : "Unknown local image error"
    }));
    return fallbackSvg(stage);
  }
}
