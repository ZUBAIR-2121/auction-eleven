import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import { io, type Socket } from "socket.io-client";
import {
  FORMATIONS,
  FORMATION_BY_ID,
  getOpeningBid,
  getMaximumSquadSize,
  getStartingLineupSize,
  getSquadPositionTargets,
  getFootballerRoles,
  getRoleFitLabel,
  MAX_SUBSTITUTES,
  type BotDifficulty,
  type ClientToServerEvents,
  type Footballer,
  type FootballerPhoto,
  type FormationDefinition,
  type GameSettings,
  type LineupRole,
  type ManagerLimit,
  type PoolTargets,
  type Position,
  type PricingMode,
  type RoomAccess,
  type RoomDirectoryEntry,
  type RoomDirectoryFilters,
  type RoomState,
  type SquadSize,
  type ServerToClientEvents,
  type SquadEntry
} from "@auction-eleven/shared";
import "./styles.css";

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
const SQUAD_SIZES: SquadSize[] = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const BOT_DIFFICULTIES: BotDifficulty[] = ["Amateur", "Professional", "World Class", "Legendary"];
const PRICING_MODES: Array<{ id: PricingMode; title: string; description: string }> = [
  { id: "normal", title: "Normal", description: "Every footballer opens at the same minimum bid." },
  { id: "ovr_scaled", title: "OVR Pricing", description: "Higher-rated footballers begin at a higher price." }
];
const CHAT_EMOJIS = ["😀", "😂", "😍", "😎", "🤔", "😱", "😭", "😡", "👏", "🙌", "👍", "👎", "🤝", "🔥", "⚡", "💸", "💰", "🏆", "🥇", "⚽", "🥅", "🧤", "🚀", "🎯", "💪", "🧠", "❤️", "✅", "❌", "👀", "🎉", "🫡"];
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

  useEffect(() => {
    socket.on("connect", () => {
      setConnected(true);
      const code = localStorage.getItem("ae_room");
      if (code) socket.emit("room:resume", { code, sessionId }, response => { if (response.ok) setManagerId(response.data.managerId); });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:state", setState);
    socket.on("room:error", setError);
    socket.on("room:reaction", value => {
      setReaction(value);
      setTimeout(() => setReaction(null), 1800);
    });
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("room:state");
      socket.off("room:error");
      socket.off("room:reaction");
    };
  }, []);

  const finishLoading = React.useCallback(() => {
    sessionStorage.setItem("ae_intro_seen", "1");
    setIsLoading(false);
  }, []);
  const saveSeat = (code: string, id: string) => {
    localStorage.setItem("ae_room", code);
    localStorage.setItem("ae_manager", id);
    setManagerId(id);
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

  const leave = () => {
    if (state && state.phase !== "lobby" && state.phase !== "finished") {
      const message = state.isSolo
        ? "Leave this Solo Practice match? Your current progress will be lost."
        : "Leave this live room? Your manager will remain in the match as disconnected.";
      if (!confirm(message)) return;
    }
    const finish = () => {
      localStorage.removeItem("ae_room");
      localStorage.removeItem("ae_manager");
      setManagerId(null);
      setState(null);
      setError("");
      window.history.replaceState(null, "", window.location.pathname);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    if (!state || !managerId) { finish(); return; }
    socket.emit("room:leave", { code: state.code }, response => {
      if (!response.ok) setError(response.error);
      finish();
    });
  };

  let page: React.ReactNode;
  if (!state) page = <Landing socket={socket} saveSeat={saveSeat} setError={setError} />;
  else if (state.phase === "lobby") page = <Lobby socket={socket} state={state} managerId={managerId!} setError={setError} leave={leave} />;
  else if (state.phase === "formation") page = <FormationRoom socket={socket} state={state} managerId={managerId!} setError={setError} leave={leave} />;
  else if (state.phase === "finished") page = <Results state={state} managerId={managerId!} leave={leave} />;
  else page = <Arena socket={socket} state={state} managerId={managerId!} setError={setError} leave={leave} />;

  const pageKey = state ? `${state.code}-${state.phase}` : "landing";
  return <div className="app-shell">
    <AnimatePresence>{isLoading && <LoadingScreen onComplete={finishLoading} />}</AnimatePresence>
    <div className="ambient-grid" /><div className="noise" />
    <header className="topbar"><Brand />{state ? <button className="topbar-back" onClick={leave}>← BACK TO MENU</button> : <nav><a href="#home">Home</a><a href="#how">How it works</a><a href="#play">Play</a></nav>}<div className="status-pill"><i className={connected ? "online" : "offline"} />{connected ? "Live server" : "Reconnecting"}</div></header>
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
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 2300);
      setCount(Math.round(progress * 100));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setTimeout(onComplete, 300);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [onComplete]);
  const word = words[Math.min(words.length - 1, Math.floor(count / 25))];
  return <motion.div className="loading-screen" exit={{ opacity: 0, y: "-100%" }} transition={{ duration: .7, ease: [0.76, 0, 0.24, 1] }}>
    <div className="loading-label">AUCTION ELEVEN</div>
    <AnimatePresence mode="wait"><motion.div className="loading-word" key={word} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>{word}</motion.div></AnimatePresence>
    <div className="loading-count">{String(count).padStart(3, "0")}</div>
    <div className="loading-track"><i style={{ transform: `scaleX(${count / 100})` }} /></div>
  </motion.div>;
}

function Brand() { return <a href="#home" className="brand"><div className="brand-mark"><span>11</span></div><div><strong>AUCTION</strong><em>ELEVEN</em></div></a>; }
function Toast({ message, close }: { message: string; close: () => void }) { return <div className="toast"><span>!</span><p>{message}</p><button onClick={close}>×</button></div>; }

function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
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
  }, []);
  return <video ref={videoRef} className="hero-video" autoPlay muted loop playsInline aria-hidden="true" />;
}

