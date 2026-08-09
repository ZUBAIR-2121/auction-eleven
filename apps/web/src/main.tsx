import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import { io, type Socket } from "socket.io-client";
import {
  FORMATIONS,
  FORMATION_BY_ID,
  getOpeningBid,
  getConfiguredSquadSize,
  getMinimumFootballersRequired,
  getSquadCompletion,
  getStartingLineupSize,
  getSquadPositionTargets,
  getFootballerPrimaryRoles,
  getFootballerSecondaryRoles,
  getFootballerRoles,
  getRoleFitLabel,
  type AuctionPoolSizeMode,
  type AuctionStatePatch,
  type BotDifficulty,
  type ClientToServerEvents,
  type Footballer,
  type FootballerPhoto,
  type FormationDefinition,
  type GameSettings,
  type IconFrequency,
  type LineupRole,
  type ManagerLimit,
  type PlayerPoolMode,
  type PoolTargets,
  type Position,
  type PricingMode,
  type RoomAccess,
  type RoomDirectoryEntry,
  type RoomDirectoryFilters,
  type RoomState,
  type SquadSize,
  type SubstituteCount,
  type ServerToClientEvents,
  type SquadEntry
} from "@auction-eleven/shared";
import "./styles.css";
import ronaldoHero from "./assets/ronaldo.webp";
import messiHero from "./assets/messi.webp";
import neymarHero from "./assets/neymar.webp";

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Backend URL (Render in production, localhost during development)
const serverBase =
  (import.meta.env.VITE_SERVER_URL?.trim() || window.location.origin).replace(/\/$/, "");

// REST API helper
const apiUrl = (path: string) => `${serverBase}${path}`;

// Socket.IO connection
const socket: GameSocket = io(serverBase, {
  autoConnect: true,
  reconnection: true,
  transports: ["websocket", "polling"],
});

// Session ID
const createSession = () => {
  const existing = localStorage.getItem("ae_session");
  if (existing) return existing;

  const id = crypto.randomUUID();
  localStorage.setItem("ae_session", id);

  return id;
};
const sessionId = createSession();
const SAVED_MANAGER_NAME_KEY = "auction-eleven-manager-name";
const MANAGER_NAME_PATTERN = /^[\p{L}\p{N} _-]{2,18}$/u;

function normalizeManagerName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 18);
}

function readSavedManagerName(): string {
  try {
    const saved = normalizeManagerName(localStorage.getItem(SAVED_MANAGER_NAME_KEY) ?? "");
    return MANAGER_NAME_PATTERN.test(saved) ? saved : "";
  } catch {
    return "";
  }
}

function rememberManagerName(value: string): void {
  const normalized = normalizeManagerName(value);
  if (!MANAGER_NAME_PATTERN.test(normalized)) return;
  try { localStorage.setItem(SAVED_MANAGER_NAME_KEY, normalized); } catch { /* preferences can be unavailable */ }
}

type PerformancePreference = "auto" | "quality" | "performance";
type EffectivePerformanceMode = "quality" | "performance";

function resolvePerformanceMode(preference: PerformancePreference): EffectivePerformanceMode {
  if (preference !== "auto") return preference;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  return reducedMotion || memory <= 4 || cores <= 4 ? "performance" : "quality";
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; message: string }> {
  state = { failed: false, message: "" };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, message: error instanceof Error ? error.message : "The interface hit an unexpected error." };
  }
  componentDidCatch(error: unknown) { console.error("Auction Eleven UI boundary", error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="recovery-screen"><section className="panel recovery-card"><div className="eyebrow">SAFE RECOVERY</div><h1>The game UI recovered from an error.</h1><p>{this.state.message}</p><p>Your room/session token is still stored. Retry the interface or reconnect without deleting the active multiplayer seat.</p><div><button className="primary" onClick={() => this.setState({ failed: false, message: "" })}>Retry interface</button><button className="secondary" onClick={() => { socket.disconnect(); socket.connect(); this.setState({ failed: false, message: "" }); }}>Reconnect</button></div></section></main>;
  }
}

function useBackClosable(open: boolean, onClose: () => void, key: string) {
  const pushed = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const count = Number(body.dataset.aeOverlayCount ?? "0") + 1;
    body.dataset.aeOverlayCount = String(count);
    body.classList.add("ae-overlay-open");
    if (!pushed.current) {
      window.history.pushState({ ...(window.history.state ?? {}), aeOverlay: key }, "", window.location.href);
      pushed.current = true;
    }
    const onPopState = (event: PopStateEvent) => {
      if (!pushed.current || event.state?.aeOverlay === key) return;
      pushed.current = false;
      closeRef.current();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      const nextCount = Math.max(0, Number(body.dataset.aeOverlayCount ?? "1") - 1);
      body.dataset.aeOverlayCount = String(nextCount);
      if (nextCount === 0) body.classList.remove("ae-overlay-open");
    };
  }, [open, key]);
  return React.useCallback(() => {
    if (pushed.current) window.history.back();
    else onClose();
  }, [onClose]);
}

function releaseDocumentScrollLock() {
  const html = document.documentElement;
  const body = document.body;
  body.classList.remove("formation-dragging");
  html.style.removeProperty("overflow");
  html.style.removeProperty("height");
  body.style.removeProperty("overflow");
  body.style.removeProperty("height");
  body.style.removeProperty("position");
  body.style.removeProperty("top");
  body.style.removeProperty("width");
  body.style.removeProperty("touch-action");
}

const money = (value: number) => `${value}M`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
const POSITION_NAMES: Record<Position, string> = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" };
const MANAGER_LIMITS: ManagerLimit[] = [2, 3, 4, 5, 6, 7, 8];
const SQUAD_SIZES: SquadSize[] = [6, 7, 8, 9, 10, 11];
const SUBSTITUTE_COUNTS: SubstituteCount[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const BOT_DIFFICULTIES: BotDifficulty[] = ["Amateur", "Professional", "World Class", "Legendary"];
const PRICING_MODES: Array<{ id: PricingMode; title: string; description: string }> = [
  { id: "normal", title: "Normal", description: "Every footballer opens at the same minimum bid." },
  { id: "ovr_scaled", title: "OVR Pricing", description: "Higher-rated footballers begin at a higher price." }
];
const AUCTION_POOL_SIZE_MODES: Array<{ id: AuctionPoolSizeMode; title: string; description: string }> = [
  { id: "quick", title: "Quick", description: "Minimum squads plus a small reserve." },
  { id: "standard", title: "Standard", description: "Balanced variety for a normal-length auction." },
  { id: "large", title: "Large", description: "More choices and more passing strategy." },
  { id: "all", title: "All", description: "Auction every eligible footballer exactly once." },
  { id: "custom", title: "Custom Count", description: "Choose the exact auction queue size." }
];
const CHAT_EMOJIS = ["😀", "😂", "😍", "😎", "🤔", "😱", "😭", "😡", "👏", "🙌", "👍", "👎", "🤝", "🔥", "⚡", "💸", "💰", "🏆", "🥇", "⚽", "🥅", "🧤", "🚀", "🎯", "💪", "🧠", "❤️", "✅", "❌", "👀", "🎉", "🫡"];

const LANDING_HEROES = [
  { name: "Cristiano Ronaldo", tagline: "Elite mentality · decisive finishing", image: ronaldoHero, objectPosition: "center 38%" },
  { name: "Lionel Messi", tagline: "Vision · control · match-winning creativity", image: messiHero, objectPosition: "center 48%" },
  { name: "Neymar Jr", tagline: "Flair · movement · fearless attacking play", image: neymarHero, objectPosition: "center 34%" },
] as const;
const HERO_VIDEO = "https://stream.mux.com/Aa02T7oM1wH5Mk5EEVDYhbZ1ChcdhRsS2m1NYyx4Ua1g.m3u8";
const photoCache = new Map<string, FootballerPhoto>();
const pendingPhotos = new Map<string, Promise<FootballerPhoto>>();
const PHOTO_CACHE_KEY = "ae_photo_";
let activePhotoJobs = 0;
const queuedPhotoJobs: Array<() => void> = [];

function runNextPhotoJob() {
  if (activePhotoJobs >= 5) return;
  const next = queuedPhotoJobs.shift();
  if (!next) return;
  activePhotoJobs++;
  next();
}

function queuePhotoJob<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queuedPhotoJobs.push(() => {
      task().then(resolve, reject).finally(() => {
        activePhotoJobs--;
        runNextPhotoJob();
      });
    });
    runNextPhotoJob();
  });
}

const cleanMetadata = (value: string | undefined) => (value ?? "")
  .replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const normalizedName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function browserJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Wikimedia returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function resolvePhotoInBrowser(player: Footballer): Promise<FootballerPhoto> {
  const searchUrl = new URL("https://www.wikidata.org/w/api.php");
  searchUrl.search = new URLSearchParams({ action: "wbsearchentities", format: "json", origin: "*", language: "en", uselang: "en", type: "item", limit: "10", search: player.photoSearchName ?? player.name }).toString();
  type SearchResponse = { search?: Array<{ id: string; label: string; description?: string }> };
  const search = await browserJson<SearchResponse>(searchUrl);
  const target = normalizedName(player.photoSearchName ?? player.name);
  const item = search.search?.find(entry => normalizedName(entry.label) === target && /football|soccer/i.test(entry.description ?? ""))
    ?? search.search?.find(entry => /football|soccer/i.test(entry.description ?? ""));
  if (!item) throw new Error(`No Wikidata footballer found for ${player.name}`);

  const entityUrl = new URL("https://www.wikidata.org/w/api.php");
  entityUrl.search = new URLSearchParams({ action: "wbgetentities", format: "json", origin: "*", ids: item.id, props: "claims" }).toString();
  type EntityResponse = { entities?: Record<string, { claims?: { P18?: Array<{ mainsnak?: { datavalue?: { value?: string } } }> } }> };
  const entity = await browserJson<EntityResponse>(entityUrl);
  const filename = entity.entities?.[item.id]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!filename) throw new Error(`No Commons portrait is attached to ${player.name}`);

  const commonsUrl = new URL("https://commons.wikimedia.org/w/api.php");
  commonsUrl.search = new URLSearchParams({ action: "query", format: "json", origin: "*", prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "600", titles: `File:${filename}` }).toString();
  type Metadata = { value?: string };
  type CommonsResponse = { query?: { pages?: Record<string, { imageinfo?: Array<{ url: string; thumburl?: string; descriptionurl: string; extmetadata?: Record<string, Metadata> }> }> } };
  const commons = await browserJson<CommonsResponse>(commonsUrl);
  const info = Object.values(commons.query?.pages ?? {})[0]?.imageinfo?.[0];
  if (!info) throw new Error(`No usable Commons image found for ${player.name}`);
  const metadata = info.extmetadata ?? {};
  return {
    url: info.thumburl ?? info.url,
    originalUrl: info.url,
    descriptionUrl: info.descriptionurl,
    credit: cleanMetadata(metadata.Artist?.value) || cleanMetadata(metadata.Credit?.value) || "Wikimedia Commons contributor",
    license: cleanMetadata(metadata.LicenseShortName?.value) || cleanMetadata(metadata.UsageTerms?.value) || "See file page",
    licenseUrl: metadata.LicenseUrl?.value || info.descriptionurl,
    source: "Wikimedia Commons"
  };
}

async function resolvePhoto(player: Footballer): Promise<FootballerPhoto> {
  try {
    return await resolvePhotoInBrowser(player);
  } catch (browserError) {
    const response = await fetch(apiUrl(`/api/footballers/${player.catalogId ?? player.id}/photo`), { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw browserError;
    return response.json() as Promise<FootballerPhoto>;
  }
}

async function loadPhoto(player: Footballer): Promise<FootballerPhoto> {
  const cacheId = player.catalogId ?? player.id;
  const cached = photoCache.get(cacheId);
  if (cached) return cached;
  const stored = sessionStorage.getItem(`${PHOTO_CACHE_KEY}${cacheId}`);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as FootballerPhoto;
      photoCache.set(cacheId, parsed);
      return parsed;
    } catch {
      sessionStorage.removeItem(`${PHOTO_CACHE_KEY}${cacheId}`);
    }
  }
  const pending = pendingPhotos.get(cacheId);
  if (pending) return pending;
  const request = queuePhotoJob(() => resolvePhoto(player)).then(photo => {
    photoCache.set(cacheId, photo);
    pendingPhotos.delete(cacheId);
    try { sessionStorage.setItem(`${PHOTO_CACHE_KEY}${cacheId}`, JSON.stringify(photo)); } catch { /* cache can be unavailable */ }
    return photo;
  }).catch(error => {
    pendingPhotos.delete(cacheId);
    throw error;
  });
  pendingPhotos.set(cacheId, request);
  return request;
}

