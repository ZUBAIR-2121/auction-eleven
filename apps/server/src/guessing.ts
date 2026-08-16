import { normalizeFootballerGuess, type Footballer } from "@auction-eleven/shared";
import { FOOTBALLERS } from "./footballers.js";

export type GuessMatchResult = "correct" | "incorrect" | "ambiguous";

type AliasOwner = { id: string; displayName: string };

/**
 * Explicit, human-friendly aliases. Safe basic aliases are generated for every
 * footballer below, while this table covers well-known short forms and naming
 * variants that cannot be inferred reliably.
 */
const EXPLICIT_ALIASES: Record<string, string[]> = {
  "Lionel Messi": ["Messi", "Leo Messi"],
  "Cristiano Ronaldo": ["Cristiano", "CR7", "Ronaldo"],
  "Neymar": ["Neymar Jr", "Neymar Jr.", "Neymar Junior", "Neymar da Silva Santos Junior", "Neymar da Silva Santos Júnior"],
  "Kylian Mbappé": ["Mbappé", "Mbappe", "Kylian Mbappe"],
  "Erling Haaland": ["Haaland"],
  "Mohamed Salah": ["Salah", "Mo Salah"],
  "Kevin De Bruyne": ["De Bruyne", "KDB"],
  "Vinícius Júnior": ["Vinicius Junior", "Vinicius Jr", "Vini Jr", "Vini"],
  "N'Golo Kanté": ["N Golo Kante", "Kante"],
  "Ronaldo Nazário": ["Ronaldo Nazario", "Ronaldo Fenômeno", "Ronaldo Fenomeno", "R9", "Ronaldo"],
  "Ronaldinho": ["Ronaldinho Gaucho", "Ronaldinho Gaúcho"],
  "Pelé": ["Pele"],
  "Kaká": ["Kaka"],
  "Zinedine Zidane": ["Zidane", "Zizou"],
  "Lothar Matthäus": ["Lothar Matthaus", "Matthaus"],
  "Franz Beckenbauer": ["Beckenbauer"],
  "Johan Cruyff": ["Cruyff"],
  "Thierry Henry": ["Henry"],
  "David Beckham": ["Beckham"],
  "Gianluigi Buffon": ["Buffon", "Gigi Buffon"],
  "Iker Casillas": ["Casillas"],
  "Lev Yashin": ["Yashin"],
  "Robert Lewandowski": ["Lewandowski", "Lewa"],
  "Luka Modrić": ["Modric"],
  "Son Heung-min": ["Son", "Heung Min Son"],
  "Virgil van Dijk": ["Van Dijk", "VVD"],
  "Trent Alexander-Arnold": ["Trent", "TAA"],
  "Marc-André ter Stegen": ["Ter Stegen"],
  "Emiliano Martínez": ["Emi Martinez", "Martinez"],
  "Antoine Griezmann": ["Griezmann"],
  "Ángel Di María": ["Di Maria"],
  "Luis Suárez": ["Luis Suarez"],
  "Sadio Mané": ["Sadio Mane", "Mane"],
  "Zlatan Ibrahimović": ["Zlatan", "Ibrahimovic"],
  "Gareth Bale": ["Bale"],
  "Wayne Rooney": ["Rooney"],
  "Andrea Pirlo": ["Pirlo"],
  "Xavi Hernández": ["Xavi"],
  "Andrés Iniesta": ["Iniesta"],
  "Ruud Gullit": ["Gullit"],
  "Paolo Maldini": ["Maldini"],
  "Diego Maradona": ["Maradona"],
  "Roberto Carlos": ["Roberto Carlos"],
  "George Best": ["George Best"],
  "Ferenc Puskás": ["Puskas"],
  "Eusébio": ["Eusebio"],
  "Gerd Müller": ["Gerd Muller", "Muller"],
};

function identity(player: Footballer): string {
  return player.canonicalId ?? player.catalogId ?? player.id;
}

function safeGeneratedAliases(player: Footballer): string[] {
  const aliases = new Set<string>([player.name]);
  const words = normalizeFootballerGuess(player.name).split(" ").filter(Boolean);
  if (words.length > 1) {
    const last = words.at(-1)!;
    const suffixes = new Set(["jr", "junior", "filho", "neto"]);
    if (last.length >= 4 && !suffixes.has(last)) aliases.add(last);
    if (["de", "van", "von", "da", "di", "ter"].includes(words.at(-2) ?? "")) {
      aliases.add(`${words.at(-2)} ${last}`);
    }
  }
  for (const alias of EXPLICIT_ALIASES[player.name] ?? []) aliases.add(alias);
  return [...aliases].map(normalizeFootballerGuess).filter(Boolean);
}

const aliasIndex = new Map<string, Map<string, AliasOwner>>();
const aliasesByPlayerId = new Map<string, string[]>();

for (const player of FOOTBALLERS) {
  const playerId = identity(player);
  const aliases = safeGeneratedAliases(player);
  aliasesByPlayerId.set(playerId, aliases);
  for (const alias of aliases) {
    const owners = aliasIndex.get(alias) ?? new Map<string, AliasOwner>();
    owners.set(playerId, { id: playerId, displayName: player.name });
    aliasIndex.set(alias, owners);
  }
}

export function getFootballerGuessAliases(player: Footballer): string[] {
  return aliasesByPlayerId.get(identity(player)) ?? [normalizeFootballerGuess(player.name)];
}

export function getAmbiguousAliases(): string[] {
  return [...aliasIndex.entries()].filter(([, owners]) => owners.size > 1).map(([alias]) => alias).sort();
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  if (i < a.length || j < b.length) edits++;
  return edits <= 1;
}

/**
 * Exact normalized aliases always win. Conservative typo tolerance is limited
 * to one edit on aliases of at least six characters and is accepted only when
 * that near-match identifies exactly one footballer across the full catalogue.
 */
export function matchFootballerGuess(hiddenPlayer: Footballer, rawGuess: string): GuessMatchResult {
  const guess = normalizeFootballerGuess(rawGuess);
  if (!guess) return "incorrect";
  const hiddenId = identity(hiddenPlayer);

  const exactOwners = aliasIndex.get(guess);
  if (exactOwners) {
    if (exactOwners.size > 1) return "ambiguous";
    return exactOwners.has(hiddenId) ? "correct" : "incorrect";
  }

  if (guess.length < 6) return "incorrect";
  const fuzzyOwners = new Set<string>();
  for (const [alias, owners] of aliasIndex) {
    if (alias.length < 6 || owners.size !== 1) continue;
    if (editDistanceAtMostOne(guess, alias)) fuzzyOwners.add(owners.keys().next().value as string);
    if (fuzzyOwners.size > 1) return "incorrect";
  }
  return fuzzyOwners.size === 1 && fuzzyOwners.has(hiddenId) ? "correct" : "incorrect";
}

export function validateFootballerAliasIndex(): { aliases: number; ambiguous: string[] } {
  return { aliases: aliasIndex.size, ambiguous: getAmbiguousAliases() };
}