function Landing({ socket, saveSeat, setError }: { socket: GameSocket; saveSeat: (code: string, id: string) => void; setError: (value: string) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [directPassword, setDirectPassword] = useState("");
  const [createAccess, setCreateAccess] = useState<RoomAccess>("public");
  const [createPassword, setCreatePassword] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
    if (titleRef.current) timeline.fromTo(titleRef.current, { opacity: 0, y: 55 }, { opacity: 1, y: 0, duration: 1.15 }, .1);
    if (copyRef.current) timeline.fromTo(copyRef.current.children, { opacity: 0, y: 20, filter: "blur(9px)" }, { opacity: 1, y: 0, filter: "blur(0px)", stagger: .1, duration: .8 }, .3);
    return () => { timeline.kill(); };
  }, []);

  const validateName = () => {
    if (name.trim().length < 2) {
      setError("Enter a manager name with at least two characters.");
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
      name,
      sessionId,
      solo,
      access: solo ? "public" : createAccess,
      password: !solo && createAccess === "password" ? createPassword : undefined
    }, response => {
      setBusy(false);
      response.ok ? saveSeat(response.data.code, response.data.managerId) : setError(response.error);
    });
  };

  const joinCode = () => {
    if (!validateName()) return;
    if (code.trim().length !== 6) {
      setError("Enter a valid six-character room code.");
      return;
    }
    setBusy(true);
    socket.emit("room:join", { code, name, sessionId, password: directPassword || undefined }, response => {
      setBusy(false);
      response.ok ? saveSeat(response.data.code, response.data.managerId) : setError(response.error);
    });
  };

  return <main className="landing" id="home">
    <section className="landing-hero">
      <HeroVideo /><div className="hero-shade" /><div className="hero-fade" />
      <div className="hero-content" ref={copyRef}>
        <div className="eyebrow">THE NEXT-GEN FOOTBALL AUCTION EXPERIENCE · 2026</div>
        <h1 ref={titleRef}>Win the market.<br /><span>Build the eleven.</span></h1>
        <p>Fast live auctions, tactical squad building, public room discovery, password-protected lobbies, and a server-ranked final podium.</p>
        <div className="hero-actions"><a className="primary" href="#play">Enter match hub</a><button className="secondary" onClick={() => setDirectoryOpen(true)}>Find live rooms</button></div>
        <div className="feature-row"><span>Public + locked rooms</span><span>OVR + normal pricing</span><span>2–8 managers</span></div>
      </div>
      <div className="scroll-indicator"><span>SCROLL</span><i /></div>
    </section>

    <section className="landing-section" id="how">
      <div className="section-kicker"><i /> GAME FLOW</div>
      <div className="section-heading"><h2>Every screen built for <em>fast decisions.</em></h2><p>A responsive football-game interface designed for desktop, tablet, and mobile without forcing landscape orientation.</p></div>
      <div className="bento-grid">
        <article className="bento-card bento-wide"><span>01</span><h3>Create your lobby</h3><p>Launch an open room anyone can discover, or protect the room with a password while keeping it visible in the browser.</p><b>PUBLIC + PASSWORD ACCESS</b></article>
        <article className="bento-card"><span>02</span><h3>Bid with context</h3><p>See opening value, squad needs, live rivals, remaining budget, and position coverage while every round is moving.</p><b>LIVE AUCTION INTELLIGENCE</b></article>
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
    <AnimatePresence>{directoryOpen && <RoomDirectory socket={socket} managerName={name} saveSeat={saveSeat} setError={setError} onClose={() => setDirectoryOpen(false)} />}</AnimatePresence>
  </main>;
}