function App() {
  const [state, setState] = useState<RoomState | null>(null);
  const [managerId, setManagerId] = useState(localStorage.getItem("ae_manager"));
  const [error, setError] = useState("");
  const [reaction, setReaction] = useState<{ managerName: string; reaction: string; at: number } | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [isLoading, setIsLoading] = useState(() => !sessionStorage.getItem("ae_intro_seen"));
  const [performancePreference, setPerformancePreference] = useState<PerformancePreference>(() => (localStorage.getItem("ae_performance") as PerformancePreference | null) ?? "auto");
  const ignoredRoomRef = useRef<string | null>(null);

  useEffect(() => {
    const updateViewportHeight = () => {
      document.documentElement.style.setProperty("--ae-vh", `${window.innerHeight * 0.01}px`);
    };
    const unlockDocumentScroll = () => {
      releaseDocumentScrollLock();
      updateViewportHeight();
    };
    unlockDocumentScroll();
    window.addEventListener("resize", updateViewportHeight, { passive: true });
    window.addEventListener("orientationchange", unlockDocumentScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", updateViewportHeight, { passive: true });
    window.addEventListener("pageshow", unlockDocumentScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("orientationchange", unlockDocumentScroll);
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("pageshow", unlockDocumentScroll);
    };
  }, []);

  const effectivePerformance = resolvePerformanceMode(performancePreference);
  useEffect(() => {
    document.documentElement.dataset.aePerformance = effectivePerformance;
    localStorage.setItem("ae_performance", performancePreference);
  }, [effectivePerformance, performancePreference]);

  useEffect(() => {
    const handleConnect = () => {
      setConnected(true);
      const code = localStorage.getItem("ae_room");
      if (code) socket.emit("room:resume", { code, sessionId }, response => {
        if (response.ok) { setManagerId(response.data.managerId); return; }
        localStorage.removeItem("ae_room");
        localStorage.removeItem("ae_manager");
        setManagerId(null);
        setState(null);
        setError(response.error);
      });
    };
    const handleDisconnect = () => setConnected(false);
    const handleRoomState = (next: RoomState) => {
      if (ignoredRoomRef.current === next.code) return;
      setState(current => current?.code === next.code && current.version > next.version ? current : next);
    };
    const handleAuctionPatch = (patch: AuctionStatePatch) => {
      if (ignoredRoomRef.current === patch.code) return;
      setState(current => {
        if (!current || current.code !== patch.code || current.roundId !== patch.roundId || current.version >= patch.version) return current;
        return {
          ...current,
          version: patch.version,
          currentBid: patch.currentBid,
          highestBidderId: patch.highestBidderId,
          endsAt: patch.endsAt,
          bidHistory: patch.bidHistory,
          passedManagerIds: patch.passedManagerIds
        };
      });
    };
    const handleRoomError = (message: string) => setError(message);
    let reactionTimer: number | null = null;
    const handleReaction = (value: { managerName: string; reaction: string; at: number }) => {
      setReaction(value);
      if (reactionTimer !== null) window.clearTimeout(reactionTimer);
      reactionTimer = window.setTimeout(() => setReaction(null), 1800);
    };
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room:state", handleRoomState);
    socket.on("room:auctionPatch", handleAuctionPatch);
    socket.on("room:error", handleRoomError);
    socket.on("room:reaction", handleReaction);
    if (socket.connected) handleConnect();
    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room:state", handleRoomState);
      socket.off("room:auctionPatch", handleAuctionPatch);
      socket.off("room:error", handleRoomError);
      socket.off("room:reaction", handleReaction);
      if (reactionTimer !== null) window.clearTimeout(reactionTimer);
    };
  }, []);

  useEffect(() => {
    // Always keep one in-app root entry behind rooms. This prevents the first
    // browser/system Back action from immediately closing or leaving the site.
    const current = window.history.state as { aeApp?: boolean; aeRoom?: string } | null;
    if (current?.aeApp) return;
    const url = new URL(window.location.href);
    const savedRoom = localStorage.getItem("ae_room");
    const queryRoom = url.searchParams.get("room")?.toUpperCase();
    if (savedRoom && queryRoom === savedRoom.toUpperCase()) {
      url.searchParams.delete("room");
      window.history.replaceState({ aeApp: true, aeRoot: true }, "", `${url.pathname}${url.search}${url.hash}`);
    } else {
      window.history.replaceState({ ...(current ?? {}), aeApp: true, aeRoot: true }, "", window.location.href);
    }
  }, []);

  const finishLoading = React.useCallback(() => {
    sessionStorage.setItem("ae_intro_seen", "1");
    setIsLoading(false);
  }, []);
  const saveSeat = (code: string, id: string) => {
    ignoredRoomRef.current = null;
    localStorage.setItem("ae_room", code);
    localStorage.setItem("ae_manager", id);
    setManagerId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("room", code);
    const current = window.history.state as { aeRoom?: string } | null;
    if (current?.aeRoom === code) window.history.replaceState({ ...(current ?? {}), aeApp: true, aeRoom: code }, "", `${url.pathname}${url.search}${url.hash}`);
    else window.history.pushState({ aeApp: true, aeRoom: code }, "", `${url.pathname}${url.search}${url.hash}`);
  };
  useEffect(() => {
    const phase = state?.phase;
    if (phase !== "formation") releaseDocumentScrollLock();

    if (phase === "finished") {
      const frame = window.requestAnimationFrame(() => {
        releaseDocumentScrollLock();
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        document.querySelector<HTMLElement>("[data-results-scroll]")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [state?.phase]);

  const leave = (force = false) => {
    if (!force && state && state.phase !== "lobby" && state.phase !== "finished") {
      const message = state.isSolo
        ? "Leave this Solo Practice match? Your current progress will be lost."
        : "Leave this live room? Your manager will remain in the match as disconnected.";
      if (!confirm(message)) return;
    }
    const finish = () => {
      if (state?.code) ignoredRoomRef.current = state.code;
      localStorage.removeItem("ae_room");
      localStorage.removeItem("ae_manager");
      setManagerId(null);
      setState(null);
      setError("");
      window.history.replaceState(null, "", window.location.pathname);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    if (!state || !managerId || !socket.connected) { finish(); return; }
    let completed = false;
    const finishOnce = () => { if (completed) return; completed = true; finish(); };
    const fallback = window.setTimeout(finishOnce, 1200);
    socket.emit("room:leave", { code: state.code }, response => {
      window.clearTimeout(fallback);
      if (!response.ok) setError(response.error);
      finishOnce();
    });
  };

  useEffect(() => {
    if (!state?.code) return;
    const current = window.history.state as { aeRoom?: string; aePhase?: string } | null;
    if (current?.aeRoom !== state.code) {
      const url = new URL(window.location.href);
      url.searchParams.set("room", state.code);
      window.history.pushState({ aeApp: true, aeRoom: state.code, aePhase: state.phase }, "", `${url.pathname}${url.search}${url.hash}`);
    } else {
      window.history.replaceState({ ...current, aeApp: true, aeRoom: state.code, aePhase: state.phase }, "", window.location.href);
    }
  }, [state?.code, state?.phase]);

  useEffect(() => {
    const onPopState = () => {
      if (!state || document.body.classList.contains("ae-overlay-open")) return;
      if (state.phase !== "lobby" && state.phase !== "finished") {
        const shouldLeave = window.confirm("Leave this match? Your manager seat can be recovered if you reconnect with this browser.");
        if (!shouldLeave) {
          window.history.pushState({ aeApp: true, aeRoom: state.code, aePhase: state.phase }, "", window.location.href);
          return;
        }
      }
      leave(true);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [state, managerId]);

  const hasSeat = !state || (!!managerId && state.managers.some(manager => manager.id === managerId));
  let page: React.ReactNode;
  if (!state) page = <Landing socket={socket} saveSeat={saveSeat} setError={setError} performanceMode={effectivePerformance} />;
  else if (!hasSeat) page = <main className="recovery-screen"><section className="panel recovery-card"><div className="eyebrow">RESTORING SESSION</div><h1>Reconnecting your manager seat…</h1><p>The server state arrived before your local seat was restored. Your live room remains authoritative.</p></section></main>;
  else if (state.phase === "lobby") page = <Lobby socket={socket} state={state} managerId={managerId!} setError={setError} leave={leave} />;
  else if (state.phase === "formation") page = <FormationRoom socket={socket} state={state} managerId={managerId!} setError={setError} leave={leave} />;
  else if (state.phase === "finished") page = <Results state={state} managerId={managerId!} leave={leave} />;
  else page = <Arena socket={socket} state={state} managerId={managerId!} setError={setError} leave={leave} />;

  const pageKey = state ? `${state.code}-${state.phase}` : "landing";
  return <div className="app-shell">
    <AnimatePresence>{isLoading && <LoadingScreen onComplete={finishLoading} />}</AnimatePresence>
    <div className="ambient-grid" /><div className="noise" />
    <header className="topbar"><Brand />{state ? <button className="topbar-back" onClick={() => leave()}>← BACK TO MENU</button> : <nav><a href="#home">Home</a><a href="#how">How it works</a><a href="#play">Play</a></nav>}<div className="topbar-tools"><button className="performance-switch" title="Visual performance mode" onClick={() => setPerformancePreference(current => current === "auto" ? "quality" : current === "quality" ? "performance" : "auto")}>⚙ {performancePreference.toUpperCase()}</button><div className="status-pill"><i className={connected ? "online" : "offline"} />{connected ? "Live server" : "Reconnecting"}</div></div></header>
    {error && <Toast message={error} close={() => setError("")} />}
    {reaction && <div className="reaction-pop"><b>{reaction.managerName}</b> {reaction.reaction}</div>}
    {state && managerId && <RoomChat socket={socket} state={state} managerId={managerId} setError={setError} />}
    <AnimatePresence mode="wait"><motion.div key={pageKey} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .35 }}>{page}</motion.div></AnimatePresence>
  </div>;
}

function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [count, setCount] = useState(0);
  const words = ["Scout", "Bid", "Build", "Win"];
  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    let doneTimer: number | null = null;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 2300);
      setCount(Math.round(progress * 100));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else doneTimer = window.setTimeout(onComplete, 300);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (doneTimer !== null) window.clearTimeout(doneTimer);
    };
  }, [onComplete]);
  const word = words[Math.min(words.length - 1, Math.floor(count / 25))];
  return <motion.div className="loading-screen" exit={{ opacity: 0, y: "-100%" }} transition={{ duration: .7, ease: [0.76, 0, 0.24, 1] }}>
    <div className="loading-label">AUCTION ELEVEN</div>
    <AnimatePresence mode="wait"><motion.div className="loading-word" key={word} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>{word}</motion.div></AnimatePresence>
    <div className="loading-count">{String(count).padStart(3, "0")}</div>
    <div className="loading-track"><i style={{ transform: `scaleX(${count / 100})` }} /></div>
  </motion.div>;
}

function Brand() { return <a href="#home" className="brand"><div className="brand-mark"><span>11</span></div><div><strong>WINNING</strong><em>ELEVEN</em></div></a>; }
function Toast({ message, close }: { message: string; close: () => void }) { return <div className="toast"><span>!</span><p>{message}</p><button onClick={close}>×</button></div>; }

function HeroVideo({ performanceMode }: { performanceMode: EffectivePerformanceMode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (performanceMode === "performance") return;
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let hls: { destroy: () => void } | null = null;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = HERO_VIDEO;
      video.play().catch(() => undefined);
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (disposed || !Hls.isSupported()) return;
        const instance = new Hls({ enableWorker: true, lowLatencyMode: false });
        hls = instance;
        instance.loadSource(HERO_VIDEO);
        instance.attachMedia(video);
        video.play().catch(() => undefined);
      });
    }
    return () => { disposed = true; hls?.destroy(); };
  }, [performanceMode]);
  if (performanceMode === "performance") return <div className="hero-video hero-video-fallback" aria-hidden="true" />;
  return <video ref={videoRef} className="hero-video" autoPlay muted loop playsInline preload="metadata" aria-hidden="true" />;
}

