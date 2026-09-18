import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Footballer } from "@auction-eleven/shared";

export interface LocalFootballerImage {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif"] as const;
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif"
};

// This resolves correctly in both development (src/*.ts) and the bundled
// production server (dist/index.js): both folders sit one level below
// apps/server/player-images.
export const PLAYER_IMAGES_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../player-images"
);

let indexPromise: Promise<Map<string, string>> | null = null;
const imageCache = new Map<string, Promise<LocalFootballerImage>>();

function identity(player: Footballer): string {
  return player.canonicalId ?? player.catalogId ?? player.id;
}

function safeIdentity(player: Footballer): string {
  const value = identity(player).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new Error(`Unsafe local player image id: ${identity(player)}`);
  }
  return value;
}

async function buildImageIndex(): Promise<Map<string, string>> {
  const entries = await readdir(PLAYER_IMAGES_DIRECTORY, { withFileTypes: true });
  const index = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(extension as (typeof IMAGE_EXTENSIONS)[number])) continue;
    const stem = path.basename(entry.name, extension).toLowerCase();
    if (!index.has(stem)) index.set(stem, entry.name);
  }
  return index;
}

async function imageIndex(): Promise<Map<string, string>> {
  indexPromise ??= buildImageIndex().catch(error => {
    indexPromise = null;
    throw error;
  });
  return indexPromise;
}

export async function getLocalFootballerImage(player: Footballer): Promise<LocalFootballerImage> {
  const key = safeIdentity(player);
  const cached = imageCache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    const index = await imageIndex();
    const filename = index.get(key);
    if (!filename) throw new Error(`No local image found for ${player.name} (${key}).`);
    const extension = path.extname(filename).toLowerCase();
    const buffer = await readFile(path.join(PLAYER_IMAGES_DIRECTORY, filename));
    if (!buffer.length) throw new Error(`Local image for ${player.name} is empty.`);
    return {
      buffer,
      contentType: CONTENT_TYPES[extension] ?? "application/octet-stream",
      filename
    };
  })().catch(error => {
    imageCache.delete(key);
    throw error;
  });

  imageCache.set(key, pending);
  return pending;
}

export async function getLocalFootballerImageCoverage(players: readonly Footballer[]): Promise<{
  total: number;
  available: number;
  missing: Array<{ id: string; name: string }>;
}> {
  const index = await imageIndex();
  const missing = players
    .map(player => ({ id: safeIdentity(player), name: player.name }))
    .filter(player => !index.has(player.id));
  return { total: players.length, available: players.length - missing.length, missing };
}