function RoomDirectory({ socket, managerName, saveSeat, setError, onClose }: { socket: GameSocket; managerName: string; saveSeat: (code: string, id: string) => void; setError: (value: string) => void; onClose: () => void }) {
  const [rooms, setRooms] = useState<RoomDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningCode, setJoiningCode] = useState("");
  const [passwordRoom, setPasswordRoom] = useState<RoomDirectoryEntry | null>(null);
  const [password, setPassword] = useState("");
  const [managerLimit, setManagerLimit] = useState<"all" | ManagerLimit>("all");
  const [pricingMode, setPricingMode] = useState<"all" | PricingMode>("all");
  const [access, setAccess] = useState<"all" | RoomAccess>("all");

  const loadRooms = React.useCallback(() => {
    setLoading(true);
    const filters: RoomDirectoryFilters = {};
    if (managerLimit !== "all") filters.managerLimit = managerLimit;
    if (pricingMode !== "all") filters.pricingMode = pricingMode;
    if (access !== "all") filters.access = access;
    socket.emit("rooms:list", { filters }, response => {
      setLoading(false);
      if (!response.ok) setError(response.error);
      else setRooms(response.data);
    });
  }, [access, managerLimit, pricingMode, setError, socket]);

  useEffect(() => {
    loadRooms();
    socket.on("rooms:changed", loadRooms);
    return () => { socket.off("rooms:changed", loadRooms); };
  }, [loadRooms, socket]);

  const join = (room: RoomDirectoryEntry, roomPassword?: string) => {
    if (managerName.trim().length < 2) {
      setError("Enter your manager name before joining a room.");
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
    socket.emit("room:join", { code: room.code, name: managerName, sessionId, password: roomPassword }, response => {
      setJoiningCode("");
      if (!response.ok) setError(response.error);
      else {
        onClose();
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
            <div className="directory-room-main"><div><strong>{room.hostName}'s room</strong><span className={room.hasPassword ? "locked" : "open"}>{room.hasPassword ? "PASSWORD" : "OPEN"}</span></div><small>Code {room.code} · {room.squadSize}-player squad · {room.auctionSeconds}s rounds</small><div className="directory-room-tags"><span>{room.pricingMode === "ovr_scaled" ? "OVR PRICING" : "NORMAL PRICING"}</span><span>{room.managerLimit} MANAGER ROOM</span></div></div>
            <div className="directory-occupancy"><div><b>{room.managerCount}</b><span>/{room.managerLimit}</span></div><small>{full ? "ROOM FULL" : `${room.openSlots} OPEN`}</small></div>
            <button className="directory-join" disabled={full || joiningCode === room.code} onClick={() => join(room)}>{full ? "FULL" : joiningCode === room.code ? "JOINING…" : room.hasPassword ? "ENTER PASSWORD" : "JOIN ROOM"}</button>
          </article>;
        })}
      </div>
      <footer className="directory-footer"><span>Rooms disappear from this list when the auction starts.</span><button className="secondary" onClick={onClose}>Close browser</button></footer>
    </motion.section>
    <AnimatePresence>{passwordRoom && <motion.div className="password-dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) setPasswordRoom(null); }}><motion.form className="password-dialog" initial={{ y: 24, scale: .96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, scale: .97 }} onSubmit={event => { event.preventDefault(); join(passwordRoom, password); }}><span className="password-room-icon">◆</span><div className="eyebrow">LOCKED ROOM · {passwordRoom.code}</div><h3>Enter room password</h3><p>{passwordRoom.hostName}'s room has {passwordRoom.openSlots} seat{passwordRoom.openSlots === 1 ? "" : "s"} remaining.</p><input autoFocus type="password" minLength={4} maxLength={32} value={password} onChange={event => setPassword(event.target.value)} placeholder="Room password" autoComplete="current-password" /><div><button type="button" className="secondary" onClick={() => setPasswordRoom(null)}>Cancel</button><button type="submit" className="primary" disabled={password.length < 4 || joiningCode === passwordRoom.code}>{joiningCode === passwordRoom.code ? "Joining…" : "Unlock & join"}</button></div></motion.form></motion.div>}</AnimatePresence>
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
  const [roomPassword, setRoomPassword] = useState("");
  const counts = useMemo(() => countPool(state.availableFootballers, state.selectedFootballerIds), [state.availableFootballers, state.selectedFootballerIds]);
  const starterCount = getStartingLineupSize(state.settings.squadSize);
  const requiredSubstitutes = Math.max(0, state.settings.squadSize - starterCount);
  const substituteCount = MAX_SUBSTITUTES;
  const requiredPool = state.managers.length * getMaximumSquadSize(state.settings.squadSize);
  const mirroredPool = state.selectedFootballerIds.length < requiredPool;
  const startDisabled = state.managers.some(manager => !manager.ready) || !state.poolSelectionValid;
  const changeNumber = (key: "startingBudget" | "auctionSeconds" | "formationSeconds", value: number) => {
    const settings: Partial<GameSettings> = { [key]: value };
    socket.emit("room:updateSettings", { code: state.code, settings }, response => { if (!response.ok) setError(response.error); });
  };
  const changeTarget = (position: Position, value: number) => {
    socket.emit("room:updateSettings", { code: state.code, settings: { poolTargets: { ...state.settings.poolTargets, [position]: value } } }, response => { if (!response.ok) setError(response.error); });
  };
  const changeManagerLimit = (managerLimit: ManagerLimit) => {
    socket.emit("room:updateSettings", { code: state.code, settings: { managerLimit } }, response => { if (!response.ok) setError(response.error); });
  };
  const changeSquadSize = (squadSize: SquadSize) => {
    socket.emit("room:updateSettings", { code: state.code, settings: { squadSize } }, response => { if (!response.ok) setError(response.error); });
  };
  const changeBotDifficulty = (botDifficulty: BotDifficulty) => {
    socket.emit("room:updateSettings", { code: state.code, settings: { botDifficulty } }, response => { if (!response.ok) setError(response.error); });
  };
  const changePricingMode = (pricingMode: PricingMode) => {
    socket.emit("room:updateSettings", { code: state.code, settings: { pricingMode } }, response => { if (!response.ok) setError(response.error); });
  };
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

  return <main className="lobby page">
    <div className="room-return-row"><button className="room-back-button" onClick={leave}><span>←</span><div><b>BACK TO GAME MENU</b><small>Leave this room safely</small></div></button></div>
    <div className="lobby-head"><div><div className="eyebrow">{state.isSolo ? "SOLO PRACTICE LOBBY" : state.access === "password" ? "PASSWORD MATCH LOBBY" : "PUBLIC MATCH LOBBY"}</div><h1>Managers’ Tunnel</h1><p>Each manager builds {starterCount} starters, reaches a {state.settings.squadSize}-player squad target, and may buy up to {substituteCount} substitutes when budget remains.</p></div><div className="room-code"><span>ROOM CODE</span><strong>{state.code}</strong><button onClick={() => navigator.clipboard.writeText(state.code)}>COPY</button></div></div>
    <div className="lobby-grid"><section className="panel managers-panel"><div className="panel-title"><h2>Room managers</h2><span>{state.managers.length}/{state.settings.managerLimit}</span></div><div className="manager-cards">{state.managers.map(manager => <div className={`manager-card ${manager.ready ? "ready" : ""}`} key={manager.id}><div className="avatar">{manager.avatar}</div><div><strong>{manager.name}</strong><small>{manager.isHost ? "HOST" : manager.isBot ? "AI MANAGER" : "CHALLENGER"}</small></div><div className="ready-tag">{manager.ready ? "READY" : manager.connected ? "WAITING" : "DISCONNECTED"}</div>{isHost && !manager.connected && !manager.isHost && <button className="replace-ai" onClick={() => socket.emit("room:replaceWithAI", { code: state.code, managerId: manager.id }, response => { if (!response.ok) setError(response.error); })}>REPLACE WITH AI</button>}</div>)}</div><div className="squad-rule-card"><b>{state.settings.squadSize}</b><div><strong>SQUAD TARGET</strong><span>{starterCount} starters{requiredSubstitutes ? ` + at least ${requiredSubstitutes} substitute${requiredSubstitutes === 1 ? "" : "s"}` : ""} · up to {substituteCount} substitutes</span></div></div></section>
      <section className="panel settings"><div className="panel-title"><h2>Match setup</h2><span>{isHost ? "HOST CONTROL" : "LOCKED"}</span></div>
        <Setting label="Starting budget" value={`${state.settings.startingBudget}M`}><input disabled={!isHost} type="range" min="300" max="3000" step="50" value={state.settings.startingBudget} onChange={event => changeNumber("startingBudget", +event.target.value)} /></Setting>
        <Setting label="Auction timer" value={`${state.settings.auctionSeconds}s`}><input disabled={!isHost} type="range" min="10" max="30" step="1" value={state.settings.auctionSeconds} onChange={event => changeNumber("auctionSeconds", +event.target.value)} /></Setting>
        <Setting label="Formation time limit" value={`${Math.round(state.settings.formationSeconds / 60)} min`}><input disabled={!isHost} type="range" min="120" max="600" step="60" value={state.settings.formationSeconds} onChange={event => changeNumber("formationSeconds", +event.target.value)} /></Setting>
        {!state.isSolo && <div className="manager-limit-setting room-access-setting"><div><span>ROOM ACCESS</span><b>{state.access === "password" ? "PASSWORD" : "OPEN"}</b></div><div className="preset-buttons pricing-mode-buttons"><button disabled={!isHost} className={state.access === "public" ? "active" : ""} onClick={() => changeRoomAccess("public")}><strong>Open room</strong><small>Visible in Find Room and joins instantly.</small></button><button disabled={!isHost} className={state.access === "password" ? "active" : ""} onClick={() => changeRoomAccess("password")}><strong>Password room</strong><small>Visible in Find Room but locked.</small></button></div>{isHost && <div className="lobby-password-row"><input type="password" maxLength={32} value={roomPassword} onChange={event => setRoomPassword(event.target.value)} placeholder={state.hasPassword ? "Enter a new password to replace it" : "Set password (4–32 characters)"} /><button disabled={roomPassword.trim().length < 4} onClick={() => changeRoomAccess("password")}>{state.hasPassword ? "UPDATE PASSWORD" : "SET PASSWORD"}</button></div>}<small>{state.hasPassword ? "A password is active. It is never sent to other players or shown in the room directory." : "Open rooms can be joined without a password."}</small></div>}
        <div className="manager-limit-setting pricing-mode-setting"><div><span>PLAYER STARTING PRICES</span><b>{state.settings.pricingMode === "ovr_scaled" ? "OVR PRICING" : "NORMAL"}</b></div><div className="preset-buttons pricing-mode-buttons">{PRICING_MODES.map(mode => <button disabled={!isHost} className={state.settings.pricingMode === mode.id ? "active" : ""} onClick={() => changePricingMode(mode.id)} key={mode.id}><strong>{mode.title}</strong><small>{mode.description}</small></button>)}</div><small>{state.settings.pricingMode === "ovr_scaled" ? "The opening bid uses each player's OVR and market value, scaled to the room budget." : "Classic mode keeps the same opening bid for every footballer."}</small></div>
        <div className="manager-limit-setting difficulty-setting"><div><span>AI DIFFICULTY</span><b>{state.settings.botDifficulty.toUpperCase()}</b></div><div className="preset-buttons difficulty-buttons">{BOT_DIFFICULTIES.map(level => <button disabled={!isHost || !state.isSolo} className={state.settings.botDifficulty === level ? "active" : ""} onClick={() => changeBotDifficulty(level)} key={level}>{level}</button>)}</div><small>{state.isSolo ? "Higher levels value positional needs, budget timing and late-round bidding more accurately." : "AI difficulty is used in Solo Practice rooms."}</small></div>
        <div className="manager-limit-setting"><div><span>ROOM CAPACITY</span><b>{state.settings.managerLimit} MANAGERS</b></div><div className="preset-buttons compact-presets">{MANAGER_LIMITS.map(limit => <button disabled={!isHost || (!state.isSolo && limit < state.managers.length)} className={state.settings.managerLimit === limit ? "active" : ""} onClick={() => changeManagerLimit(limit)} key={limit}>{limit}</button>)}</div><small>{state.isSolo ? "AI managers are added automatically." : "Rooms support a minimum of 2 and maximum of 8 managers."}</small></div>
        <div className="manager-limit-setting squad-size-setting"><div><span>SQUAD TARGET</span><b>{state.settings.squadSize} PLAYERS</b></div><div className="preset-buttons squad-size-buttons">{SQUAD_SIZES.map(size => <button disabled={!isHost} className={state.settings.squadSize === size ? "active" : ""} onClick={() => changeSquadSize(size)} key={size}>{size}</button>)}</div><small>{starterCount < 11 ? `${starterCount}-a-side starting formation + up to ${MAX_SUBSTITUTES} substitutes.` : `${starterCount} starters${requiredSubstitutes ? ` + at least ${requiredSubstitutes} substitute${requiredSubstitutes === 1 ? "" : "s"}` : ""}; up to ${MAX_SUBSTITUTES} substitutes total.`}</small></div>
        <div className="pool-target-settings"><div className="setting-heading"><span>ROOM PLAYER QUOTAS</span><b>15–20 PER POSITION</b></div>{POSITIONS.map(position => <label key={position}><span>{position}</span><input disabled={!isHost} type="range" min="15" max="20" value={state.settings.poolTargets[position]} onChange={event => changeTarget(position, +event.target.value)} /><b>{state.settings.poolTargets[position]}</b></label>)}</div>
        <div className={`pool-summary ${state.poolSelectionValid ? "valid" : "invalid"}`}><div><span>SELECTED ROOM POOL</span><strong>{state.selectedFootballerIds.length} footballers</strong></div><div className="pool-counts">{POSITIONS.map(position => <span key={position}>{position} <b>{counts[position]}/{state.settings.poolTargets[position]}</b></span>)}</div><button onClick={() => setPoolOpen(true)}>{isHost ? "SELECT PLAYERS" : "VIEW PLAYERS"}</button></div>
        <div className={`capacity-meter ${mirroredPool ? "mirrored" : "unique"}`}><span>{mirroredPool ? "Mirrored auction pool" : "Unique-player auction pool"}</span><b>{state.selectedFootballerIds.length} base / {requiredPool} purchases</b><small>{mirroredPool ? "A footballer may appear for different managers, but never twice in one manager’s squad." : "Every auction card is unique in this room."}</small></div>
        <div className="lobby-actions"><button className={me.ready ? "secondary" : "primary"} onClick={toggleReady}>{me.ready ? "Not Ready" : "I’m Ready"}</button>{isHost && <button className="kickoff" disabled={startDisabled} onClick={start}>START AUCTION ↗</button>}<button className="text-btn" onClick={leave}>← Back to menu</button></div>
        {!state.poolSelectionValid && <p className="setup-warning">Complete every position quota before starting.</p>}
      </section></div>
    {poolOpen && <PlayerPoolModal socket={socket} state={state} isHost={isHost} onClose={() => setPoolOpen(false)} setError={setError} />}
  </main>;
}

function Setting({ label, value, children }: { label: string; value: string; children: React.ReactNode }) { return <div className="setting"><div><span>{label}</span><b>{value}</b></div>{children}</div>; }

function PlayerPoolModal({ socket, state, isHost, onClose, setError }: { socket: GameSocket; state: RoomState; isHost: boolean; onClose: () => void; setError: (value: string) => void }) {
  const [active, setActive] = useState<Position>("GK");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string[]>(state.selectedFootballerIds);
  const [saving, setSaving] = useState(false);
  const counts = useMemo(() => countPool(state.availableFootballers, draft), [state.availableFootballers, draft]);
  const selectedSet = useMemo(() => new Set(draft), [draft]);
  const visible = useMemo(() => state.availableFootballers.filter(player => player.position === active && (`${player.name} ${player.country}`).toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.overall - a.overall), [state.availableFootballers, active, query]);
  const toggle = (player: Footballer) => {
    if (!isHost) return;
    setDraft(current => {
      if (current.includes(player.id)) return current.filter(id => id !== player.id);
      if (counts[player.position] >= state.settings.poolTargets[player.position]) return current;
      return [...current, player.id];
    });
  };
  const autoFill = (all: boolean) => {
    if (!isHost) return;
    setDraft(current => {
      let next = all ? [] : [...current];
      const targets = all ? POSITIONS : [active];
      for (const position of targets) {
        next = next.filter(id => state.availableFootballers.find(player => player.id === id)?.position !== position);
        const candidates = state.availableFootballers.filter(player => player.position === position).sort(() => Math.random() - .5).slice(0, state.settings.poolTargets[position]);
        next.push(...candidates.map(player => player.id));
      }
      return [...new Set(next)];
    });
  };
  const save = () => {
    setSaving(true);
    socket.emit("room:updatePlayerPool", { code: state.code, selectedFootballerIds: draft }, response => {
      setSaving(false);
      if (!response.ok) setError(response.error); else onClose();
    });
  };
  const complete = POSITIONS.every(position => counts[position] === state.settings.poolTargets[position]);
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Select room footballers"><section className="pool-modal"><header><div><div className="eyebrow">HOST PLAYER DRAFT</div><h2>Select this room’s footballers</h2><p>Choose exactly 15–20 footballers from every broad position.</p></div><button className="modal-close" onClick={onClose}>×</button></header><div className="pool-toolbar"><div className="position-tabs">{POSITIONS.map(position => <button className={active === position ? "active" : ""} key={position} onClick={() => setActive(position)}><span>{position}</span><b>{counts[position]}/{state.settings.poolTargets[position]}</b></button>)}</div><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${POSITION_NAMES[active].toLowerCase()}…`} /><button disabled={!isHost} onClick={() => autoFill(false)}>Auto fill {active}</button><button disabled={!isHost} onClick={() => autoFill(true)}>Auto fill all</button></div><div className="pool-grid">{visible.map(player => {
    const selected = selectedSet.has(player.id);
    const full = !selected && counts[player.position] >= state.settings.poolTargets[player.position];
    return <button type="button" disabled={!isHost || full} onClick={() => toggle(player)} className={`pool-player ${selected ? "selected" : ""}`} key={player.id}><FootballerPhoto player={player} compact /><span className="selection-mark">{selected ? "✓" : "+"}</span><div><strong>{player.name}</strong><small>{player.country} • {player.position}</small><span>OVR {player.overall} • Opens {money(getOpeningBid(state.settings, player))}</span></div></button>;
  })}</div><footer><div className={complete ? "complete" : "incomplete"}>{complete ? `✓ Player pool complete · ${draft.length} selected` : "Select the missing players before saving"}</div><div><button className="secondary" onClick={onClose}>Cancel</button>{isHost && <button className="primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save room pool"}</button>}</div></footer></section></div>;
}