function PlayerHeroSlider({ performanceMode }: { performanceMode: EffectivePerformanceMode }) {
  const [index, setIndex] = useState(0);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    LANDING_HEROES.forEach(item => { const image = new Image(); image.src = item.image; });
    if (reduceMotion) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % LANDING_HEROES.length), 4600);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  const active = LANDING_HEROES[index];
  return <section className="player-hero-slider" aria-label="Featured footballers">
    <div className="player-hero-pattern" aria-hidden="true" />
    <div className="player-hero-copy">
      <span>FEATURED STAR</span>
      <strong>{active.name}</strong>
      <p>{active.tagline}</p>
    </div>
    <div className="player-hero-media">
      <AnimatePresence mode="wait">
        <motion.img
          key={active.name}
          src={active.image}
          alt={active.name}
          className="player-hero-image"
          style={{ objectPosition: active.objectPosition }}
          initial={reduceMotion ? false : performanceMode === "performance" ? { opacity: 0 } : { opacity: 0, x: 34, scale: 1.025 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={reduceMotion ? undefined : performanceMode === "performance" ? { opacity: 0 } : { opacity: 0, x: -26, scale: .99 }}
          transition={{ duration: reduceMotion ? 0 : performanceMode === "performance" ? .25 : .7, ease: [0.22, 1, 0.36, 1] }}
        />
      </AnimatePresence>
      <div className="player-hero-overlay" />
    </div>
    <div className="player-hero-dots">{LANDING_HEROES.map((item, dotIndex) => <button type="button" key={item.name} aria-label={`Show ${item.name}`} className={dotIndex === index ? "active" : ""} onClick={() => setIndex(dotIndex)} />)}</div>
  </section>;
}

function Landing({ socket, saveSeat, setError, performanceMode }: { socket: GameSocket; saveSeat: (code: string, id: string) => void; setError: (value: string) => void; performanceMode: EffectivePerformanceMode }) {
  const [name, setName] = useState(() => readSavedManagerName());
  const [code, setCode] = useState("");
  const [directPassword, setDirectPassword] = useState("");
  const [createAccess, setCreateAccess] = useState<RoomAccess>("public");
  const [createPassword, setCreatePassword] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const closeDirectory = useBackClosable(directoryOpen, () => setDirectoryOpen(false), "room-directory");
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
    if (titleRef.current) timeline.fromTo(titleRef.current, { opacity: 0, y: performanceMode === "performance" ? 14 : 55 }, { opacity: 1, y: 0, duration: performanceMode === "performance" ? .3 : 1.15 }, .1);
    if (copyRef.current) timeline.fromTo(copyRef.current.children, { opacity: 0, y: performanceMode === "performance" ? 8 : 20, filter: performanceMode === "performance" ? "none" : "blur(9px)" }, { opacity: 1, y: 0, filter: "none", stagger: performanceMode === "performance" ? .03 : .1, duration: performanceMode === "performance" ? .25 : .8 }, .2);
    return () => { timeline.kill(); };
  }, [performanceMode]);

  const validateName = () => {
    const normalized = normalizeManagerName(name);
    if (!MANAGER_NAME_PATTERN.test(normalized)) {
      setError("Manager names must be 2–18 characters and use letters, numbers, spaces, - or _ only.");
      return false;
    }
    return true;
  };

  const createRoom = (solo = false) => {
    if (!validateName()) return;
    if (!solo && createAccess === "password" && createPassword.trim().length < 4) {
      setError("Password rooms need a password with at least four characters.");
      return;
    }
    setBusy(true);
    socket.emit("room:create", {
      name: normalizeManagerName(name),
      sessionId,
      solo,
      access: solo ? "public" : createAccess,
      password: !solo && createAccess === "password" ? createPassword : undefined
    }, response => {
      setBusy(false);
      if (response.ok) {
        rememberManagerName(name);
        saveSeat(response.data.code, response.data.managerId);
      } else setError(response.error);
    });
  };

  const joinCode = () => {
    if (!validateName()) return;
    if (code.trim().length !== 6) {
      setError("Enter a valid six-character room code.");
      return;
    }
    setBusy(true);
    socket.emit("room:join", { code, name: normalizeManagerName(name), sessionId, password: directPassword || undefined }, response => {
      setBusy(false);
      if (response.ok) {
        rememberManagerName(name);
        saveSeat(response.data.code, response.data.managerId);
      } else setError(response.error);
    });
  };

  return <main className="landing" id="home">
    <section className="landing-hero">
      <HeroVideo performanceMode={performanceMode} /><div className="hero-shade" /><div className="hero-fade" /><div className="hero-green-grid" aria-hidden="true" />
      <div className="hero-layout"><div className="hero-content" ref={copyRef}>
        <div className="eyebrow">THE NEXT-GEN FOOTBALL AUCTION EXPERIENCE · 2026</div>
        <h1 ref={titleRef}>Win the market.<br /><span>Build the eleven.</span></h1>
        <p>Fast live auctions, tactical squad building, public room discovery, password-protected lobbies, and a server-ranked final podium.</p>
        <div className="hero-actions"><a className="primary" href="#play">Enter match hub</a><button className="secondary" onClick={() => setDirectoryOpen(true)}>Find live rooms</button></div>
        <div className="feature-row"><span>Public + locked rooms</span><span>OVR + normal pricing</span><span>2–8 managers</span></div>
      </div>
      <PlayerHeroSlider performanceMode={performanceMode} /></div><div className="scroll-indicator"><span>SCROLL</span><i /></div>
    </section>

    <section className="landing-section" id="how">
      <div className="section-kicker"><i /> GAME FLOW</div>
      <div className="section-heading"><h2>Every screen built for <em>fast decisions.</em></h2><p>A responsive football-game interface designed for desktop, tablet, and mobile without forcing landscape orientation.</p></div>
      <div className="bento-grid">
        <article className="bento-card bento-wide"><span>01</span><h3>Create your lobby</h3><p>Launch an open room anyone can discover, or protect the room with a password while keeping it visible in the browser.</p><b>PUBLIC + PASSWORD ACCESS</b></article>
        <article className="bento-card"><span>02</span><h3>Bid with context</h3><p>See opening value, squad needs, live rivals, private budgets, and position coverage while every round is moving.</p><b>LIVE AUCTION INTELLIGENCE</b></article>
        <article className="bento-card"><span>03</span><h3>Build the formation</h3><p>Drag starters and substitutes across the pitch on mouse or touch, then lock your tactical lineup for server scoring.</p><b>MOBILE DRAG SYSTEM</b></article>
      </div>
    </section>

    <section className="play-section" id="play">
      <div className="play-copy"><div className="section-kicker"><i /> MATCH HUB</div><h2>Choose how the room <em>opens.</em></h2><p>Open rooms appear in Find Room and join instantly. Password rooms are also listed, but require the correct password before a seat is granted.</p></div>
      <section className="entry-card match-entry-card">
        <div className="card-glow" /><h3>Manager access</h3>
        <label>MANAGER NAME<input maxLength={18} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Shadow XI" autoComplete="nickname" /></label>
        <div className="access-choice" role="group" aria-label="Room access type">
          <button type="button" className={createAccess === "public" ? "active" : ""} onClick={() => setCreateAccess("public")}><span>◎</span><strong>OPEN ROOM</strong><small>Listed publicly · one-click join</small></button>
          <button type="button" className={createAccess === "password" ? "active" : ""} onClick={() => setCreateAccess("password")}><span>◆</span><strong>PASSWORD ROOM</strong><small>Listed publicly · password required</small></button>
        </div>
        <AnimatePresence initial={false}>{createAccess === "password" && <motion.label initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="password-field">ROOM PASSWORD<input type="password" minLength={4} maxLength={32} value={createPassword} onChange={event => setCreatePassword(event.target.value)} placeholder="4–32 characters" autoComplete="new-password" /></motion.label>}</AnimatePresence>
        <button className="primary create-room-button" disabled={busy} onClick={() => createRoom(false)}>Create {createAccess === "password" ? "password" : "open"} room <b>↗</b></button>
        <button className="secondary" disabled={busy} onClick={() => createRoom(true)}>Solo practice vs AI</button>
        <div className="divider"><span>JOIN DIRECTLY</span></div>
        <div className="direct-join-grid"><input className="code-input" maxLength={6} value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="ROOM CODE" aria-label="Room code" /><input type="password" maxLength={32} value={directPassword} onChange={event => setDirectPassword(event.target.value)} placeholder="PASSWORD IF NEEDED" aria-label="Room password" /><button disabled={busy || code.length < 6} onClick={joinCode}>JOIN</button></div>
        <button className="room-browser-launch" type="button" onClick={() => setDirectoryOpen(true)}><span>⌕</span><div><strong>FIND ROOM</strong><small>Browse open and password lobbies</small></div><b>→</b></button>
        <small>Room passwords are verified by the server and are never included in public room data.</small>
      </section>
    </section>
    <footer className="landing-footer"><Brand /><span>Original football auction game · In-game credits have no monetary value.</span></footer>
    <AnimatePresence>{directoryOpen && <RoomDirectory socket={socket} managerName={name} saveSeat={saveSeat} setError={setError} onClose={closeDirectory} />}</AnimatePresence>
  </main>;
}

function RoomDirectory({ socket, managerName, saveSeat, setError, onClose }: { socket: GameSocket; managerName: string; saveSeat: (code: string, id: string) => void; setError: (value: string) => void; onClose: () => void }) {
  const [rooms, setRooms] = useState<RoomDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningCode, setJoiningCode] = useState("");
  const [passwordRoom, setPasswordRoom] = useState<RoomDirectoryEntry | null>(null);
  const [password, setPassword] = useState("");
  const closePasswordRoom = useBackClosable(Boolean(passwordRoom), () => setPasswordRoom(null), "room-password");
  const [managerLimit, setManagerLimit] = useState<"all" | ManagerLimit>("all");
  const [pricingMode, setPricingMode] = useState<"all" | PricingMode>("all");
  const [playerPoolMode, setPlayerPoolMode] = useState<"all" | PlayerPoolMode>("all");
  const [access, setAccess] = useState<"all" | RoomAccess>("all");

  const loadRooms = React.useCallback(() => {
    setLoading(true);
    const filters: RoomDirectoryFilters = {};
    if (managerLimit !== "all") filters.managerLimit = managerLimit;
    if (pricingMode !== "all") filters.pricingMode = pricingMode;
    if (playerPoolMode !== "all") filters.playerPoolMode = playerPoolMode;
    if (access !== "all") filters.access = access;
    socket.emit("rooms:list", { filters }, response => {
      setLoading(false);
      if (!response.ok) setError(response.error);
      else setRooms(response.data);
    });
  }, [access, managerLimit, playerPoolMode, pricingMode, setError, socket]);

  useEffect(() => {
    loadRooms();
    socket.on("rooms:changed", loadRooms);
    return () => { socket.off("rooms:changed", loadRooms); };
  }, [loadRooms, socket]);

  const join = (room: RoomDirectoryEntry, roomPassword?: string) => {
    const normalizedManagerName = normalizeManagerName(managerName);
    if (!MANAGER_NAME_PATTERN.test(normalizedManagerName)) {
      setError("Enter a valid 2–18 character manager name before joining a room.");
      return;
    }
    if (room.openSlots < 1) {
      setError(`Room full: ${room.managerCount}/${room.managerLimit} managers have joined.`);
      return;
    }
    if (room.hasPassword && roomPassword === undefined) {
      setPasswordRoom(room);
      setPassword("");
      return;
    }
    setJoiningCode(room.code);
    socket.emit("room:join", { code: room.code, name: normalizedManagerName, sessionId, password: roomPassword }, response => {
      setJoiningCode("");
      if (!response.ok) setError(response.error);
      else {
        rememberManagerName(normalizedManagerName);
        saveSeat(response.data.code, response.data.managerId);
      }
    });
  };

  return <motion.div className="room-directory-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Find room">
    <motion.section className="room-directory" initial={{ opacity: 0, y: 36, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: .985 }} transition={{ type: "spring", stiffness: 280, damping: 28 }}>
      <header className="directory-head"><div><div className="eyebrow">LIVE MATCHMAKING</div><h2>Find a room</h2><p>Open rooms join instantly. Locked rooms stay visible but require their password.</p></div><button className="modal-close" onClick={onClose} aria-label="Close room browser">×</button></header>
      <div className="directory-filters">
        <label><span>ROOM SIZE</span><select value={managerLimit} onChange={event => setManagerLimit(event.target.value === "all" ? "all" : Number(event.target.value) as ManagerLimit)}><option value="all">All sizes</option>{MANAGER_LIMITS.map(limit => <option value={limit} key={limit}>{limit} managers</option>)}</select></label>
        <label><span>PRICING</span><select value={pricingMode} onChange={event => setPricingMode(event.target.value as "all" | PricingMode)}><option value="all">All modes</option><option value="normal">Normal pricing</option><option value="ovr_scaled">OVR pricing</option></select></label>
        <label><span>PLAYER POOL</span><select value={playerPoolMode} onChange={event => setPlayerPoolMode(event.target.value as "all" | PlayerPoolMode)}><option value="all">All generations</option><option value="current">Current only</option><option value="icons">Icons only</option><option value="mixed">Generations</option><option value="custom">Custom</option></select></label>
        <label><span>ACCESS</span><select value={access} onChange={event => setAccess(event.target.value as "all" | RoomAccess)}><option value="all">All rooms</option><option value="public">Open rooms</option><option value="password">Password rooms</option></select></label>
        <button className="directory-refresh" onClick={loadRooms} disabled={loading}>↻ <span>REFRESH</span></button>
      </div>
      <div className="directory-summary"><span><i className="online" /> {rooms.filter(room => room.openSlots > 0).length} joinable</span><span>{rooms.length} matching rooms</span></div>
      <div className="room-list">
        {loading && rooms.length === 0 && <div className="directory-empty"><span className="directory-loader" /><strong>Scanning live rooms</strong><small>Checking the server directory…</small></div>}
        {!loading && rooms.length === 0 && <div className="directory-empty"><span>⌁</span><strong>No matching rooms</strong><small>Create a new room or change the filters.</small></div>}
        {rooms.map(room => {
          const full = room.openSlots < 1;
          return <article className={`directory-room ${full ? "full" : ""}`} key={room.code}>
            <div className="directory-room-icon">{room.hasPassword ? "◆" : "◎"}</div>
            <div className="directory-room-main"><div><strong>{room.hostName}'s room</strong><span className={room.hasPassword ? "locked" : "open"}>{room.hasPassword ? "PASSWORD" : "OPEN"}</span></div><small>Code {room.code} · {getStartingLineupSize(room.squadSize)} starters + {room.substituteCount} subs · {room.auctionSeconds}s rounds</small><div className="directory-room-tags"><span>{room.pricingMode === "ovr_scaled" ? "OVR PRICING" : "NORMAL PRICING"}</span><span>{room.playerPoolMode === "mixed" ? "GENERATIONS" : room.playerPoolMode === "icons" ? "ICONS" : room.playerPoolMode === "custom" ? "CUSTOM POOL" : "CURRENT"}</span><span>{room.managerLimit} MANAGER ROOM</span></div></div>
            <div className="directory-occupancy"><div><b>{room.managerCount}</b><span>/{room.managerLimit}</span></div><small>{full ? "ROOM FULL" : `${room.openSlots} OPEN`}</small></div>
            <button className="directory-join" disabled={full || joiningCode === room.code} onClick={() => join(room)}>{full ? "FULL" : joiningCode === room.code ? "JOINING…" : room.hasPassword ? "ENTER PASSWORD" : "JOIN ROOM"}</button>
          </article>;
        })}
      </div>
      <footer className="directory-footer"><span>Rooms disappear from this list when the auction starts.</span><button className="secondary" onClick={onClose}>Close browser</button></footer>
    </motion.section>
    <AnimatePresence>{passwordRoom && <motion.div className="password-dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) closePasswordRoom(); }}><motion.form className="password-dialog" initial={{ y: 24, scale: .96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, scale: .97 }} onSubmit={event => { event.preventDefault(); join(passwordRoom, password); }}><span className="password-room-icon">◆</span><div className="eyebrow">LOCKED ROOM · {passwordRoom.code}</div><h3>Enter room password</h3><p>{passwordRoom.hostName}'s room has {passwordRoom.openSlots} seat{passwordRoom.openSlots === 1 ? "" : "s"} remaining.</p><input autoFocus type="password" minLength={4} maxLength={32} value={password} onChange={event => setPassword(event.target.value)} placeholder="Room password" autoComplete="current-password" /><div><button type="button" className="secondary" onClick={closePasswordRoom}>Cancel</button><button type="submit" className="primary" disabled={password.length < 4 || joiningCode === passwordRoom.code}>{joiningCode === passwordRoom.code ? "Joining…" : "Unlock & join"}</button></div></motion.form></motion.div>}</AnimatePresence>
  </motion.div>;
}

function countPool(players: Footballer[], selectedIds: string[]): PoolTargets {
  const selected = new Set(selectedIds);
  const counts: PoolTargets = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  players.forEach(player => { if (selected.has(player.id)) counts[player.position]++; });
  return counts;
}

