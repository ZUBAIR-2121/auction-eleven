import type { Footballer, FootballerPhoto } from "@auction-eleven/shared";

const cache = new Map<string, Promise<FootballerPhoto>>();
const USER_AGENT = "AuctionEleven/0.2 (football auction game; Wikimedia Commons attribution resolver)";

const cleanText = (value: string | undefined): string => (value ?? "")
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/\s+/g, " ")
  .trim();

async function getJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Photo provider returned ${response.status}.`);
  return response.json() as Promise<T>;
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function resolve(player: Footballer): Promise<FootballerPhoto> {
  const searchUrl = new URL("https://www.wikidata.org/w/api.php");
  searchUrl.search = new URLSearchParams({
    action: "wbsearchentities",
    format: "json",
    language: "en",
    uselang: "en",
    type: "item",
    limit: "10",
    search: player.photoSearchName ?? player.name
  }).toString();

  type SearchResponse = { search?: Array<{ id: string; label: string; description?: string }> };
  const search = await getJson<SearchResponse>(searchUrl);
  const targetName = normalized(player.photoSearchName ?? player.name);
  const result = search.search?.find(item => normalized(item.label) === targetName && /football|soccer/i.test(item.description ?? ""))
    ?? search.search?.find(item => /football|soccer/i.test(item.description ?? ""));
  if (!result) throw new Error(`No Wikimedia footballer record found for ${player.name}.`);

  const entityUrl = new URL("https://www.wikidata.org/w/api.php");
  entityUrl.search = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    ids: result.id,
    props: "claims"
  }).toString();
  type EntityResponse = { entities?: Record<string, { claims?: { P18?: Array<{ mainsnak?: { datavalue?: { value?: string } } }> } }> };
  const entity = await getJson<EntityResponse>(entityUrl);
  const filename = entity.entities?.[result.id]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!filename) throw new Error(`No Wikimedia Commons portrait is attached to ${player.name}.`);

  const commonsUrl = new URL("https://commons.wikimedia.org/w/api.php");
  commonsUrl.search = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "720",
    titles: `File:${filename}`
  }).toString();
  type Metadata = { value?: string };
  type CommonsResponse = { query?: { pages?: Record<string, { imageinfo?: Array<{ url: string; thumburl?: string; descriptionurl: string; extmetadata?: Record<string, Metadata> }> }> } };
  const commons = await getJson<CommonsResponse>(commonsUrl);
  const page = Object.values(commons.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) throw new Error(`Wikimedia Commons did not return a usable image for ${player.name}.`);

  const metadata = info.extmetadata ?? {};
  const credit = cleanText(metadata.Artist?.value) || cleanText(metadata.Credit?.value) || "Wikimedia Commons contributor";
  const license = cleanText(metadata.LicenseShortName?.value) || cleanText(metadata.UsageTerms?.value) || "See file page";
  const licenseUrl = metadata.LicenseUrl?.value || info.descriptionurl;

  return {
    url: info.thumburl ?? info.url,
    originalUrl: info.url,
    descriptionUrl: info.descriptionurl,
    credit,
    license,
    licenseUrl,
    source: "Wikimedia Commons"
  };
}

export function getFootballerPhoto(player: Footballer): Promise<FootballerPhoto> {
  const existing = cache.get(player.id);
  if (existing) return existing;
  const pending = resolve(player).catch(error => {
    cache.delete(player.id);
    throw error;
  });
  cache.set(player.id, pending);
  return pending;
}