function FootballerPhoto({ player, compact = false }: { player: Footballer; compact?: boolean }) {
  const cacheKey = player.catalogId ?? player.id;
  const [photo, setPhoto] = useState<FootballerPhoto | undefined>(() => photoCache.get(cacheKey));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const cached = photoCache.get(cacheKey);
    setPhoto(cached);
    setFailed(false);
    if (!cached) {
      loadPhoto(player)
        .then(value => { if (active) setPhoto(value); })
        .catch(() => { if (active) setFailed(true); });
    }
    return () => { active = false; };
  }, [cacheKey, player]);

  return <div className={`footballer-photo ${compact ? "compact" : ""}`}>{photo ? <><img key={photo.url} src={photo.url} alt={`${player.name} footballer`} loading="lazy" referrerPolicy="no-referrer" /><a href={photo.descriptionUrl} target="_blank" rel="noreferrer" title={`${photo.credit} • ${photo.license}`}>©</a></> : <div className="photo-placeholder"><span>{player.position === "GK" ? "🧤" : "⚽"}</span><small>{failed ? "PHOTO UNAVAILABLE" : "LOADING PHOTO"}</small></div>}</div>;
}

function useCountdown(endsAt: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, []);
  return endsAt ? Math.max(0, (endsAt - now) / 1000) : 0;
}