function Lobby({ socket, state, managerId, setError, leave }: { socket: GameSocket; state: RoomState; managerId: string; setError: (value: string) => void; leave: () => void }) {
  const me = state.managers.find(manager => manager.id === managerId)!;
  const isHost = state.hostId === managerId;
  const [poolOpen, setPoolOpen] = useState(false);
  const closePool = useBackClosable(poolOpen, () => setPoolOpen(false), "player-pool");
  const [roomPassword, setRoomPassword] = useState("");
  const counts = useMemo(() => countPool(state.availableFootballers, state.selectedFootballerIds), [state.availableFootballers, state.selectedFootballerIds]);
  const starterCount = getStartingLineupSize(state.settings.squadSize);
  const substituteCount = state.settings.substituteCount;
  const totalSquadSize = getConfiguredSquadSize(state.settings.squadSize, substituteCount);
  const validation = state.poolValidation;
  const startDisabled = state.managers.some(manager => !manager.ready) || !state.poolSelectionValid;

  const updateSettings = (settings: Partial<GameSettings>) => socket.emit("room:updateSettings", { code: state.code, settings }, response => { if (!response.ok) setError(response.error); });
  const changeNumber = (key: "startingBudget" | "auctionSeconds" | "formationSeconds", value: number) => updateSettings({ [key]: value });
  const changeManagerLimit = (managerLimit: ManagerLimit) => updateSettings({ managerLimit });
  const changeSquadSize = (squadSize: SquadSize) => updateSettings({ squadSize });
  const changeSubstituteCount = (next: SubstituteCount) => updateSettings({ substituteCount: next });
  const changeReauctionUnsold = (reauctionUnsold: boolean) => updateSettings({ reauctionUnsold });
  const changeBotDifficulty = (botDifficulty: BotDifficulty) => updateSettings({ botDifficulty });
  const changePricingMode = (pricingMode: PricingMode) => updateSettings({ pricingMode });
  const changePlayerPoolMode = (playerPoolMode: PlayerPoolMode) => updateSettings({ playerPoolMode });
  const changeAuctionPoolSizeMode = (auctionPoolSizeMode: AuctionPoolSizeMode) => updateSettings({ auctionPoolSizeMode });
  const changeAuctionPoolCustomCount = (auctionPoolCustomCount: number) => updateSettings({ auctionPoolCustomCount });
  const changeIconFrequency = (iconFrequency: IconFrequency) => updateSettings({ iconFrequency });
  const changeIconSurprise = (iconSurprise: boolean) => updateSettings({ iconSurprise });
  const autoBuildPool = () => socket.emit("room:autoBuildPlayerPool", { code: state.code }, response => { if (!response.ok) setError(response.error); });
  const changeRoomAccess = (access: RoomAccess) => {
    if (access === "password" && !state.hasPassword && roomPassword.trim().length < 4) {
      setError("Enter a room password with at least four characters first.");
      return;
    }
    socket.emit("room:updateAccess", { code: state.code, access, password: access === "password" && roomPassword.trim() ? roomPassword : undefined }, response => {
      if (!response.ok) setError(response.error);
      else setRoomPassword("");
    });
  };
  const toggleReady = () => socket.emit("room:ready", { code: state.code, ready: !me.ready }, response => { if (!response.ok) setError(response.error); });
  const start = () => socket.emit("game:start", { code: state.code }, response => { if (!response.ok) setError(response.error); });
  const poolModeLabel = state.settings.playerPoolMode === "mixed" ? "GENERATIONS" : state.settings.playerPoolMode === "icons" ? "ICONS" : state.settings.playerPoolMode === "custom" ? "CUSTOM" : "CURRENT";
  const poolSizeLabel = state.settings.auctionPoolSizeMode === "all" ? "ALL" : state.settings.auctionPoolSizeMode === "custom" ? `${state.settings.auctionPoolCustomCount}` : state.settings.auctionPoolSizeMode.toUpperCase();

  return <main className="lobby page">
    <div className="room-return-row"><button className="room-back-button" onClick={leave}><span>←</span><div><b>BACK TO GAME MENU</b><small>Leave this room safely</small></div></button></div>
    <div className="lobby-head"><div><div className="eyebrow">{state.isSolo ? "SOLO PRACTICE LOBBY" : state.access === "password" ? "PASSWORD MATCH LOBBY" : "PUBLIC MATCH LOBBY"}</div><h1>Managers’ Tunnel</h1><p>Each manager needs {starterCount} starters. The bench allows up to {substituteCount} optional substitute{substituteCount === 1 ? "" : "s"}. Maximum squad size: {totalSquadSize}.</p></div><div className="room-code"><span>ROOM CODE</span><strong>{state.code}</strong><button onClick={() => navigator.clipboard.writeText(state.code)}>COPY</button></div></div>
    <div className="lobby-grid"><section className="panel managers-panel"><div className="panel-title"><h2>Room managers</h2><span>{state.managers.length}/{state.settings.managerLimit}</span></div><div className="manager-cards">{state.managers.map(manager => <div className={`manager-card ${manager.ready ? "ready" : ""}`} key={manager.id}><div className="avatar">{manager.avatar}</div><div><strong>{manager.name}</strong><small>{manager.isHost ? "HOST" : manager.isBot ? "AI MANAGER" : "CHALLENGER"}</small></div><div className="ready-tag">{manager.ready ? "READY" : manager.connected ? "WAITING" : "DISCONNECTED"}</div>{isHost && !manager.connected && !manager.isHost && <button className="replace-ai" onClick={() => socket.emit("room:replaceWithAI", { code: state.code, managerId: manager.id }, response => { if (!response.ok) setError(response.error); })}>REPLACE WITH AI</button>}</div>)}</div><div className="squad-rule-card"><b>{totalSquadSize}</b><div><strong>STARTING + BENCH LIMIT</strong><span>{starterCount} required starters + up to {substituteCount} optional substitute{substituteCount === 1 ? "" : "s"}</span></div></div></section>
      <section className="panel settings"><div className="panel-title"><h2>Match setup</h2><span>{isHost ? "HOST CONTROL" : "LOCKED"}</span></div>
        <Setting label="Starting budget" value={`${state.settings.startingBudget}M`}><input disabled={!isHost} type="range" min="300" max="3000" step="50" value={state.settings.startingBudget} onChange={event => changeNumber("startingBudget", +event.target.value)} /></Setting>
        <Setting label="Auction timer" value={`${state.settings.auctionSeconds}s`}><input disabled={!isHost} type="range" min="10" max="30" step="1" value={state.settings.auctionSeconds} onChange={event => changeNumber("auctionSeconds", +event.target.value)} /></Setting>
        <Setting label="Formation time limit" value={`${Math.round(state.settings.formationSeconds / 60)} min`}><input disabled={!isHost} type="range" min="120" max="600" step="60" value={state.settings.formationSeconds} onChange={event => changeNumber("formationSeconds", +event.target.value)} /></Setting>
        {!state.isSolo && <div className="manager-limit-setting room-access-setting"><div><span>ROOM ACCESS</span><b>{state.access === "password" ? "PASSWORD" : "OPEN"}</b></div><div className="preset-buttons pricing-mode-buttons"><button disabled={!isHost} className={state.access === "public" ? "active" : ""} onClick={() => changeRoomAccess("public")}><strong>Open room</strong><small>Visible in Find Room and joins instantly.</small></button><button disabled={!isHost} className={state.access === "password" ? "active" : ""} onClick={() => changeRoomAccess("password")}><strong>Password room</strong><small>Visible in Find Room but locked.</small></button></div>{isHost && <div className="lobby-password-row"><input type="password" maxLength={32} value={roomPassword} onChange={event => setRoomPassword(event.target.value)} placeholder={state.hasPassword ? "Enter a new password to replace it" : "Set password (4–32 characters)"} /><button disabled={roomPassword.trim().length < 4} onClick={() => changeRoomAccess("password")}>{state.hasPassword ? "UPDATE PASSWORD" : "SET PASSWORD"}</button></div>}<small>{state.hasPassword ? "A password is active. It is never sent to other players or shown in the room directory." : "Open rooms can be joined without a password."}</small></div>}
        <div className="manager-limit-setting pricing-mode-setting"><div><span>PLAYER STARTING PRICES</span><b>{state.settings.pricingMode === "ovr_scaled" ? "OVR PRICING" : "NORMAL"}</b></div><div className="preset-buttons pricing-mode-buttons">{PRICING_MODES.map(mode => <button disabled={!isHost} className={state.settings.pricingMode === mode.id ? "active" : ""} onClick={() => changePricingMode(mode.id)} key={mode.id}><strong>{mode.title}</strong><small>{mode.description}</small></button>)}</div><small>{state.settings.pricingMode === "ovr_scaled" ? "The opening bid uses each player's OVR and market value, scaled to the room budget." : "Classic mode keeps the same opening bid for every footballer."}</small></div>

        <div className="manager-limit-setting player-pool-setting"><div><span>PLAYER POOL</span><b>{poolModeLabel}</b></div><div className="player-pool-mode-grid">
          <button disabled={!isHost} className={state.settings.playerPoolMode === "current" ? "active" : ""} onClick={() => changePlayerPoolMode("current")}><span>NOW</span><strong>Current</strong><small>Modern stars only</small></button>
          <button disabled={!isHost} className={state.settings.playerPoolMode === "icons" ? "active icon" : "icon"} onClick={() => changePlayerPoolMode("icons")}><span>★</span><strong>Icons</strong><small>Legendary retired footballers</small></button>
          <button disabled={!isHost} className={state.settings.playerPoolMode === "mixed" ? "active" : ""} onClick={() => changePlayerPoolMode("mixed")}><span>∞</span><strong>Generations</strong><small>Modern stars vs legends</small></button>
          <button disabled={!isHost} className={state.settings.playerPoolMode === "custom" ? "active" : ""} onClick={() => changePlayerPoolMode("custom")}><span>＋</span><strong>Custom</strong><small>Build your own pool</small></button>
        </div>
        {state.settings.playerPoolMode === "mixed" && <div className="mixed-options"><div><span>ICON FREQUENCY</span><div className="inline-choice">{(["low", "normal", "high"] as IconFrequency[]).map(value => <button disabled={!isHost} className={state.settings.iconFrequency === value ? "active" : ""} onClick={() => changeIconFrequency(value)} key={value}>{value.toUpperCase()}</button>)}</div></div><div><span>ICON SURPRISE</span><div className="inline-choice"><button disabled={!isHost} className={!state.settings.iconSurprise ? "active" : ""} onClick={() => changeIconSurprise(false)}>OFF</button><button disabled={!isHost} className={state.settings.iconSurprise ? "active icon" : "icon"} onClick={() => changeIconSurprise(true)}>ON</button></div></div><small>Low ≈20% icons · Normal ≈35% · High ≈50%. Surprise mode spaces icons between current-player runs.</small></div>}
        </div>

        <div className="manager-limit-setting auction-pool-size-setting"><div><span>AUCTION POOL SIZE</span><b>{poolSizeLabel}</b></div><div className="auction-pool-size-grid">{AUCTION_POOL_SIZE_MODES.map(mode => <button disabled={!isHost} className={state.settings.auctionPoolSizeMode === mode.id ? "active" : ""} onClick={() => changeAuctionPoolSizeMode(mode.id)} key={mode.id}><strong>{mode.title}</strong><small>{mode.description}</small></button>)}</div>{state.settings.auctionPoolSizeMode === "custom" && <div className="custom-pool-count"><div><span>CUSTOM COUNT</span><b>{state.settings.auctionPoolCustomCount}</b></div><input disabled={!isHost} type="range" min={Math.max(1, validation.required)} max={Math.max(validation.required, validation.eligibleAvailable)} value={Math.min(Math.max(state.settings.auctionPoolCustomCount, validation.required), Math.max(validation.required, validation.eligibleAvailable))} onChange={event => changeAuctionPoolCustomCount(+event.target.value)} /><small>Cannot be lower than the minimum required to complete every squad.</small></div>}<small>{state.settings.auctionPoolSizeMode === "all" ? `Every one of the ${validation.eligibleAvailable} eligible footballers will enter the server auction queue.` : `Target queue: ${validation.target} footballers from ${validation.eligibleAvailable} eligible.`}</small></div>

        <div className="manager-limit-setting difficulty-setting"><div><span>AI DIFFICULTY</span><b>{state.settings.botDifficulty.toUpperCase()}</b></div><div className="preset-buttons difficulty-buttons">{BOT_DIFFICULTIES.map(level => <button disabled={!isHost || !state.isSolo} className={state.settings.botDifficulty === level ? "active" : ""} onClick={() => changeBotDifficulty(level)} key={level}>{level}</button>)}</div><small>{state.isSolo ? "Higher levels value OVR, player type, positional needs and budget timing more accurately." : "AI difficulty is used in Solo Practice rooms."}</small></div>
        <div className="manager-limit-setting"><div><span>ROOM CAPACITY</span><b>{state.settings.managerLimit} MANAGERS</b></div><div className="preset-buttons compact-presets">{MANAGER_LIMITS.map(limit => <button disabled={!isHost || (!state.isSolo && limit < state.managers.length)} className={state.settings.managerLimit === limit ? "active" : ""} onClick={() => changeManagerLimit(limit)} key={limit}>{limit}</button>)}</div><small>{state.isSolo ? "AI managers are added automatically." : "Rooms support a minimum of 2 and maximum of 8 managers."}</small></div>
        <div className="manager-limit-setting squad-size-setting"><div><span>STARTERS</span><b>{starterCount} PLAYERS</b></div><div className="preset-buttons squad-size-buttons">{SQUAD_SIZES.map(size => <button disabled={!isHost} className={state.settings.squadSize === size ? "active" : ""} onClick={() => changeSquadSize(size)} key={size}>{size}</button>)}</div><small>Choose the starting formation size. Full-size football uses 11 starters.</small></div>
        <div className="manager-limit-setting substitute-setting"><div><span>MAX SUBSTITUTES</span><b>UP TO {substituteCount}</b></div><div className="preset-buttons substitute-buttons">{SUBSTITUTE_COUNTS.map(count => <button disabled={!isHost} className={substituteCount === count ? "active" : ""} onClick={() => changeSubstituteCount(count)} key={count}>{count}</button>)}</div><small>Optional bench depth. Managers can press I'M DONE as soon as their required starters are complete. Maximum squad size is {totalSquadSize}.</small></div>
        <div className="manager-limit-setting reauction-setting"><div><span>RE-AUCTION UNSOLD</span><b>{state.settings.reauctionUnsold ? "ON" : "OFF"}</b></div><div className="preset-buttons pricing-mode-buttons"><button disabled={!isHost} className={!state.settings.reauctionUnsold ? "active" : ""} onClick={() => changeReauctionUnsold(false)}><strong>Off</strong><small>Skipped footballers never return.</small></button><button disabled={!isHost} className={state.settings.reauctionUnsold ? "active" : ""} onClick={() => changeReauctionUnsold(true)}><strong>On</strong><small>Unsold players return only after the normal pool ends.</small></button></div></div>

        <div className={`pool-summary ${state.poolSelectionValid ? "valid" : "invalid"}`}><div><span>SELECTED AUCTION POOL</span><strong>{validation.selected} / {validation.required} minimum</strong></div><div className="pool-type-counts"><span>CURRENT <b>{validation.selectedCurrent}</b></span><span>ICONS <b>{validation.selectedIcons}</b></span><span>TARGET <b>{validation.target}</b></span><span>ELIGIBLE <b>{validation.eligibleAvailable}</b></span></div><div className="pool-counts">{POSITIONS.map(position => <span key={position}>{position} <b>{counts[position]}</b></span>)}</div><div className="pool-actions"><button onClick={() => setPoolOpen(true)}>{isHost && state.settings.playerPoolMode === "custom" ? "CUSTOMIZE PLAYERS" : "VIEW PLAYERS"}</button>{isHost && <button className="auto-pool" onClick={autoBuildPool}>{state.settings.playerPoolMode === "custom" ? "RANDOM BALANCED" : "REBUILD BALANCED POOL"}</button>}</div></div>

        <div className="prematch-summary"><div className="setting-heading"><span>AUCTION SETTINGS</span><b>READY CHECK</b></div><div className="summary-grid"><span>Managers<b>{state.managers.length}</b></span><span>Starters<b>{starterCount}</b></span><span>Max subs<b>{substituteCount}</b></span><span>Squad<b>{totalSquadSize}</b></span><span>Player pool<b>{poolModeLabel}</b></span><span>Eligible<b>{validation.eligibleAvailable}</b></span><span>Auction queue<b>{validation.selected}</b></span><span>Minimum<b>{validation.required}</b></span><span>Pool size<b>{poolSizeLabel}</b></span><span>Timer<b>{state.settings.auctionSeconds}s</b></span><span>Budget<b>{state.settings.startingBudget}M</b></span><span>Opponent budgets<b>PRIVATE</b></span>{state.settings.playerPoolMode === "mixed" && <span>Icons<b>{state.settings.iconFrequency.toUpperCase()}</b></span>}</div></div>

        {(validation.errors.length > 0 || validation.warnings.length > 0) && <div className="pool-validation-list">{validation.errors.map(message => <p className="error" key={message}>✕ {message}</p>)}{validation.warnings.map(message => <p className="warning" key={message}>! {message}</p>)}</div>}
        <div className="capacity-meter unique"><span>{state.poolSelectionValid ? "Auction pool ready" : "Player pool needs attention"}</span><b>{validation.selected} selected / {validation.required} minimum</b><small>{state.managers.length} manager{state.managers.length === 1 ? "" : "s"} × ({starterCount} starters + {substituteCount} subs) = {validation.required} minimum unique footballers. The recommended pool adds variety while preserving positional coverage.</small></div>
        <div className="lobby-actions"><button className={me.ready ? "secondary" : "primary"} onClick={toggleReady}>{me.ready ? "Not Ready" : "I’m Ready"}</button>{isHost && <button className="kickoff" disabled={startDisabled} onClick={start}>START AUCTION ↗</button>}<button className="text-btn" onClick={leave}>← Back to menu</button></div>
      </section></div>
    {poolOpen && <PlayerPoolModal socket={socket} state={state} isHost={isHost} onClose={closePool} setError={setError} />}
  </main>;
}