function PlayerCard({ player }: { player: Footballer }) { const roles = getFootballerRoles(player); return <motion.div key={player.id} initial={{ opacity: 0, scale: .94, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: .45, ease: [0.22, 1, 0.36, 1] }} className={`player-card rarity-${player.rarity.toLowerCase()}`}><div className="card-top"><span>{player.rarity}</span><b>{roles[0] ?? player.position}</b></div><div className="rating">{player.overall}</div><FootballerPhoto player={player} /><h2>{player.name}</h2><p>{player.country} · Real footballer</p><div className="player-roles" aria-label="Playable positions">{roles.map((role, index) => <span className={index === 0 ? "primary" : ""} key={role}>{role}</span>)}</div><div className="stats"><Stat value={player.pace} label="PAC" /><Stat value={player.shooting} label="SHO" /><Stat value={player.passing} label="PAS" /><Stat value={player.dribbling} label="DRI" /><Stat value={player.defending} label="DEF" /><Stat value={player.physical} label="PHY" /></div><div className="trait">✦ {player.trait}</div></motion.div>; }
function Stat({ value, label }: { value: number; label: string }) { return <div><b>{value}</b><span>{label}</span></div>; }

function squadPositionCounts(squad: SquadEntry[]): PoolTargets {
  const counts: PoolTargets = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  squad.forEach(entry => { counts[entry.footballer.position]++; });
  return counts;
}

function SquadTracker({ squad, currentPosition, squadSize }: { squad: SquadEntry[]; currentPosition?: Position; squadSize: number }) {
  const [expanded, setExpanded] = useState(false);
  const counts = squadPositionCounts(squad);
  const targets = getSquadPositionTargets(squadSize);
  const maximumSquadSize = getMaximumSquadSize(squadSize);
  return <section className={`squad-tracker ${expanded ? "expanded" : ""}`}>
    <button className="tracker-head" onClick={() => setExpanded(value => !value)}><div><span>MY AUCTION SQUAD</span><strong>{squad.length}<i>/{maximumSquadSize}</i></strong></div><b>{expanded ? "−" : "+"}</b></button>
    <div className="position-tracker">{POSITIONS.map(position => {
      const remaining = Math.max(0, targets[position] - counts[position]);
      return <div className={`${currentPosition === position ? "current" : ""} ${remaining === 0 ? "complete" : ""}`} key={position}><span>{position}</span><strong>{counts[position]}<i>/{targets[position]}</i></strong><small>{remaining ? `${remaining} needed` : "covered"}</small></div>;
    })}</div>
    {expanded && <div className="tracker-list">{squad.length ? squad.slice().reverse().map(entry => <div key={entry.footballer.id}><span>{entry.footballer.position}</span><b>{entry.footballer.name}</b><small>{entry.price}M</small></div>) : <p>No signings yet. Use the targets above to plan your bids.</p>}</div>}
  </section>;
}

function Arena({ socket, state, managerId, setError, leave }: { socket: GameSocket; state: RoomState; managerId: string; setError: (value: string) => void; leave: () => void }) {
  const me = state.managers.find(manager => manager.id === managerId)!;
  const seconds = useCountdown(state.endsAt);
  const progress = clamp(seconds / state.settings.auctionSeconds * 100, 0, 100);
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
  const maximumSquadSize = getMaximumSquadSize(state.settings.squadSize);
  const starterCount = getStartingLineupSize(state.settings.squadSize);
  const goalkeeperCount = me.squad.filter(entry => entry.footballer.position === "GK").length;
  const outfieldCount = me.squad.length - goalkeeperCount;
  const canFormLineup = goalkeeperCount >= 1 && outfieldCount >= starterCount - 1;
  const hasPassed = (state.passedManagerIds ?? []).includes(managerId);
  const canComplete = me.squad.length >= state.settings.squadSize && canFormLineup && !me.auctionComplete;
  const cannotBid = sending || me.auctionComplete || hasPassed || seconds <= 0 || me.squad.length >= maximumSquadSize || me.budget < minimum;
  const passOnPlayer = () => {
    if (hasPassed || seconds <= 0) return;
    setSending(true);
    socket.emit("auction:pass", { code: state.code, roundId: state.roundId }, response => {
      setSending(false);
      if (!response.ok) setError(response.error);
    });
  };
  const completeSquad = () => {
    if (!canComplete || sending) return;
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
    <div className="arena-grid"><div className="arena-left-stack"><SquadTracker squad={me.squad} currentPosition={state.currentFootballer?.position} squadSize={state.settings.squadSize} /><aside className="panel manager-board"><h3>ROOM SQUADS</h3>{state.managers.map(manager => <div className={`manager-line ${manager.id === state.highestBidderId ? "leading" : ""} ${manager.id === managerId ? "you" : ""}`} key={manager.id}><span className="mini-avatar">{manager.avatar}</span><div><b>{manager.name}</b><small>{manager.auctionComplete ? "SQUAD COMPLETE" : `${manager.squad.length}/${getMaximumSquadSize(state.settings.squadSize)} · ${Math.max(0, getMaximumSquadSize(state.settings.squadSize) - manager.squad.length)} spots left`}</small></div><strong>{money(manager.budget)}</strong></div>)}</aside></div>
      <section className="auction-stage">{state.currentFootballer && <PlayerCard player={state.currentFootballer} />}<div className="auction-meta"><div className="timer" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{Math.ceil(seconds)}</strong><span>SEC</span></div></div><div className="current-price"><span>{state.currentBid ? "CURRENT BID" : state.settings.pricingMode === "ovr_scaled" ? "OVR OPENING PRICE" : "OPENING BID"}</span><strong>{money(state.currentBid || openingBid)}</strong><p>{state.highestBidderId ? `${state.managers.find(manager => manager.id === state.highestBidderId)?.name} leads` : state.settings.pricingMode === "ovr_scaled" ? `${state.currentFootballer?.overall ?? "—"} OVR value mode` : "Normal price mode"}</p></div></div></section>
      <aside className="panel bid-feed"><h3>BID FEED</h3>{state.bidHistory.length === 0 ? <div className="empty-feed">No bids yet.<br />Make the first move.</div> : state.bidHistory.map((bid, index) => <div className={`feed-row ${index === 0 ? "latest" : ""}`} key={bid.id}><span>{bid.managerName}</span><b>{money(bid.amount)}</b></div>)}</aside></div>
    <div className="bid-dock"><div className="budget-read"><span>YOUR BUDGET</span><b>{money(me.budget)}</b><small>{me.squad.length}/{maximumSquadSize} signed · {Math.max(0, state.settings.squadSize - me.squad.length)} players to target · {Math.max(0, me.squad.length - getStartingLineupSize(state.settings.squadSize))}/10 subs · {Math.max(0, maximumSquadSize - me.squad.length) ? Math.floor(me.budget / Math.max(1, maximumSquadSize - me.squad.length)) : me.budget}M per open slot</small></div><div className="quick-bids"><button disabled={cannotBid} onClick={() => actualBid(minimum)}>BID {money(minimum)}</button><button disabled={cannotBid || me.budget < minimum + 5} onClick={() => actualBid(minimum + 5)}>+5M</button><button disabled={cannotBid || me.budget < minimum + 10} onClick={() => actualBid(minimum + 10)}>+10M</button><button type="button" className={`pass-player ${hasPassed ? "passed" : ""}`} disabled={sending || me.auctionComplete || hasPassed || seconds <= 0 || me.squad.length >= maximumSquadSize || me.budget < openingBid} onClick={passOnPlayer}>{hasPassed ? "PASSED" : "PASS PLAYER"}</button><button type="button" className={`complete-auction ${me.auctionComplete ? "done" : ""}`} disabled={sending || !canComplete} onClick={completeSquad}>{me.auctionComplete ? "SQUAD COMPLETE ✓" : `I'M DONE (${me.squad.length}/${state.settings.squadSize})`}</button></div><form className="custom-bid" onSubmit={event => { event.preventDefault(); if (custom) actualBid(+custom); }}><input inputMode="numeric" enterKeyHint="send" aria-label="Custom bid amount" value={custom} onChange={event => setCustom(event.target.value.replace(/\D/g, ""))} placeholder="CUSTOM BID" /><button type="submit" disabled={cannotBid || !custom || +custom > me.budget}>PLACE</button></form></div></main>;
}

function RoundResult({ state }: { state: RoomState }) {
  const label = state.lastWinner?.automatic ? "AUTO SIGNED" : state.lastWinner ? "SOLD!" : "RE-AUCTION";
  return <main className="round-result"><div className="result-burst">{label}</div>{state.lastWinner ? <><div className="winner-avatar">{state.lastWinner.automatic ? "⚙️" : "🏆"}</div><h1>{state.lastWinner.footballerName}</h1><p>{state.lastWinner.automatic ? "assigned to complete the squad of" : "joins"} <strong>{state.lastWinner.managerName}</strong></p><div className="sold-price">{money(state.lastWinner.amount)}</div></> : <><h1>No manager bid</h1><p>This footballer will return later in the auction.</p></>}<div className="loading-bar"><i /></div></main>;
}

function rolePosition(role: LineupRole): Position {
  if (role === "GK") return "GK";
  if (["LB", "CB", "RB", "LWB", "RWB"].includes(role)) return "DEF";
  if (["CDM", "CM", "CAM", "LM", "RM"].includes(role)) return "MID";
  return "FWD";
}

function clientRoleScore(player: Footballer, role: LineupRole): number {
  const required = rolePosition(role);
  const position = player.position === required ? 100 : player.secondary.includes(required) ? 76 : 25;
  let ability = player.overall;
  if (role === "GK") ability = player.goalkeeping;
  else if (["LB", "CB", "RB", "LWB", "RWB"].includes(role)) ability = player.defending * .45 + player.physical * .25 + player.pace * .18 + player.passing * .12;
  else if (["CDM", "CM", "CAM", "LM", "RM"].includes(role)) ability = player.passing * .34 + player.dribbling * .24 + player.physical * .16 + player.defending * .13 + player.shooting * .13;
  else ability = player.shooting * .38 + player.pace * .27 + player.dribbling * .22 + player.passing * .13;
  return ability * .72 + position * .28;
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
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const pointerDrag = useRef<{ id: string; pointerId: number; startX: number; startY: number; active: boolean; timer: number | null } | null>(null);
  const seconds = useCountdown(state.formationEndsAt);
  const formation = FORMATION_BY_ID.get(formationId) ?? validFormations[0]!;
  const playerMap = useMemo(() => new Map(me.squad.map(entry => [entry.footballer.id, entry.footballer])), [me.squad]);
  const draftKey = `ae_formation_${state.code}_${managerId}`;
  const restoredDraft = useRef(false);

  useEffect(() => {
    if (restoredDraft.current || me.lineupSubmitted) return;
    restoredDraft.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null") as { formationId?: string; picks?: Record<string, string> } | null;
      const savedFormation = saved?.formationId ? FORMATION_BY_ID.get(saved.formationId) : undefined;
      if (savedFormation?.slots.length === starterTarget && saved?.picks) {
        const validPicks = Object.fromEntries(Object.entries(saved.picks).filter(([slotId, footballerId]) => savedFormation.slots.some(slot => slot.id === slotId) && playerMap.has(footballerId)));
        setFormationId(savedFormation.id);
        setPicks(validPicks);
      }
    } catch { localStorage.removeItem(draftKey); }
  }, [draftKey, me.lineupSubmitted, playerMap, starterTarget]);

  useEffect(() => {
    if (!me.lineupSubmitted) localStorage.setItem(draftKey, JSON.stringify({ formationId, picks }));
  }, [draftKey, formationId, picks, me.lineupSubmitted]);

  const lineupIds = useMemo(() => new Set(Object.values(picks)), [picks]);
  const substitutes = me.squad.filter(entry => !lineupIds.has(entry.footballer.id));
  const selectedManagerCount = state.managers.filter(manager => manager.lineupSubmitted).length;
  const roleForSlot = (slotId: string) => formation.slots.find(item => item.id === slotId)?.role;
  const canUseInSlot = (footballerId: string, slotId: string) => {
    const player = playerMap.get(footballerId);
    const slotRole = roleForSlot(slotId);
    if (!player || !slotRole) return false;
    return slotRole === "GK" ? player.position === "GK" : player.position !== "GK";
  };

  const chooseFormation = (nextId: string) => {
    const next = FORMATION_BY_ID.get(nextId);
    if (!next || next.slots.length !== starterTarget) return;
    setFormationId(nextId);
    setPicks(autoArrange(me.squad, next));
  };

  const movePlayerToSlot = (footballerId: string, targetSlotId: string) => {
    if (!canUseInSlot(footballerId, targetSlotId)) {
      setError(roleForSlot(targetSlotId) === "GK" ? "Only a goalkeeper can fill the GK slot." : "Goalkeepers cannot be placed in outfield positions.");
      return;
    }
    setPicks(current => {
      const next = { ...current };
      const sourceSlot = Object.entries(next).find(([, id]) => id === footballerId)?.[0];
      const targetPlayer = next[targetSlotId];
      if (sourceSlot) {
        if (targetPlayer && !canUseInSlot(targetPlayer, sourceSlot)) {
          setError("The player in the target slot cannot move into the vacated position.");
          return current;
        }
        next[targetSlotId] = footballerId;
        if (targetPlayer) next[sourceSlot] = targetPlayer;
        else delete next[sourceSlot];
      } else {
        next[targetSlotId] = footballerId;
      }
      return next;
    });
    navigator.vibrate?.(25);
  };

  const movePlayerToBench = (footballerId: string) => {
    setPicks(current => {
      const sourceSlot = Object.entries(current).find(([, id]) => id === footballerId)?.[0];
      if (!sourceSlot) return current;
      const next = { ...current };
      delete next[sourceSlot];
      return next;
    });
    navigator.vibrate?.(20);
  };

  const finishPointerDrag = (clientX: number, clientY: number) => {
    const drag = pointerDrag.current;
    if (!drag?.active) return;
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-slot-id], [data-bench-drop]");
    if (target?.dataset.slotId) movePlayerToSlot(drag.id, target.dataset.slotId);
    else if (target?.hasAttribute("data-bench-drop")) movePlayerToBench(drag.id);
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = pointerDrag.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.active && distance > 10) {
        if (drag.timer !== null) window.clearTimeout(drag.timer);
        pointerDrag.current = null;
        return;
      }
      if (drag.active) {
        event.preventDefault();
        setDragPoint({ x: event.clientX, y: event.clientY });
      }
    };
    const onUp = (event: PointerEvent) => {
      const drag = pointerDrag.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.timer !== null) window.clearTimeout(drag.timer);
      finishPointerDrag(event.clientX, event.clientY);
      pointerDrag.current = null;
      setDraggingPlayer(null);
      setDragPoint(null);
      document.body.classList.remove("formation-dragging");
    };
    const onCancel = (event: PointerEvent) => {
      if (pointerDrag.current?.pointerId !== event.pointerId) return;
      if (pointerDrag.current.timer !== null) window.clearTimeout(pointerDrag.current.timer);
      pointerDrag.current = null;
      setDraggingPlayer(null);
      setDragPoint(null);
      document.body.classList.remove("formation-dragging");
    };
    const cancelActiveDrag = () => {
      const drag = pointerDrag.current;
      if (drag?.timer !== null && drag?.timer !== undefined) window.clearTimeout(drag.timer);
      pointerDrag.current = null;
      setDraggingPlayer(null);
      setDragPoint(null);
      releaseDocumentScrollLock();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") cancelActiveDrag();
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", cancelActiveDrag);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", cancelActiveDrag);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cancelActiveDrag();
    };
  }, [formationId, picks]);

  const beginPointerDrag = (event: React.PointerEvent<HTMLElement>, footballerId: string) => {
    if (me.lineupSubmitted || event.pointerType === "mouse") return;
    const drag = { id: footballerId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false, timer: null as number | null };
    drag.timer = window.setTimeout(() => {
      if (pointerDrag.current !== drag) return;
      drag.active = true;
      setDraggingPlayer(footballerId);
      setDragPoint({ x: drag.startX, y: drag.startY });
      document.body.classList.add("formation-dragging");
      navigator.vibrate?.(30);
    }, 180);
    pointerDrag.current = drag;
  };

  const dragProps = (footballerId: string) => ({
    draggable: true,
    onDragStartCapture: (event: React.DragEvent<HTMLElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", footballerId);
      setDraggingPlayer(footballerId);
    },
    onDragEnd: () => setDraggingPlayer(null),
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => beginPointerDrag(event, footballerId)
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
  return <main className="formation-page page"><header className="formation-header"><div><div className="eyebrow">POST-AUCTION TEAM SETUP</div><h1>Choose formation & assemble your team</h1><p>Drag every player into position. Primary and secondary roles receive the best rating.</p></div><div className="formation-clock"><span>LINEUP DEADLINE</span><b>{Math.floor(seconds / 60)}:{String(Math.ceil(seconds % 60)).padStart(2, "0")}</b></div></header>
    <div className="formation-layout"><aside className="panel formation-list"><div className="panel-title"><h2>Formations</h2><span>{validFormations.length} OPTIONS</span></div><div className="formation-options">{validFormations.map(item => <button className={formationId === item.id ? "active" : ""} onClick={() => chooseFormation(item.id)} key={item.id}><b>{item.name}</b><span>{item.style}</span></button>)}</div></aside>
      <section className="lineup-center"><div className="lineup-toolbar"><div><span>SELECTED SYSTEM</span><strong>{formation.name}</strong><em>{formation.style}</em></div><button onClick={() => setPicks(autoArrange(me.squad, formation))}>AUTO ARRANGE</button></div><div className="tactical-pitch">{formation.slots.map(formationSlot => {
        const player = playerMap.get(picks[formationSlot.id] ?? "");
        const fit = player ? getRoleFitLabel(player, formationSlot.role) : null;
        return <button type="button" data-slot-id={formationSlot.id} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (id) movePlayerToSlot(id, formationSlot.id); }} className={`pitch-player ${draggingPlayer ? (canUseInSlot(draggingPlayer, formationSlot.id) ? "drag-target drag-valid" : "drag-target drag-invalid") : ""}`} style={{ left: `${formationSlot.x}%`, top: `${formationSlot.y}%` }} key={formationSlot.id}><span className="role-badge">{formationSlot.role}</span>{draggingPlayer && <span className="drag-preview">{Math.round(clientRoleScore(playerMap.get(draggingPlayer)!, formationSlot.role))}</span>}{player ? <motion.div {...dragProps(player.id)} className="pitch-player-content" key={player.id} initial={{ opacity: 0, scale: .82, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: .22, ease: [0.22, 1, 0.36, 1] }}><FootballerPhoto key={player.id} player={player} compact /><strong>{player.name.split(" ").at(-1)}</strong><small><b>{player.primaryRole}</b>{player.secondaryRoles.length ? ` · ${player.secondaryRoles.join("/")}` : ""} · {player.overall} OVR</small><em className={`fit-${fit?.toLowerCase().replaceAll(" ", "-")}`}>{fit}</em><i className="drag-grip" aria-hidden="true">⋮⋮</i></motion.div> : <b>+</b>}</button>;
      })}</div><div className="assembly-note">Desktop: drag with the mouse. Mobile/tablet: press briefly, then drag. Drop a starter into the substitutes panel to bench them.</div></section>
      <aside className={`panel bench-panel ${draggingPlayer ? "is-dragging" : ""}`} data-bench-drop onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (id) movePlayerToBench(id); }}><div className="panel-title"><h2>{substituteTarget ? "Substitutes" : "Squad"}</h2><span>{substitutes.length}/{substituteTarget}</span></div><div className="bench-list">{substitutes.length ? substitutes.map(entry => <button {...dragProps(entry.footballer.id)} key={entry.footballer.id}><FootballerPhoto key={entry.footballer.id} player={entry.footballer} compact /><div><strong>{entry.footballer.name}</strong><span><b>{entry.footballer.primaryRole}</b>{entry.footballer.secondaryRoles.length ? ` · ${entry.footballer.secondaryRoles.join("/")}` : ""} · {entry.footballer.overall} OVR</span></div><i className="drag-grip" aria-hidden="true">⋮⋮</i></button>) : <div className="no-subs">Drag a starter here to move them to the bench.</div>}</div><div className="lineup-summary"><span>Starters</span><b>{Object.values(picks).length}/{starterTarget}</b><span>Substitutes</span><b>{substitutes.length}/{substituteTarget}</b></div><button className="primary submit-lineup" disabled={submitting || Object.values(picks).length !== starterTarget || substitutes.length !== substituteTarget} onClick={submit}>{submitting ? "LOCKING…" : "READY · LOCK LINEUP"}</button>{state.isSolo && <button className="danger-outline" onClick={quitSolo}>Quit Solo Match</button>}</aside></div>
    {dragged && dragPoint && <div className="touch-drag-ghost" style={{ transform: `translate3d(${dragPoint.x}px, ${dragPoint.y}px, 0)` }}><b>{dragged.primaryRole}</b><span>{dragged.name}</span><em>{dragged.overall}</em></div>}
  </main>;
}