function Setting({ label, value, children }: { label: string; value: string; children: React.ReactNode }) { return <div className="setting"><div><span>{label}</span><b>{value}</b></div>{children}</div>; }

function PlayerPoolModal({ socket, state, isHost, onClose, setError }: { socket: GameSocket; state: RoomState; isHost: boolean; onClose: () => void; setError: (value: string) => void }) {
  const [active, setActive] = useState<"ALL" | Position>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "CURRENT" | "ICON">("ALL");
  const [roleFilter, setRoleFilter] = useState<"ALL" | LineupRole>("ALL");
  const [minOvr, setMinOvr] = useState(70);
  const [query, setQuery] = useState("");
  const editable = isHost && state.settings.playerPoolMode === "custom";
  const initialDraft = editable ? state.customPlayerIds : state.selectedFootballerIds;
  const [draft, setDraft] = useState<string[]>(initialDraft);
  const [saving, setSaving] = useState(false);
  const roles: LineupRole[] = ["GK", "LB", "CB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "CF", "ST"];

  useEffect(() => { setDraft(editable ? state.customPlayerIds : state.selectedFootballerIds); }, [editable, state.customPlayerIds, state.selectedFootballerIds]);
  const counts = useMemo(() => countPool(state.availableFootballers, draft), [state.availableFootballers, draft]);
  const selectedSet = useMemo(() => new Set(draft), [draft]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = useMemo(() => state.availableFootballers
    .filter(player => active === "ALL" || player.position === active)
    .filter(player => typeFilter === "ALL" || (player.playerType ?? "CURRENT") === typeFilter)
    .filter(player => roleFilter === "ALL" || getFootballerRoles(player).includes(roleFilter))
    .filter(player => player.overall >= minOvr)
    .filter(player => !normalizedQuery || `${player.name} ${player.country} ${player.club} ${getFootballerRoles(player).join(" ")}`.toLocaleLowerCase().includes(normalizedQuery))
    .sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name)), [state.availableFootballers, active, typeFilter, roleFilter, minOvr, normalizedQuery]);

  const toggle = (player: Footballer) => {
    if (!editable) return;
    setDraft(current => current.includes(player.id) ? current.filter(id => id !== player.id) : [...current, player.id]);
  };
  const addType = (playerType: "CURRENT" | "ICON") => {
    if (!editable) return;
    const ids = state.availableFootballers.filter(player => (player.playerType ?? "CURRENT") === playerType).map(player => player.id);
    setDraft(current => [...new Set([...current, ...ids])]);
  };
  const selectAll = () => {
    if (!editable) return;
    setDraft(state.availableFootballers.map(player => player.id));
  };
  const autoBuild = () => {
    if (!isHost) return;
    setSaving(true);
    socket.emit("room:autoBuildPlayerPool", { code: state.code }, response => {
      setSaving(false);
      if (!response.ok) setError(response.error);
    });
  };
  const save = () => {
    if (!editable) { onClose(); return; }
    setSaving(true);
    socket.emit("room:updatePlayerPool", { code: state.code, selectedFootballerIds: draft }, response => {
      setSaving(false);
      if (!response.ok) setError(response.error); else onClose();
    });
  };
  const selectedCurrent = state.availableFootballers.filter(player => selectedSet.has(player.id) && (player.playerType ?? "CURRENT") === "CURRENT").length;
  const selectedIcons = state.availableFootballers.filter(player => selectedSet.has(player.id) && player.playerType === "ICON").length;
  const required = getMinimumFootballersRequired(state.settings.managerLimit, state.settings.squadSize, state.settings.substituteCount);

  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Select room footballers"><section className="pool-modal expanded-pool-modal"><header><div><div className="eyebrow">{editable ? "CUSTOM PLAYER DRAFT" : "PLAYER DATABASE"}</div><h2>{editable ? "Build your auction pool" : "Explore this room’s pool"}</h2><p>{editable ? "Combine current stars and football icons. The server checks uniqueness and positional balance before kickoff." : "Search the catalogue and inspect every eligible footballer. Switch the room to Custom to edit the selection."}</p></div><button className="modal-close" onClick={onClose}>×</button></header>
    <div className="pool-library-summary"><span>{editable ? "ELIGIBLE" : "SELECTED"} <b>{draft.length}</b></span><span>AUCTION QUEUE <b>{state.poolValidation.selected}</b></span><span>REQUIRED <b>{required}</b></span><span>CURRENT <b>{selectedCurrent}</b></span><span>ICONS <b>{selectedIcons}</b></span><span>SHOWING <b>{visible.length}</b></span></div>
    <div className="custom-pool-tools">
      <div className="position-tabs all-position-tabs"><button className={active === "ALL" ? "active" : ""} onClick={() => setActive("ALL")}><span>ALL</span><b>{draft.length}</b></button>{POSITIONS.map(position => <button className={active === position ? "active" : ""} key={position} onClick={() => setActive(position)}><span>{position}</span><b>{counts[position]}</b></button>)}</div>
      <input className="pool-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search player, country, club or position…" />
      <div className="pool-filter-row"><label><span>TYPE</span><select value={typeFilter} onChange={event => setTypeFilter(event.target.value as "ALL" | "CURRENT" | "ICON")}><option value="ALL">Current + Icons</option><option value="CURRENT">Current</option><option value="ICON">Icons</option></select></label><label><span>ROLE</span><select value={roleFilter} onChange={event => setRoleFilter(event.target.value as "ALL" | LineupRole)}><option value="ALL">All roles</option>{roles.map(role => <option value={role} key={role}>{role}</option>)}</select></label><label><span>MIN OVR · {minOvr}</span><input type="range" min="70" max="99" value={minOvr} onChange={event => setMinOvr(+event.target.value)} /></label></div>
      {isHost && <div className="custom-pool-actions"><button disabled={!editable || saving} onClick={selectAll}>Select All</button><button disabled={!editable || saving} onClick={() => addType("CURRENT")}>All Current</button><button disabled={!editable || saving} className="icon-action" onClick={() => addType("ICON")}>All Icons</button><button disabled={!editable || saving} onClick={() => setDraft([])}>Clear All</button><button disabled={saving} onClick={autoBuild}>Random Balanced</button></div>}
    </div>
    <div className="pool-grid custom-pool-grid">{visible.map(player => {
      const selected = selectedSet.has(player.id);
      const type = player.playerType ?? "CURRENT";
      const primaryRoles = getFootballerPrimaryRoles(player);
      const secondaryRoles = getFootballerSecondaryRoles(player);
      return <button type="button" disabled={!editable} onClick={() => toggle(player)} className={`pool-player ${selected ? "selected" : ""} ${type === "ICON" ? "icon-player" : ""}`} key={player.id}><FootballerPhoto player={player} compact /><span className="selection-mark">{selected ? "✓" : editable ? "+" : "·"}</span><div><div className="pool-player-heading"><strong>{player.name}</strong><span className={`player-type-chip ${type === "ICON" ? "icon" : "current"}`}>{type}</span></div><small>{player.country} • Primary {primaryRoles.join(" / ")}{secondaryRoles.length ? ` • Secondary ${secondaryRoles.join(" / ")}` : ""}</small><span>OVR {player.overall} • Opens {money(getOpeningBid(state.settings, player))}</span></div></button>;
    })}</div>
    <footer><div className={draft.length >= required ? "complete" : "incomplete"}>{draft.length >= required ? `✓ ${draft.length} selected · server will verify positional balance` : `Add at least ${required - draft.length} more footballer${required - draft.length === 1 ? "" : "s"}`}</div><div><button className="secondary" onClick={onClose}>Cancel</button>{isHost && <button className="primary" disabled={saving || (editable && draft.length === 0)} onClick={save}>{saving ? "Saving…" : editable ? "Save custom pool" : "Done"}</button>}</div></footer>
  </section></div>;
}