function RoomChat({ socket, state, managerId, setError }: { socket: GameSocket; state: RoomState; managerId: string; setError: (value: string) => void }) {
  const [open, setOpen] = useState(false);
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
      <header><div><span>ROOM CHAT</span><strong>Auction Eleven</strong></div><div className="chat-online"><i />{state.managers.filter(manager => manager.connected).length} online</div><button aria-label="Close chat" onClick={() => { setOpen(false); setEmojiOpen(false); }}>×</button></header>
      <div className="chat-messages" aria-live="polite">{messages.length === 0 ? <div className="chat-empty"><span>💬</span><b>Start the room conversation</b><p>Use the full keyboard, press Enter to send, or add an emoji.</p></div> : messages.map(message => {
        const own = message.managerId === managerId;
        return <div className={`chat-row ${own ? "own" : ""}`} key={message.id}>{!own && <span className="chat-avatar">{message.avatar}</span>}<div className="chat-bubble">{!own && <b>{message.managerName}</b>}<p>{message.text}</p><small>{new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{own ? " ✓" : ""}</small></div></div>;
      })}<div ref={bottomRef} /></div>
      <div className="typing-line">{typingNames.length ? `${typingNames.slice(0, 2).join(" and ")} ${typingNames.length > 1 ? "are" : "is"} typing…` : ""}</div>
      {emojiOpen && <div className="emoji-picker" role="toolbar" aria-label="Emoji picker">{CHAT_EMOJIS.map(emoji => <button type="button" onClick={() => addEmoji(emoji)} aria-label={`Add ${emoji}`} key={emoji}>{emoji}</button>)}</div>}
      <footer><button className={`emoji-toggle ${emojiOpen ? "active" : ""}`} aria-label="Toggle emoji picker" onClick={() => setEmojiOpen(value => !value)}>☺</button><textarea ref={textareaRef} rows={1} maxLength={300} value={draft} onChange={event => notifyTyping(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } else if (event.key === "Escape") { setEmojiOpen(false); } }} placeholder="Type a message" aria-label="Chat message" /><button className="chat-send" aria-label="Send message" disabled={!draft.trim()} onClick={send}>➤</button></footer>
      <div className="chat-hint"><span>Enter to send</span><span>Shift + Enter for a new line</span><b>{draft.length}/300</b></div>
    </section>}
    <button className="chat-launcher" aria-label={open ? "Close room chat" : "Open room chat"} onClick={() => setOpen(value => !value)}><span>{open ? "×" : "💬"}</span>{!open && unread > 0 && <b>{Math.min(unread, 99)}</b>}</button>
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



createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