function FootballerPhoto({ player, compact = false }: { player: Footballer; compact?: boolean }) {
  const cacheKey = player.canonicalId ?? player.catalogId ?? player.id;
  const containerRef = useRef<HTMLDivElement>(null);
  const [photo, setPhoto] = useState<FootballerPhoto | undefined>(() => photoCache.get(cacheKey));
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(() => !compact || photoCache.has(cacheKey));

  useEffect(() => {
    if (!compact || visible || photoCache.has(cacheKey)) { setVisible(true); return; }
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "180px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cacheKey, compact, visible]);

  useEffect(() => {
    let active = true;
    const cached = photoCache.get(cacheKey);
    setPhoto(cached);
    setFailed(false);
    if (!cached && visible) {
      loadPhoto(player)
        .then(value => { if (active) setPhoto(value); })
        .catch(() => { if (active) setFailed(true); });
    }
    return () => { active = false; };
  }, [cacheKey, player, visible]);

  return <div ref={containerRef} className={`footballer-photo ${compact ? "compact" : ""}`}>{photo ? <><img key={photo.url} src={photo.url} alt={`${player.name} footballer`} loading={compact ? "lazy" : "eager"} decoding="async" referrerPolicy="no-referrer" draggable={false} /><a href={photo.descriptionUrl} target="_blank" rel="noreferrer" title={`${photo.credit} • ${photo.license}`}>©</a></> : <div className="photo-placeholder"><span>{player.position === "GK" ? "🧤" : "⚽"}</span><small>{failed ? "PHOTO UNAVAILABLE" : visible ? "LOADING PHOTO" : "PHOTO READY"}</small></div>}</div>;
}


function useCountdown(endsAt: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [endsAt]);
  return endsAt ? Math.max(0, (endsAt - now) / 1000) : 0;
}

const AuctionTimer = React.memo(function AuctionTimer({ endsAt, durationSeconds }: { endsAt: number | null; durationSeconds: number }) {
  const seconds = useCountdown(endsAt);
  const progress = clamp(seconds / Math.max(1, durationSeconds) * 100, 0, 100);
  return <div className="timer" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{Math.ceil(seconds)}</strong><span>SEC</span></div></div>;
});

const FormationClock = React.memo(function FormationClock({ endsAt }: { endsAt: number | null }) {
  const seconds = useCountdown(endsAt);
  return <div className="formation-clock"><span>LINEUP DEADLINE</span><b>{Math.floor(seconds / 60)}:{String(Math.ceil(seconds % 60)).padStart(2, "0")}</b></div>;
});

const PlayerCard = React.memo(function PlayerCard({ player, iconSurprise = false }: { player: Footballer; iconSurprise?: boolean }) {
  const primaryRoles = getFootballerPrimaryRoles(player);
  const secondaryRoles = getFootballerSecondaryRoles(player);
  const roles = [...primaryRoles, ...secondaryRoles];
  const type = player.playerType ?? "CURRENT";
  return <motion.div key={player.id} initial={{ opacity: 0, scale: .94, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: .45, ease: [0.22, 1, 0.36, 1] }} className={`player-card rarity-${player.rarity.toLowerCase()} ${type === "ICON" ? "player-type-icon" : "player-type-current"}`}>
    {type === "ICON" && iconSurprise && <div className="icon-surprise-banner">★ ICON ENTERS THE AUCTION</div>}
    <div className="card-top"><span>{type === "ICON" ? "ICON" : player.rarity}</span><b>{primaryRoles.join(" / ")}</b></div><div className="rating">{player.overall}</div><FootballerPhoto player={player} /><h2>{player.name}</h2><p>{player.country} · {type === "ICON" ? "Football legend" : "Current footballer"}</p><div className="player-type-line"><span className={`player-type-chip ${type === "ICON" ? "icon" : "current"}`}>{type}</span><span>PRIMARY {primaryRoles.join(" · ")}</span>{secondaryRoles.length > 0 && <span>SECONDARY {secondaryRoles.join(" · ")}</span>}</div><div className="player-roles" aria-label="Playable positions">{roles.map(role => <span className={primaryRoles.includes(role) ? "primary" : ""} key={role}>{role}</span>)}</div><div className="stats"><Stat value={player.pace} label="PAC" /><Stat value={player.shooting} label="SHO" /><Stat value={player.passing} label="PAS" /><Stat value={player.dribbling} label="DRI" /><Stat value={player.defending} label="DEF" /><Stat value={player.physical} label="PHY" /></div><div className="trait">✦ {player.trait}</div>
  </motion.div>;
});

function Stat({ value, label }: { value: number; label: string }) { return <div><b>{value}</b><span>{label}</span></div>; }

function squadPositionCounts(squad: SquadEntry[]): PoolTargets {
  const counts: PoolTargets = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  squad.forEach(entry => { counts[entry.footballer.position]++; });
  return counts;
}

const SquadTracker = React.memo(function SquadTracker({ squad, currentPosition, squadSize, substituteCount }: { squad: SquadEntry[]; currentPosition?: Position; squadSize: SquadSize; substituteCount: SubstituteCount }) {
  const [expanded, setExpanded] = useState(false);
  const counts = squadPositionCounts(squad);
  const targets = getSquadPositionTargets(getStartingLineupSize(squadSize));
  const completion = getSquadCompletion(squad, { squadSize, substituteCount });
  return <section className={`squad-tracker ${expanded ? "expanded" : ""}`}>
    <button className="tracker-head" onClick={() => setExpanded(value => !value)}><div><span>MY AUCTION SQUAD</span><strong>{squad.length}<i>/{completion.maxSquadSize}</i></strong></div><b>{expanded ? "−" : "+"}</b></button>
    <div className={`tracker-completion ${completion.startersComplete ? "starting-complete" : ""}`}><div><span>STARTERS</span><strong>{completion.completedStarters}/{completion.requiredStarters}</strong><small>{completion.startersComplete ? "Starting lineup complete ✓" : `${completion.startersRemaining} more needed`}</small></div><div><span>BENCH</span><strong>{completion.currentSubstitutes}/{completion.maxSubstitutes}</strong><small>{completion.maxSubstitutes ? "optional substitutes" : "no bench slots"}</small></div></div>
    <div className="position-tracker">{POSITIONS.map(position => {
      const remaining = Math.max(0, targets[position] - counts[position]);
      return <div className={`${currentPosition === position ? "current" : ""} ${remaining === 0 ? "complete" : ""}`} key={position}><span>{position}</span><strong>{counts[position]}<i>/{targets[position]}</i></strong><small>{remaining ? `${remaining} target` : "covered"}</small></div>;
    })}</div>
    {expanded && <div className="tracker-list">{squad.length ? squad.slice().reverse().map(entry => <div key={entry.footballer.id}><span>{entry.footballer.position}</span><b>{entry.footballer.name}</b><small>{entry.price}M</small></div>) : <p>No signings yet. Use the targets above to plan your bids.</p>}</div>}
  </section>;
});


function Arena({ socket, state, managerId, setError, leave }: { socket: GameSocket; state: RoomState; managerId: string; setError: (value: string) => void; leave: () => void }) {
  const me = state.managers.find(manager => manager.id === managerId)!;
  const myBudget = me.budget ?? 0;
  const [custom, setCustom] = useState("");
  const [sending, setSending] = useState(false);
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem("ae_compact") !== "0");
  const toggleCompactMode = () => setCompactMode(current => {
    const next = !current;
    localStorage.setItem("ae_compact", next ? "1" : "0");
    return next;
  });
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  const enterFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else await document.documentElement.requestFullscreen?.();
    } catch { /* fullscreen may not be supported or permitted */ }
  };
  const previousRound = useRef(state.roundIndex);
  useEffect(() => {
    if (previousRound.current !== state.roundIndex) {
      setSending(false);
      setCustom("");
      previousRound.current = state.roundIndex;
    }
  }, [state.roundIndex]);
  const openingBid = getOpeningBid(state.settings, state.currentFootballer);
  const minimum = state.currentBid === 0 ? openingBid : state.currentBid + state.settings.bidIncrement;
  const completion = getSquadCompletion(me.squad, state.settings);
  const maximumSquadSize = completion.maxSquadSize;
  const starterCount = completion.requiredStarters;
  const hasPassed = (state.passedManagerIds ?? []).includes(managerId);
  const leadingCurrentRound = state.phase === "auction" && state.highestBidderId === managerId;
  const canComplete = completion.canDeclareDone && !me.auctionComplete && !leadingCurrentRound;
  const cannotBid = sending || me.auctionComplete || hasPassed || !state.endsAt || completion.squadFull || myBudget < minimum;
  const doneHint = me.auctionComplete
    ? "You are finished bidding. Watching the remaining auction."
    : !completion.startersComplete
      ? `Need ${completion.startersRemaining} more starting player${completion.startersRemaining === 1 ? "" : "s"}.`
      : leadingCurrentRound
        ? "Finish the current auction round before leaving bidding."
        : "Starting lineup complete — keep bidding for optional substitutes/upgrades or finish now.";
  const passOnPlayer = () => {
    if (hasPassed || !state.endsAt) return;
    setSending(true);
    socket.emit("auction:pass", { code: state.code, roundId: state.roundId, requestId: crypto.randomUUID() }, response => {
      setSending(false);
      if (!response.ok) setError(response.error);
    });
  };
  const completeSquad = () => {
    if (!canComplete || sending) return;
    const confirmed = window.confirm(`Finish bidding?\n\nYour starting lineup is complete.\nStarters: ${completion.completedStarters}/${completion.requiredStarters}\nSubstitutes: ${completion.currentSubstitutes}/${completion.maxSubstitutes}\n\nYou will not be able to bid on more players.`);
    if (!confirmed) return;
    setSending(true);
    socket.emit("auction:complete", { code: state.code }, response => {
      setSending(false);
      if (!response.ok) setError(response.error);
    });
  };
  const actualBid = (amount: number) => {
    if (!state.currentFootballer || sending) return;
    setSending(true);
    socket.emit("auction:bid", { code: state.code, amount, requestId: crypto.randomUUID(), roundId: state.roundId }, response => {
      setSending(false);
      if (!response.ok) setError(response.error);
      else setCustom("");
    });
  };
  const quitSolo = () => leave();
  if (state.phase === "round_result") return <RoundResult state={state} />;
  return <main className={`arena page ${compactMode ? "compact-mode" : "comfortable-mode"}`}><div className="arena-top"><div><span>ROOM {state.code}</span><b>ROUND {state.roundIndex + 1}/{state.totalRounds}</b></div><div className="arena-controls"><div className="live"><i /> LIVE AUCTION</div><div className="secure-badge" title="Budgets and bids are validated by the server">🔒 SERVER SECURE</div><button type="button" onClick={enterFullscreen}>⛶ {isFullscreen ? "EXIT FULLSCREEN" : "FULLSCREEN"}</button><button type="button" onClick={toggleCompactMode}>{compactMode ? "COMFORT" : "COMPACT"}</button><button aria-label="Send fire reaction" onClick={() => socket.emit("room:reaction", { code: state.code, reaction: "🔥" })}>🔥</button>{state.isSolo && <button className="quit-match" onClick={quitSolo}>QUIT MATCH</button>}</div></div>
    <div className="arena-grid"><div className="arena-left-stack"><SquadTracker squad={me.squad} currentPosition={state.currentFootballer?.position} squadSize={state.settings.squadSize} substituteCount={state.settings.substituteCount} /><aside className="panel manager-board"><h3>ROOM SQUADS</h3>{state.managers.map(manager => <div className={`manager-line ${manager.id === state.highestBidderId ? "leading" : ""} ${manager.id === managerId ? "you" : ""}`} key={manager.id}><span className="mini-avatar">{manager.avatar}</span><div><b>{manager.name}</b><small>{manager.auctionComplete ? "DONE ✓" : `${getSquadCompletion(manager.squad, state.settings).completedStarters}/${starterCount} starters · ${manager.squad.length}/${maximumSquadSize} squad`}</small></div><strong className={manager.id === managerId ? "own-budget" : "private-budget"}>{manager.id === managerId ? money(myBudget) : "PRIVATE"}</strong></div>)}</aside></div>
      <section className="auction-stage">{state.currentFootballer && <PlayerCard player={state.currentFootballer} iconSurprise={state.settings.playerPoolMode === "mixed" && state.settings.iconSurprise} />}<div className="auction-meta"><AuctionTimer endsAt={state.endsAt} durationSeconds={state.settings.auctionSeconds} /><div className="current-price"><span>{state.currentBid ? "CURRENT BID" : state.settings.pricingMode === "ovr_scaled" ? "OVR OPENING PRICE" : "OPENING BID"}</span><strong>{money(state.currentBid || openingBid)}</strong><p>{state.highestBidderId ? `${state.managers.find(manager => manager.id === state.highestBidderId)?.name} leads` : state.settings.pricingMode === "ovr_scaled" ? `${state.currentFootballer?.overall ?? "—"} OVR value mode` : "Normal price mode"}</p></div></div></section>
      <aside className="panel bid-feed"><h3>BID FEED</h3>{state.bidHistory.length === 0 ? <div className="empty-feed">No bids yet.<br />Make the first move.</div> : state.bidHistory.map((bid, index) => <div className={`feed-row ${index === 0 ? "latest" : ""}`} key={bid.id}><span>{bid.managerName}</span><b>{money(bid.amount)}</b></div>)}</aside></div>
    <div className="bid-dock"><div className="budget-read"><span>YOUR BUDGET</span><b>{money(myBudget)}</b><small>STARTERS {completion.completedStarters}/{completion.requiredStarters} · SUBS {completion.currentSubstitutes}/{completion.maxSubstitutes} · {completion.squadFull ? "SQUAD FULL" : `${Math.max(0, maximumSquadSize - me.squad.length)} squad spots open`}</small></div><div className="quick-bids"><button disabled={cannotBid} onClick={() => actualBid(minimum)}>BID {money(minimum)}</button><button disabled={cannotBid || myBudget < minimum + 5} onClick={() => actualBid(minimum + 5)}>+5M</button><button disabled={cannotBid || myBudget < minimum + 10} onClick={() => actualBid(minimum + 10)}>+10M</button><button type="button" className={`pass-player ${hasPassed ? "passed" : ""}`} disabled={sending || me.auctionComplete || hasPassed || !state.endsAt || completion.squadFull || myBudget < openingBid} onClick={passOnPlayer}>{hasPassed ? "PASSED · WAITING" : "PASS PLAYER"}</button><div className="done-control"><button type="button" className={`complete-auction ${me.auctionComplete ? "done" : ""}`} disabled={sending || !canComplete} onClick={completeSquad}>{me.auctionComplete ? "DONE ✓" : "I'M DONE"}</button><small className={completion.startersComplete ? "ready" : "locked"}>{doneHint}</small></div></div><form className="custom-bid" onSubmit={event => { event.preventDefault(); if (custom) actualBid(+custom); }}><input inputMode="numeric" enterKeyHint="send" aria-label="Custom bid amount" value={custom} onChange={event => setCustom(event.target.value.replace(/\D/g, ""))} placeholder="CUSTOM BID" /><button type="submit" disabled={cannotBid || !custom || +custom > myBudget}>PLACE</button></form></div></main>;
}

function RoundResult({ state }: { state: RoomState }) {
  const label = state.lastWinner?.automatic ? "AUTO SIGNED" : state.lastWinner ? "SOLD!" : state.settings.reauctionUnsold ? "UNSOLD · LATER ROUND" : "SKIPPED";
  return <main className="round-result"><div className="result-burst">{label}</div>{state.lastWinner ? <><div className="winner-avatar">{state.lastWinner.automatic ? "⚙️" : "🏆"}</div><h1>{state.lastWinner.footballerName}</h1><p>{state.lastWinner.automatic ? "assigned to complete the squad of" : "joins"} <strong>{state.lastWinner.managerName}</strong></p><div className="sold-price">{money(state.lastWinner.amount)}</div></> : <><h1>No manager bid</h1><p>{state.settings.reauctionUnsold ? "This footballer may return after the normal auction pool ends." : "This footballer is removed from this match."}</p></>}<div className="loading-bar"><i /></div></main>;
}

function rolePosition(role: LineupRole): Position {
  if (role === "GK") return "GK";
  if (["LB", "CB", "RB", "LWB", "RWB"].includes(role)) return "DEF";
  if (["CDM", "CM", "CAM", "LM", "RM"].includes(role)) return "MID";
  return "FWD";
}

function clientRoleScore(player: Footballer, role: LineupRole): number {
  const required = rolePosition(role);
  const roles = getFootballerRoles(player);
  const position = getFootballerPrimaryRoles(player).includes(role) ? 100 : roles.includes(role) ? 98 : player.position === required ? 72 : player.secondary.includes(required) ? 58 : 22;
  let ability = player.overall;
  if (role === "GK") ability = player.goalkeeping;
  else if (["LB", "CB", "RB", "LWB", "RWB"].includes(role)) ability = player.defending * .45 + player.physical * .25 + player.pace * .18 + player.passing * .12;
  else if (["CDM", "CM", "CAM", "LM", "RM"].includes(role)) ability = player.passing * .34 + player.dribbling * .24 + player.physical * .16 + player.defending * .13 + player.shooting * .13;
  else ability = player.shooting * .38 + player.pace * .27 + player.dribbling * .22 + player.passing * .13;
  return ability * .68 + position * .32;
}

function autoArrange(squad: SquadEntry[], formation: FormationDefinition): Record<string, string> {
  const remaining = new Map(squad.map(entry => [entry.footballer.id, entry.footballer]));
  const picks: Record<string, string> = {};
  const ordered = [...formation.slots].sort((a, b) => (a.role === "GK" ? -1 : 0) - (b.role === "GK" ? -1 : 0));
  for (const formationSlot of ordered) {
    const selected = [...remaining.values()].sort((a, b) => clientRoleScore(b, formationSlot.role) - clientRoleScore(a, formationSlot.role) || b.overall - a.overall)[0];
    if (!selected) continue;
    picks[formationSlot.id] = selected.id;
    remaining.delete(selected.id);
  }
  return picks;
}

function FormationRoom({ socket, state, managerId, setError, leave }: { socket: GameSocket; state: RoomState; managerId: string; setError: (value: string) => void; leave: () => void }) {
  const me = state.managers.find(manager => manager.id === managerId)!;
  const starterTarget = getStartingLineupSize(state.settings.squadSize);
  const substituteTarget = Math.max(0, me.squad.length - starterTarget);
  const validFormations = useMemo(() => FORMATIONS.filter(item => item.slots.length === starterTarget), [starterTarget]);
  const savedFormation = me.formationId ? FORMATION_BY_ID.get(me.formationId) : undefined;
  const initialFormation = savedFormation?.slots.length === starterTarget ? savedFormation.id : validFormations[0]!.id;
  const [formationId, setFormationId] = useState(initialFormation);
  const [picks, setPicks] = useState<Record<string, string>>(() => me.lineup.length ? Object.fromEntries(me.lineup.map(item => [item.slotId, item.footballerId])) : autoArrange(me.squad, FORMATION_BY_ID.get(initialFormation)!));
  const [submitting, setSubmitting] = useState(false);
  const [draggingPlayer, setDraggingPlayer] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const formation = FORMATION_BY_ID.get(formationId) ?? validFormations[0]!;
  const playerMap = useMemo(() => new Map(me.squad.map(entry => [entry.footballer.id, entry.footballer])), [me.squad]);
  const draftKey = `ae_formation_${state.code}_${managerId}`;
  const restoredDraft = useRef(false);
  const picksRef = useRef(picks);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pointerDrag = useRef<{
    id: string;
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    active: boolean;
    timer: number | null;
    element: HTMLElement;
  } | null>(null);
  const animationFrame = useRef<number | null>(null);
  const latestPointer = useRef({ x: 0, y: 0, pointerType: "touch" });
  const hoverTarget = useRef<HTMLElement | null>(null);
  const suppressTapUntil = useRef(0);

  useEffect(() => { picksRef.current = picks; }, [picks]);

  useEffect(() => {
    if (restoredDraft.current || me.lineupSubmitted) return;
    restoredDraft.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null") as { formationId?: string; picks?: Record<string, string> } | null;
      const storedFormation = saved?.formationId ? FORMATION_BY_ID.get(saved.formationId) : undefined;
      if (storedFormation?.slots.length === starterTarget && saved?.picks) {
        const validPicks = Object.fromEntries(Object.entries(saved.picks).filter(([slotId, footballerId]) => storedFormation.slots.some(slot => slot.id === slotId) && playerMap.has(footballerId)));
        picksRef.current = validPicks;
        setFormationId(storedFormation.id);
        setPicks(validPicks);
      }
    } catch { localStorage.removeItem(draftKey); }
  }, [draftKey, me.lineupSubmitted, playerMap, starterTarget]);

  useEffect(() => {
    if (!me.lineupSubmitted) localStorage.setItem(draftKey, JSON.stringify({ formationId, picks }));
  }, [draftKey, formationId, picks, me.lineupSubmitted]);

  const lineupIds = useMemo(() => new Set(Object.values(picks)), [picks]);
  const substitutes = useMemo(() => me.squad.filter(entry => !lineupIds.has(entry.footballer.id)), [lineupIds, me.squad]);
  const selectedManagerCount = state.managers.filter(manager => manager.lineupSubmitted).length;
  const roleForSlot = React.useCallback((slotId: string) => formation.slots.find(item => item.id === slotId)?.role, [formation.slots]);
  const canUseInSlot = React.useCallback((footballerId: string, slotId: string) => {
    const player = playerMap.get(footballerId);
    const slotRole = roleForSlot(slotId);
    if (!player || !slotRole) return false;
    return slotRole === "GK" ? player.position === "GK" : player.position !== "GK";
  }, [playerMap, roleForSlot]);
  const findPlayerSlot = React.useCallback((footballerId: string, draft = picksRef.current) => Object.entries(draft).find(([, id]) => id === footballerId)?.[0], []);

  const commitPicks = React.useCallback((next: Record<string, string>) => {
    picksRef.current = next;
    setPicks(next);
  }, []);

  const chooseFormation = (nextId: string) => {
    const next = FORMATION_BY_ID.get(nextId);
    if (!next || next.slots.length !== starterTarget) return;
    const arranged = autoArrange(me.squad, next);
    picksRef.current = arranged;
    setSelectedPlayerId(null);
    setFormationId(nextId);
    setPicks(arranged);
  };

  /** One atomic draft update for starter↔starter, bench→starter, or empty-slot moves. */
  const movePlayerToSlot = React.useCallback((footballerId: string, targetSlotId: string): boolean => {
    if (!canUseInSlot(footballerId, targetSlotId)) {
      setError(roleForSlot(targetSlotId) === "GK" ? "Only a goalkeeper can fill the GK slot." : "Goalkeepers cannot be placed in outfield positions.");
      return false;
    }
    const current = picksRef.current;
    const sourceSlot = findPlayerSlot(footballerId, current);
    if (sourceSlot === targetSlotId) return true;
    const targetPlayer = current[targetSlotId];
    if (sourceSlot && targetPlayer && !canUseInSlot(targetPlayer, sourceSlot)) {
      setError("The player in the target slot cannot move into the vacated position.");
      return false;
    }

    const next = { ...current };
    if (sourceSlot) delete next[sourceSlot];
    // Defensive duplicate cleanup: a player can only exist in one logical slot.
    for (const [slotId, id] of Object.entries(next)) if (id === footballerId) delete next[slotId];
    next[targetSlotId] = footballerId;
    if (sourceSlot && targetPlayer) next[sourceSlot] = targetPlayer;
    commitPicks(next);
    navigator.vibrate?.(18);
    return true;
  }, [canUseInSlot, commitPicks, findPlayerSlot, roleForSlot, setError]);

  /** Atomic starter↔substitute swap. The starter never disappears for an intermediate render. */
  const swapStarterWithBenchPlayer = React.useCallback((starterId: string, benchPlayerId: string): boolean => {
    const current = picksRef.current;
    const sourceSlot = findPlayerSlot(starterId, current);
    if (!sourceSlot || findPlayerSlot(benchPlayerId, current)) return false;
    if (!canUseInSlot(benchPlayerId, sourceSlot)) {
      setError(roleForSlot(sourceSlot) === "GK" ? "Only a goalkeeper can replace the goalkeeper." : "A goalkeeper cannot replace an outfield starter.");
      return false;
    }
    const next = { ...current, [sourceSlot]: benchPlayerId };
    commitPicks(next);
    navigator.vibrate?.(18);
    return true;
  }, [canUseInSlot, commitPicks, findPlayerSlot, roleForSlot, setError]);

  const handlePlayerTap = React.useCallback((footballerId: string) => {
    if (performance.now() < suppressTapUntil.current || me.lineupSubmitted) return;
    const selected = selectedPlayerId;
    if (!selected) { setSelectedPlayerId(footballerId); return; }
    if (selected === footballerId) { setSelectedPlayerId(null); return; }

    const selectedSlot = findPlayerSlot(selected);
    const clickedSlot = findPlayerSlot(footballerId);
    let moved = false;
    if (clickedSlot) moved = movePlayerToSlot(selected, clickedSlot);
    else if (selectedSlot) moved = movePlayerToSlot(footballerId, selectedSlot);
    if (moved) setSelectedPlayerId(null);
    else if (!selectedSlot && !clickedSlot) setSelectedPlayerId(footballerId);
  }, [findPlayerSlot, me.lineupSubmitted, movePlayerToSlot, selectedPlayerId]);

  const clearHoverTarget = React.useCallback(() => {
    if (!hoverTarget.current) return;
    hoverTarget.current.classList.remove("drag-hover-valid", "drag-hover-invalid", "drag-hover-secondary");
    hoverTarget.current = null;
  }, []);

  const dropTargetAt = React.useCallback((x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-slot-id], [data-bench-player-id], [data-bench-drop]") ?? null, []);

  const dropTargetValidity = React.useCallback((footballerId: string, target: HTMLElement | null): "valid" | "secondary" | "invalid" => {
    if (!target) return "invalid";
    if (target.dataset.slotId) {
      if (!canUseInSlot(footballerId, target.dataset.slotId)) return "invalid";
      const player = playerMap.get(footballerId);
      const role = roleForSlot(target.dataset.slotId);
      if (!player || !role) return "invalid";
      return getFootballerPrimaryRoles(player).includes(role) ? "valid" : getFootballerRoles(player).includes(role) ? "secondary" : "valid";
    }
    if (target.dataset.benchPlayerId) {
      const sourceSlot = findPlayerSlot(footballerId);
      return sourceSlot && canUseInSlot(target.dataset.benchPlayerId, sourceSlot) ? "valid" : "invalid";
    }
    if (target.hasAttribute("data-bench-drop")) {
      const sourceSlot = findPlayerSlot(footballerId);
      return sourceSlot && substitutes.length === 1 && canUseInSlot(substitutes[0]!.footballer.id, sourceSlot) ? "valid" : "invalid";
    }
    return "invalid";
  }, [canUseInSlot, findPlayerSlot, playerMap, roleForSlot, substitutes]);

  const paintHoverTarget = React.useCallback((footballerId: string, target: HTMLElement | null) => {
    if (hoverTarget.current === target) return;
    clearHoverTarget();
    if (!target) return;
    const validity = dropTargetValidity(footballerId, target);
    target.classList.add(validity === "valid" ? "drag-hover-valid" : validity === "secondary" ? "drag-hover-secondary" : "drag-hover-invalid");
    hoverTarget.current = target;
  }, [clearHoverTarget, dropTargetValidity]);

  const updateDragVisual = React.useCallback(() => {
    animationFrame.current = null;
    const drag = pointerDrag.current;
    if (!drag?.active) return;
    const { x, y, pointerType } = latestPointer.current;
    const yOffset = pointerType === "touch" ? 68 : pointerType === "pen" ? 44 : 22;
    if (overlayRef.current) overlayRef.current.style.transform = `translate3d(${x}px, ${y - yOffset}px, 0) translate(-50%, -50%)`;
    paintHoverTarget(drag.id, dropTargetAt(x, y));
  }, [dropTargetAt, paintHoverTarget]);

  const scheduleDragVisual = React.useCallback((x: number, y: number, pointerType: string) => {
    latestPointer.current = { x, y, pointerType };
    if (animationFrame.current === null) animationFrame.current = window.requestAnimationFrame(updateDragVisual);
  }, [updateDragVisual]);

  const cleanupPointerDrag = React.useCallback(() => {
    const drag = pointerDrag.current;
    if (drag?.timer !== null && drag?.timer !== undefined) window.clearTimeout(drag.timer);
    pointerDrag.current = null;
    if (animationFrame.current !== null) window.cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
    clearHoverTarget();
    document.body.classList.remove("formation-dragging");
    setDraggingPlayer(null);
    if (drag?.element) {
      try { if (drag.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId); } catch { /* pointer already released */ }
    }
  }, [clearHoverTarget]);

  const activatePointerDrag = React.useCallback((drag: NonNullable<typeof pointerDrag.current>, x: number, y: number) => {
    if (drag.active || pointerDrag.current !== drag) return;
    drag.active = true;
    if (drag.timer !== null) window.clearTimeout(drag.timer);
    drag.timer = null;
    try { drag.element.setPointerCapture(drag.pointerId); } catch { /* implicit capture is sufficient on some browsers */ }
    setSelectedPlayerId(null);
    setDraggingPlayer(drag.id);
    document.body.classList.add("formation-dragging");
    scheduleDragVisual(x, y, drag.pointerType);
    navigator.vibrate?.(12);
  }, [scheduleDragVisual]);

  const performDrop = React.useCallback((footballerId: string, x: number, y: number) => {
    const target = dropTargetAt(x, y);
    if (!target) return false;
    if (target.dataset.slotId) return movePlayerToSlot(footballerId, target.dataset.slotId);
    if (target.dataset.benchPlayerId) return swapStarterWithBenchPlayer(footballerId, target.dataset.benchPlayerId);
    if (target.hasAttribute("data-bench-drop")) {
      const sourceSlot = findPlayerSlot(footballerId);
      if (!sourceSlot) return false;
      if (substitutes.length === 1) return swapStarterWithBenchPlayer(footballerId, substitutes[0]!.footballer.id);
      if (substitutes.length > 1) setError("Drop onto the substitute you want to swap with.");
    }
    return false;
  }, [dropTargetAt, findPlayerSlot, movePlayerToSlot, setError, substitutes, swapStarterWithBenchPlayer]);

  const beginPointerDrag = React.useCallback((event: React.PointerEvent<HTMLElement>, footballerId: string) => {
    if (me.lineupSubmitted || (event.pointerType === "mouse" && event.button !== 0)) return;
    cleanupPointerDrag();
    const element = event.currentTarget;
    const drag = {
      id: footballerId,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      timer: null as number | null,
      element
    };
    pointerDrag.current = drag;
    if (event.pointerType === "mouse") {
      try { element.setPointerCapture(event.pointerId); } catch { /* optional */ }
    } else {
      const holdDelay = event.pointerType === "pen" ? 80 : 120;
      drag.timer = window.setTimeout(() => activatePointerDrag(drag, drag.startX, drag.startY), holdDelay);
    }
  }, [activatePointerDrag, cleanupPointerDrag, me.lineupSubmitted]);

  const onPointerMove = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = pointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.active) {
      if (drag.pointerType === "mouse" && distance >= 3) activatePointerDrag(drag, event.clientX, event.clientY);
      else if (drag.pointerType !== "mouse" && distance > 11) {
        if (drag.timer !== null) window.clearTimeout(drag.timer);
        pointerDrag.current = null;
        return;
      }
    }
    if (drag.active) {
      event.preventDefault();
      scheduleDragVisual(event.clientX, event.clientY, drag.pointerType);
    }
  }, [activatePointerDrag, scheduleDragVisual]);

  const onPointerUp = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = pointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.timer !== null) window.clearTimeout(drag.timer);
    if (drag.active) {
      event.preventDefault();
      performDrop(drag.id, event.clientX, event.clientY);
      suppressTapUntil.current = performance.now() + 320;
    }
    cleanupPointerDrag();
  }, [cleanupPointerDrag, performDrop]);

  const onPointerCancel = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (pointerDrag.current?.pointerId === event.pointerId) cleanupPointerDrag();
  }, [cleanupPointerDrag]);

  useEffect(() => {
    const cancel = () => cleanupPointerDrag();
    const onVisibilityChange = () => { if (document.visibilityState !== "visible") cancel(); };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cancel();
    };
  }, [cleanupPointerDrag]);

  const dragProps = (footballerId: string) => ({
    draggable: false,
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => beginPointerDrag(event, footballerId),
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => event.preventDefault(),
    onClick: (event: React.MouseEvent<HTMLElement>) => { event.stopPropagation(); handlePlayerTap(footballerId); }
  });

  const submit = () => {
    const lineupPicks = formation.slots.map(item => ({ slotId: item.id, footballerId: picks[item.id] ?? "" }));
    if (lineupPicks.some(item => !item.footballerId)) { setError("Every formation slot needs a starting player."); return; }
    setSubmitting(true);
    socket.emit("lineup:submit", { code: state.code, formationId, picks: lineupPicks }, response => {
      setSubmitting(false);
      if (!response.ok) setError(response.error);
      else localStorage.removeItem(draftKey);
    });
  };
  const quitSolo = () => leave();

  if (me.lineupSubmitted) return <main className="formation-wait page"><div className="formation-wait-card"><div className="formation-check">✓</div><div className="eyebrow">LINEUP LOCKED</div><h1>{FORMATION_BY_ID.get(me.formationId ?? "")?.name}</h1><p>Your {starterTarget}-player formation{substituteTarget ? ` and ${substituteTarget} substitute${substituteTarget === 1 ? "" : "s"}` : ""} are ready. Waiting for the remaining managers.</p><div className="submission-progress"><span>{selectedManagerCount}/{state.managers.length} submitted</span><i><b style={{ width: `${selectedManagerCount / state.managers.length * 100}%` }} /></i></div><div className="formation-manager-status">{state.managers.map(manager => <span className={manager.lineupSubmitted ? "done" : ""} key={manager.id}>{manager.avatar} {manager.name} <b>{manager.lineupSubmitted ? "READY" : "CHOOSING"}</b></span>)}</div>{state.isSolo && <button className="danger-outline" onClick={quitSolo}>Quit Solo Match</button>}</div></main>;

  const dragged = draggingPlayer ? playerMap.get(draggingPlayer) : null;
  return <main className="formation-page page"><header className="formation-header"><div><div className="eyebrow">POST-AUCTION TEAM SETUP</div><h1>Choose formation & assemble your team</h1><p>Tap two players to swap, or drag with mouse, touch, or stylus. Primary and supported roles receive the best rating.</p></div><FormationClock endsAt={state.formationEndsAt} /></header>
    <div className="formation-layout"><aside className="panel formation-list"><div className="panel-title"><h2>Formations</h2><span>{validFormations.length} OPTIONS</span></div><div className="formation-options">{validFormations.map(item => <button className={formationId === item.id ? "active" : ""} onClick={() => chooseFormation(item.id)} key={item.id}><b>{item.name}</b><span>{item.style}</span></button>)}</div></aside>
      <section className="lineup-center"><div className="lineup-toolbar"><div><span>SELECTED SYSTEM</span><strong>{formation.name}</strong><em>{formation.style}</em></div><button onClick={() => { const arranged = autoArrange(me.squad, formation); picksRef.current = arranged; setSelectedPlayerId(null); setPicks(arranged); }}>AUTO ARRANGE</button></div><div className="tactical-pitch">{formation.slots.map(formationSlot => {
        const player = playerMap.get(picks[formationSlot.id] ?? "");
        const fit = player ? getRoleFitLabel(player, formationSlot.role) : null;
        const selected = player ? selectedPlayerId === player.id : false;
        return <button type="button" data-slot-id={formationSlot.id} onClick={() => { if (selectedPlayerId && !player) { if (movePlayerToSlot(selectedPlayerId, formationSlot.id)) setSelectedPlayerId(null); } }} className={`pitch-player ${draggingPlayer ? (canUseInSlot(draggingPlayer, formationSlot.id) ? "drag-target drag-valid" : "drag-target drag-invalid") : ""}`} style={{ left: `${formationSlot.x}%`, top: `${formationSlot.y}%` }} key={formationSlot.id}><span className="role-badge">{formationSlot.role}</span>{draggingPlayer && <span className="drag-preview">{Math.round(clientRoleScore(playerMap.get(draggingPlayer)!, formationSlot.role))}</span>}{player ? <div {...dragProps(player.id)} className={`pitch-player-content formation-drag-card ${selected ? "selected" : ""}`} key={player.id}><FootballerPhoto key={player.id} player={player} compact /><strong>{player.name.split(" ").at(-1)}</strong><small><b>{getFootballerPrimaryRoles(player).join("/")}</b>{getFootballerSecondaryRoles(player).length ? ` · ${getFootballerSecondaryRoles(player).join("/")}` : ""} · {player.overall} OVR</small><em className={`fit-${fit?.toLowerCase().replaceAll(" ", "-")}`}>{fit}</em><i className="drag-grip" aria-hidden="true">⋮⋮</i></div> : <b>+</b>}</button>;
      })}</div><div className="assembly-note">Tap a player then tap another to swap. Dragging uses a lightweight overlay, so the full lineup is updated only once when you drop.</div></section>
      <aside className={`panel bench-panel ${draggingPlayer ? "is-dragging" : ""}`} data-bench-drop><div className="panel-title"><h2>{substituteTarget ? "Substitutes" : "Squad"}</h2><span>{substitutes.length}/{substituteTarget}</span></div><div className="bench-list">{substitutes.length ? substitutes.map(entry => <button {...dragProps(entry.footballer.id)} type="button" data-bench-player-id={entry.footballer.id} className={`formation-drag-card ${selectedPlayerId === entry.footballer.id ? "selected" : ""}`} key={entry.footballer.id}><FootballerPhoto key={entry.footballer.id} player={entry.footballer} compact /><div><strong>{entry.footballer.name}</strong><span><b>{getFootballerPrimaryRoles(entry.footballer).join("/")}</b>{getFootballerSecondaryRoles(entry.footballer).length ? ` · ${getFootballerSecondaryRoles(entry.footballer).join("/")}` : ""} · {entry.footballer.overall} OVR</span></div><i className="drag-grip" aria-hidden="true">⋮⋮</i></button>) : <div className="no-subs">No substitutes are currently available.</div>}</div><div className="lineup-summary"><span>Starters</span><b>{Object.values(picks).length}/{starterTarget}</b><span>Substitutes</span><b>{substitutes.length}/{substituteTarget}</b></div><button className="primary submit-lineup" disabled={submitting || Object.values(picks).length !== starterTarget || substitutes.length !== substituteTarget} onClick={submit}>{submitting ? "LOCKING…" : "READY · LOCK LINEUP"}</button>{state.isSolo && <button className="danger-outline" onClick={quitSolo}>Quit Solo Match</button>}</aside></div>
    {dragged && <div ref={overlayRef} className="touch-drag-ghost formation-drag-overlay"><FootballerPhoto player={dragged} compact /><div><b>{getFootballerPrimaryRoles(dragged).join("/")}</b><span>{dragged.name}</span></div><em>{dragged.overall}</em></div>}
  </main>;
}
function RoomChat({ socket, state, managerId, setError }: { socket: GameSocket; state: RoomState; managerId: string; setError: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const closeChat = useBackClosable(open, () => setOpen(false), "room-chat");
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [unread, setUnread] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | null>(null);
  const remoteTypingTimers = useRef(new Map<string, number>());
  const previousCount = useRef(state.chatMessages?.length ?? 0);
  const messages = state.chatMessages ?? [];

  useEffect(() => {
    const handleTyping = (payload: { managerId: string; managerName: string; isTyping: boolean }) => {
      if (payload.managerId === managerId) return;
      const previous = remoteTypingTimers.current.get(payload.managerId);
      if (previous) window.clearTimeout(previous);
      setTypingNames(current => payload.isTyping ? [...new Set([...current, payload.managerName])] : current.filter(name => name !== payload.managerName));
      if (payload.isTyping) {
        const timer = window.setTimeout(() => setTypingNames(current => current.filter(name => name !== payload.managerName)), 1800);
        remoteTypingTimers.current.set(payload.managerId, timer);
      }
    };
    socket.on("chat:typing", handleTyping);
    return () => {
      socket.off("chat:typing", handleTyping);
      remoteTypingTimers.current.forEach(timer => window.clearTimeout(timer));
    };
  }, [socket, managerId]);

  useEffect(() => {
    const currentCount = messages.length;
    if (currentCount > previousCount.current && !open) setUnread(value => value + currentCount - previousCount.current);
    previousCount.current = currentCount;
    if (open) {
      setUnread(0);
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 20);
    }
  }, [messages.length, open]);

  useEffect(() => () => {
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    socket.emit("chat:typing", { code: state.code, isTyping: false });
  }, [socket, state.code]);

  const notifyTyping = (value: string) => {
    setDraft(value);
    socket.emit("chat:typing", { code: state.code, isTyping: value.trim().length > 0 });
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => socket.emit("chat:typing", { code: state.code, isTyping: false }), 1100);
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    socket.emit("chat:send", { code: state.code, text }, response => {
      if (!response.ok) { setError(response.error); return; }
      setDraft("");
      setEmojiOpen(false);
      socket.emit("chat:typing", { code: state.code, isTyping: false });
      textareaRef.current?.focus();
    });
  };

  const addEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draft.length;
    const end = textarea?.selectionEnd ?? start;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    notifyTyping(next);
    window.setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  };

  return <div className={`room-chat phase-${state.phase} ${open ? "open" : ""}`}>
    {open && <section className="chat-window" aria-label="Room chat">
      <header><div><span>ROOM CHAT</span><strong>Auction Eleven</strong></div><div className="chat-online"><i />{state.managers.filter(manager => manager.connected).length} online</div><button aria-label="Close chat" onClick={() => { setEmojiOpen(false); closeChat(); }}>×</button></header>
      <div className="chat-messages" aria-live="polite">{messages.length === 0 ? <div className="chat-empty"><span>💬</span><b>Start the room conversation</b><p>Use the full keyboard, press Enter to send, or add an emoji.</p></div> : messages.map(message => {
        const own = message.managerId === managerId;
        return <div className={`chat-row ${own ? "own" : ""}`} key={message.id}>{!own && <span className="chat-avatar">{message.avatar}</span>}<div className="chat-bubble">{!own && <b>{message.managerName}</b>}<p>{message.text}</p><small>{new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{own ? " ✓" : ""}</small></div></div>;
      })}<div ref={bottomRef} /></div>
      <div className="typing-line">{typingNames.length ? `${typingNames.slice(0, 2).join(" and ")} ${typingNames.length > 1 ? "are" : "is"} typing…` : ""}</div>
      {emojiOpen && <div className="emoji-picker" role="toolbar" aria-label="Emoji picker">{CHAT_EMOJIS.map(emoji => <button type="button" onClick={() => addEmoji(emoji)} aria-label={`Add ${emoji}`} key={emoji}>{emoji}</button>)}</div>}
      <footer><button className={`emoji-toggle ${emojiOpen ? "active" : ""}`} aria-label="Toggle emoji picker" onClick={() => setEmojiOpen(value => !value)}>☺</button><textarea ref={textareaRef} rows={1} maxLength={300} value={draft} onChange={event => notifyTyping(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } else if (event.key === "Escape") { setEmojiOpen(false); } }} placeholder="Type a message" aria-label="Chat message" /><button className="chat-send" aria-label="Send message" disabled={!draft.trim()} onClick={send}>➤</button></footer>
      <div className="chat-hint"><span>Enter to send</span><span>Shift + Enter for a new line</span><b>{draft.length}/300</b></div>
    </section>}
    <button className="chat-launcher" aria-label={open ? "Close room chat" : "Open room chat"} onClick={() => open ? closeChat() : setOpen(true)}><span>{open ? "×" : "💬"}</span>{!open && unread > 0 && <b>{Math.min(unread, 99)}</b>}</button>
  </div>;
}

function Results({ state, managerId, leave }: { state: RoomState; managerId: string; leave: () => void }) {
  useEffect(() => {
    releaseDocumentScrollLock();
    const page = document.querySelector<HTMLElement>("[data-results-scroll]");
    const frame = window.requestAnimationFrame(() => {
      page?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      page?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      releaseDocumentScrollLock();
    };
  }, []);

  const winner = state.rankings[0];
  const starterCount = getStartingLineupSize(state.settings.squadSize);
  const podium = state.rankings.slice(0, 3);
  const podiumOrder = [podium[1], podium[0], podium[2]].filter((item): item is NonNullable<typeof item> => !!item);
  return <main className="results page results-scroll-page" data-results-scroll tabIndex={-1}><section className="winner-hero"><div className="trophy">🏆</div><div><div className="eyebrow">FORMATION ANALYSIS COMPLETE</div><h1>{winner?.managerName} wins!</h1><p>{winner?.formationName} · Final team score <strong>{winner?.score}</strong></p></div></section>
    <section className="podium-section"><div className="podium-stage">{podiumOrder.map(result => <div className={`podium-place rank-${result.rank}`} key={result.managerId}><div className="podium-medal">{result.rank === 1 ? "👑" : result.rank === 2 ? "🥈" : "🥉"}</div><span>#{result.rank}</span><h2>{result.managerName}</h2><strong>{result.score}</strong><small>{result.formationName}</small><div><b>FIT {result.lineupFit}</b><b>XI {result.startingXIQuality}</b><b>DEPTH {result.benchStrength}</b></div></div>)}</div></section>
    <div className="results-grid"><section className="panel leaderboard"><div className="panel-title"><h2>Final leaderboard</h2><span>SERVER RANKED</span></div>{state.rankings.map(result => <div className={`rank-row ${result.managerId === managerId ? "you" : ""}`} key={result.managerId}><strong>#{result.rank}</strong><div><b>{result.managerName}</b><small>{result.formationName} · Fit {result.lineupFit} · Depth {result.benchStrength}</small></div><span>{result.score}</span></div>)}</section><section className="panel awards"><div className="panel-title"><h2>Awards</h2><span>MATCH HIGHLIGHTS</span></div>{state.awards.map(award => <div className="award" key={award.title}><div>✦</div><p><span>{award.title}</span><b>{award.managerName}</b><small>{award.detail}</small></p></div>)}</section></div>
    <section className="squads"><h2>Final squads · {starterCount} starters + substitutes</h2><div className="squad-grid">{state.managers.map(manager => {
      const starters = new Set(manager.lineup.map(item => item.footballerId));
      return <div className="squad" key={manager.id}><div><span>{manager.avatar}</span><h3>{manager.name}</h3><b>{FORMATION_BY_ID.get(manager.formationId ?? "")?.name ?? "Formation"}</b></div><h4>STARTING TEAM · {starterCount}</h4>{manager.squad.filter(entry => starters.has(entry.footballer.id)).map(entry => <SquadRow entry={entry} key={entry.footballer.id} />)}{manager.squad.length > starterCount && <><h4>SUBSTITUTES · {manager.squad.length - starterCount}</h4>{manager.squad.filter(entry => !starters.has(entry.footballer.id)).map(entry => <SquadRow entry={entry} key={entry.footballer.id} />)}</>}</div>;
    })}</div></section><div className="result-actions"><button className="primary" onClick={() => navigator.clipboard.writeText(`Auction Eleven winner: ${winner?.managerName} — ${winner?.formationName} — ${winner?.score} points!`)}>Copy Result</button><button className="secondary" onClick={leave}>New Match</button></div></main>;
}

function SquadRow({ entry }: { entry: SquadEntry }) { return <p><FootballerPhoto player={entry.footballer} compact /><span>{entry.footballer.position}</span><em>{entry.footballer.name}</em><b>{entry.footballer.overall}</b></p>; }



createRoot(document.getElementById("root")!).render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>);
