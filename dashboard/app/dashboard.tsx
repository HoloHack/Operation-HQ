"use client";

import {
  ArrowRight, BookOpen, Bookmark, BrainCircuit, CalendarDays, Check, CheckCircle2,
  ChevronRight, Circle, Cloud, CloudOff, Command, Focus, Gauge, LayoutDashboard,
  Link2, ListTodo, Mail, Menu, Minimize2, NotebookPen, Pause, Play, Plus,
  RefreshCw, Settings, ShieldCheck, Sparkles, TimerReset, WandSparkles, X, Zap,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assertHQCapacity, emptyHQState, HQState, mergeHQState, sanitizeHQState } from "../lib/hq-state";
import { SyncCoordinator } from "../lib/sync-coordinator";
import { DraftJournal, DraftSummary, claimDraftTab } from "../lib/draft-journal";
import { applyBrowserImport, browserImportSummary, reviewBrowserImport, NotesChoice } from "../lib/browser-import";
import { parseChapters, remainingSeconds } from "../lib/focus-clock";
import { createChapterTasks } from "../lib/study-plan";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";

const EXTENSION_ID = "cbgepkbfmcahdpahipkdeahppfbggjok";
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const todayKey = () => dateKey(new Date());
const uid = () => typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : `hq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;

type Panel = "tasks" | "calendar" | "notes" | "study" | "settings" | null;
type ThemeChoice = { name: string; hue: number; support: number };

function hash(input: string) {
  let value = 2166136261;
  for (const char of input) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function themeChoices(seed: string): ThemeChoice[] {
  const root = hash(`${seed}:${new Date().getHours()}:${todayKey()}`) % 360;
  return [
    { name: "Precision", hue: root, support: (root + 42) % 360 },
    { name: "Momentum", hue: (root + 118) % 360, support: (root + 168) % 360 },
    { name: "Deep field", hue: (root + 232) % 360, support: (root + 286) % 360 },
  ];
}

async function cloudRequest(snapshot?: HQState, baseRevision?: number, accountId?: string) {
  if (snapshot) assertHQCapacity(snapshot);
  const response = await fetch("/api/state", { cache: "no-store", headers: {"X-HQ-Account":accountId || '', ...(snapshot ? {"Content-Type":"application/json"} : {})}, signal: AbortSignal.timeout(15000), ...(snapshot ? { method: "PUT", body: JSON.stringify({ snapshot, baseRevision }) } : {}) });
  const data = await response.json() as { snapshot?: unknown; revision?: unknown; error?: string; accountId?: string };
  if (!response.ok && response.status !== 409) throw new Error(data.error || "Sync is unavailable. Keep this tab open or export your work.");
  if (!data.snapshot || typeof data.revision !== "number" || !Number.isSafeInteger(data.revision)) throw new Error("Sync returned an invalid response. Your local work was preserved.");
  if (accountId && data.accountId !== accountId) throw new Error("Your signed-in account changed. Reload before recovering or saving work.");
  return { snapshot: sanitizeHQState(data.snapshot), revision: data.revision, conflict: response.status === 409 };
}

function extensionCall<T = unknown>(message: unknown, timeout = 2500): Promise<T> {
  return new Promise((resolve, reject) => {
    const runtime = (window as typeof window & { chrome?: { runtime?: { sendMessage?: Function; lastError?: { message?: string } } } }).chrome?.runtime;
    if (!runtime?.sendMessage) return reject(new Error("Extension bridge is not available."));
    const timer = window.setTimeout(() => reject(new Error("Extension did not respond.")), timeout);
    runtime.sendMessage(EXTENSION_ID, message, (response: T) => {
      window.clearTimeout(timer);
      const error = runtime.lastError;
      if (error) reject(new Error(error.message || "Extension connection failed."));
      else resolve(response);
    });
  });
}

function formatClock(seconds: number) {
  return `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, "0")}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;
}

function AmbientField({ motion, hue }: { motion: HQState["settings"]["motion"]; hue: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0; let visible = !document.hidden; let lastFrame = 0;
    const points = Array.from({ length: motion === "full" ? 42 : 24 }, (_, i) => ({ x: (i * 137.5) % 1000, y: (i * 83.2) % 700, phase: i * .41 }));
    const resize = () => { const ratio = Math.min(devicePixelRatio || 1, 1.5); canvas.width = innerWidth * ratio; canvas.height = innerHeight * ratio; canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`; context.setTransform(ratio, 0, 0, ratio, 0, 0); };
    const draw = (time: number) => {
      if (!visible || motion === "reduced" || preference.matches) return;
      if (time - lastFrame < (motion === "full" ? 1000 / 60 : 1000 / 24)) { raf = requestAnimationFrame(draw); return; }
      lastFrame = time;
      context.clearRect(0, 0, innerWidth, innerHeight); context.globalCompositeOperation = "lighter";
      for (const point of points) {
        const x = (point.x / 1000) * innerWidth + Math.sin(time / 5200 + point.phase) * 22;
        const y = (point.y / 700) * innerHeight + Math.cos(time / 6100 + point.phase) * 15;
        context.beginPath(); context.arc(x, y, 1.1 + Math.sin(time / 1700 + point.phase) * .45, 0, Math.PI * 2);
        context.fillStyle = `hsla(${hue}, 90%, 72%, .18)`; context.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    const onVisibility = () => { visible = !document.hidden; cancelAnimationFrame(raf); if (visible && motion !== "reduced" && !preference.matches) { resize(); raf = requestAnimationFrame(draw); } else { canvas.width = 1; canvas.height = 1; } };
    addEventListener("resize", onVisibility); document.addEventListener("visibilitychange", onVisibility); preference.addEventListener("change", onVisibility); onVisibility();
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", onVisibility); document.removeEventListener("visibilitychange", onVisibility); preference.removeEventListener("change", onVisibility); canvas.width = 1; canvas.height = 1; };
  }, [motion, hue]);
  return <canvas ref={ref} className="ambient-field" aria-hidden="true" />;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><Circle size={13} /><div><strong>{title}</strong><span>{detail}</span></div></div>;
}

export default function Dashboard({ displayName, signedIn, accountId }: { displayName: string; signedIn: boolean; accountId: string }) {
  const [, renderSync] = useState(0);
  const journal = useRef<DraftJournal | null>(null);
  const [coordinator] = useState(() => new SyncCoordinator<HQState>({ initial: emptyHQState(), merge: mergeHQState, load: () => cloudRequest(undefined,undefined,accountId), save: (state,revision) => cloudRequest(state,revision,accountId), changed: () => renderSync(value => value + 1), recover: async()=>journal.current?.recoverOwn() || null, checkpoint: async value => {if (!journal.current) throw new Error('Local recovery is unavailable. Export unsaved work before closing.');await journal.current.write(value);} }));
  const state = coordinator.state, sync = coordinator.status;
  const [bridge, setBridge] = useState<"checking" | "connected" | "disabled" | "missing">("missing");
  const [bridgeMessage, setBridgeMessage] = useState("Not connected. Import is optional; automatic writeback is off.");
  const [importReview, setImportReview] = useState(false);
  const [importCandidate, setImportCandidate] = useState<HQState | null>(null);
  const [notesChoice, setNotesChoice] = useState<NotesChoice>('keep');
  const [ownProfile, setOwnProfile] = useState(false);
  const importEpoch = useRef(0);
  const [recoveryReview, setRecoveryReview] = useState(false);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const panelOpener = useRef<HTMLElement | null>(null);
  const [cinema, setCinema] = useState(false);
  const [command, setCommand] = useState("");
  const [commandResult, setCommandResult] = useState<{ title: string; detail: string; chapters?: number[]; subject?: string } | null>(null);
  const [studyDue, setStudyDue] = useState("");
  const [studyMinutes, setStudyMinutes] = useState(25);
  const [studyError, setStudyError] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [taskLimit, setTaskLimit] = useState(50);
  const [eventLimit, setEventLimit] = useState(50);
  const [themes, setThemes] = useState<ThemeChoice[]>([]);
  const [transition, setTransition] = useState(0);
  const [taskDraft, setTaskDraft] = useState("");
  const [eventDraft, setEventDraft] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const deadline = useRef<number | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<{ temp: number; label: string } | null>(null);
  const [weatherState, setWeatherState] = useState<"idle" | "loading" | "denied" | "error">("idle");

  useEffect(() => { if (!transition) return; const timer = setTimeout(() => setTransition(0), 1300); return () => clearTimeout(timer); }, [transition]);
  useEffect(() => { if (!running) setSecondsLeft(state.focus.minutes * 60); }, [state.focus.minutes]);
  useEffect(() => {
    let cancelled=false;let release: (()=>void) | undefined;
    void (async()=> {
      try {const claimed=await claimDraftTab(accountId);release=claimed.release;if(cancelled){release();return;}journal.current=new DraftJournal(accountId,claimed.tabId);}
      catch {if(cancelled)return;journal.current=null;}
      await coordinator.start();
    })();
    return () => {cancelled=true;release?.();coordinator.dispose();};
  }, [coordinator,accountId]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (coordinator.pending) { event.preventDefault(); event.returnValue = ""; } };
    const retry = () => { void coordinator.retry(); };
    addEventListener("beforeunload", protect); addEventListener("online", retry);
    return () => { removeEventListener("beforeunload", protect); removeEventListener("online", retry); };
  }, [coordinator]);
  useEffect(() => {
    document.documentElement.dataset.motion = state.settings.motion;
    return () => { delete document.documentElement.dataset.motion; };
  }, [state.settings.motion]);
  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty("--hue", String(state.settings.accentHue));
    style.setProperty("--support-hue", String(state.settings.supportHue));
    return () => { style.removeProperty("--hue"); style.removeProperty("--support-hue"); };
  }, [state.settings.accentHue, state.settings.supportHue]);
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setCinema(false); }; addEventListener("keydown", escape); return () => removeEventListener("keydown", escape); }, []);
  useEffect(() => {
    const current = new Date(); setNow(current); setEventDate(value => value || dateKey(current));
    const refresh = () => { if (!document.hidden) setNow(new Date()); };
    const id = window.setInterval(refresh, 30000); document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  useEffect(() => {
    if (!running) return;
    const tick = () => { const value = remainingSeconds(deadline.current ?? Date.now()); setSecondsLeft(value); if (value === 0) { deadline.current = null; setRunning(false); } };
    const id = window.setInterval(tick, 1000); document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [running]);

  const toggleTimer = () => {
    if (running) { setSecondsLeft(remainingSeconds(deadline.current ?? Date.now())); deadline.current = null; setRunning(false); }
    else { const seconds = secondsLeft > 0 ? secondsLeft : state.focus.minutes * 60; deadline.current = Date.now() + seconds * 1000; setSecondsLeft(seconds); setRunning(true); }
  };

  const update = useCallback((mutator: (current: HQState) => HQState) => {
    coordinator.change(current => sanitizeHQState(mutator(current), { preserveOverflow: true }));
  }, [coordinator]);

  const pullBridge = useCallback(async () => {
    const epoch=++importEpoch.current;setImportCandidate(null);setOwnProfile(false);setNotesChoice('keep');
    setBridge("checking"); setBridgeMessage("Reading the selected extension data for preview…");
    try {
      const response = await extensionCall<{ ok: boolean; enabled?: boolean; snapshot?: unknown; error?: string }>({ type: "hq:bridge:pull", protocol: 1 });
      if(epoch!==importEpoch.current)return;
      if (!response?.ok || !response.snapshot) { setBridge(response?.enabled === false ? "disabled" : "missing"); setBridgeMessage(response?.error || "Import unavailable. Enable dashboard access in the extension popup, then retry."); return; }
      setBridge("connected");
      setImportCandidate(reviewBrowserImport(response.snapshot)); setBridgeMessage("Preview ready. Nothing has been saved to your account yet.");
    } catch (error) { if(epoch!==importEpoch.current)return;setImportCandidate(null); setBridge("missing"); setBridgeMessage(error instanceof Error ? error.message : "Extension unavailable. Install or reload the companion and retry."); }
  }, []);

  const acceptImport = () => {
    if (!importCandidate || !coordinator.ready || !ownProfile || coordinator.conflict) return;
    try { update(current => applyBrowserImport(current, importCandidate,notesChoice)); }
    catch(error){setBridgeMessage(error instanceof Error ? error.message : 'Import stopped without changing your work.');return;}
    setBridgeMessage("Planning data added to this dashboard. Check Saved for cloud confirmation. Existing tasks, preferences and focus were kept. Automatic writeback is off.");
    setImportReview(false); setImportCandidate(null);
  };

  const openImport = () => {setPanel(null);setImportCandidate(null);setOwnProfile(false);setImportReview(true);};
  const closeImport = () => {importEpoch.current++;setImportReview(false);setImportCandidate(null);setBridge(value=>value==='checking'?'missing':value);};
  const openRecovery = async () => {
    setPanel(null);setRecoveryReview(true);setRecoveryMessage('Reading recovery copies on this device…');
    try {if(!journal.current)throw new Error('Local recovery is unavailable in this browser.');await coordinator.checkpointSettled();setDrafts(await journal.current.list());setRecoveryMessage('Showing up to 20 recovery summaries for your signed-in account. Full documents load only when you choose one.');}
    catch(error){setRecoveryMessage(error instanceof Error ? error.message : 'Could not read recovery copies.');}
  };
  const exportDraft = async (record: DraftSummary) => {
    try {if(!journal.current)throw new Error('Local recovery is unavailable.');exportWork((await journal.current.read(record)).state);}
    catch(error){setRecoveryMessage(error instanceof Error ? error.message : 'Could not export this copy.');}
  };
  const olderDrafts = async () => {
    try {if(!journal.current)return;const next=await journal.current.list(drafts.at(-1));if(next.length)setDrafts(next);else setRecoveryMessage('These are the oldest recovery copies.');}
    catch(error){setRecoveryMessage(error instanceof Error ? error.message : 'Could not read older copies.');}
  };
  const restoreDraft = async (record: DraftSummary) => {
    try {if(!journal.current)throw new Error('Local recovery is unavailable.');coordinator.restore(await journal.current.read(record));await coordinator.checkpointSettled();setRecoveryReview(false);if(coordinator.conflict)setPanel('notes');void coordinator.retry();}
    catch(error){setRecoveryMessage(error instanceof Error ? error.message : 'Recovery stopped. The saved copy is unchanged.');}
  };

  const exportWork = (snapshot = coordinator.state) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `operation-hq-recovery-${todayKey()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const requestWeather = useCallback(() => {
    if (!navigator.geolocation) { setWeatherState("error"); return; }
    setWeatherState("loading");
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", String(position.coords.latitude)); url.searchParams.set("longitude", String(position.coords.longitude)); url.searchParams.set("current", "temperature_2m,weather_code");
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error(); const data = await response.json() as { current?: { weather_code?: number; temperature_2m?: number } };
        if (typeof data.current?.temperature_2m !== "number" || !Number.isFinite(data.current.temperature_2m) || typeof data.current.weather_code !== "number") throw new Error("Invalid weather response");
        const code = Number(data.current?.weather_code); const label = code === 0 ? "Clear" : code < 4 ? "Cloud breaks" : code < 50 ? "Low cloud" : code < 70 ? "Rain" : code < 80 ? "Snow" : code < 96 ? "Showers" : "Storm";
        setWeather({ temp: Math.round(Number(data.current?.temperature_2m)), label }); setWeatherState("idle");
      } catch { setWeatherState("error"); }
    }, error => setWeatherState(error.code === 1 ? "denied" : "error"), { timeout: 8000, maximumAge: 30 * 60 * 1000 });
  }, []);

  useEffect(() => { navigator.permissions?.query({ name: "geolocation" }).then(permission => { if (permission.state === "granted") requestWeather(); }).catch(() => {}); }, [requestWeather]);

  const activeTasks = useMemo(() => state.tasks.filter(task => !task.completed).sort((a, b) => {
    const rank = { critical: 0, high: 1, normal: 2, low: 3 }; return rank[a.priority] - rank[b.priority] || String(a.due || "9999").localeCompare(String(b.due || "9999"));
  }), [state.tasks]);
  const currentDateKey = now ? dateKey(now) : "";
  const todayEvents = useMemo(() => state.events.filter(event => currentDateKey && event.date === currentDateKey).sort((a, b) => String(a.start).localeCompare(String(b.start))), [state.events, currentDateKey]);
  const filteredTasks = useMemo(() => state.tasks.filter(task => task.title.toLowerCase().includes(taskQuery.toLowerCase())), [state.tasks, taskQuery]);
  const agendaEvents = useMemo(() => [...state.events].sort((a,b) => a.date.localeCompare(b.date)), [state.events]);
  const nextTask = activeTasks[0];

  const applyTheme = (choice: ThemeChoice) => {
    update(current => ({ ...current, settings: { ...current.settings, accentHue: choice.hue, supportHue: choice.support, updatedAt: Date.now() } }));
    setTransition(value => value + 1); setThemes([]);
  };

  const runCommand = (event: FormEvent) => {
    event.preventDefault(); const text = command.trim(); if (!text) return;
    setStudyError(""); setStudyDue(""); setThemes([]);
    const chapters = parseChapters(text);
    const subject = /math/i.test(text) ? "Mathematics" : /science/i.test(text) ? "Science" : /hsie|history|geography/i.test(text) ? "HSIE" : /english/i.test(text) ? "English" : undefined;
    if (/\bchapters?\b/i.test(text) && !chapters.length) { setCommandResult({ title: "Check chapter list", detail: "Use whole chapter numbers, such as chapters 5, 7, 8 and 10. No tasks were changed." }); return; }
    if (chapters.length && subject) { setCommandResult({ title: `${subject} mission ready`, detail: `${chapters.length} focused chapter blocks will be created. Nothing changes until you approve below.`, chapters, subject }); setThemes(themeChoices(text)); return; }
    if (/bookmark|tabs?|workspace/i.test(text)) { setCommandResult({ title: "Browser review ready", detail: "Open the extension’s local browser tools. No tab or bookmark will be changed without another confirmation." }); return; }
    if (/note/i.test(text)) { setPanel("notes"); setCommandResult({ title: "Notes opened", detail: "Check the saving status before closing this tab. Conflicting edits are kept for review." }); return; }
    if (/calendar|schedule|timetable/i.test(text)) { setPanel("calendar"); setCommandResult({ title: "Calendar opened", detail: "This dashboard has a basic agenda. Full timetable planning remains in the extension; this command does not reschedule your work." }); return; }
    setCommandResult({ title: "I need one clearer instruction", detail: "Try a subject plus chapters, ‘open bookmarks’, ‘show calendar’, or ‘open notes’. I will ask before anything consequential changes." });
  };

  const applyStudyPlan = () => {
    if (!commandResult?.chapters?.length || !commandResult.subject) return;
    if (running) { setCommandResult({ ...commandResult, detail: "Pause your current timer before replacing its mission." }); return; }
    try {
      const result = createChapterTasks({ subject: commandResult.subject, chapters: commandResult.chapters, due: studyDue, today: todayKey(), minutes: studyMinutes }, state.tasks, uid, Date.now());
      update(current => {
        const latest = createChapterTasks({ subject: commandResult.subject!, chapters: commandResult.chapters!, due: studyDue, today: todayKey(), minutes: studyMinutes }, current.tasks, uid, Date.now());
        return { ...current, tasks: [...current.tasks, ...latest.tasks], focus: { mission: `${commandResult.subject} — Chapter ${commandResult.chapters![0]}`, subject: commandResult.subject, chapters: commandResult.chapters!, minutes: studyMinutes, updatedAt: Date.now() } };
      });
      setSecondsLeft(studyMinutes * 60); setStudyError("");
      setCommandResult({ title: "Mission staged", detail: `${result.tasks.length} chapter tasks added with deadline ${studyDue}; ${result.reused} existing active tasks kept with their original dates. No calendar events were moved.` });
    } catch (error) { setStudyError(error instanceof Error ? error.message : "Could not create the study plan."); }
  };

  const openBrowserTool = async (tool: string) => { try { const response = await extensionCall<{ok?:boolean;error?:string}>({ type: "hq:bridge:open-tool", protocol: 1, tool }); if (!response?.ok) throw new Error(response?.error || "The extension could not open this tool."); setBridge("connected"); setBridgeMessage("Browser tool opened in the extension."); } catch (error) { setBridge("missing"); setBridgeMessage(error instanceof Error ? error.message : "Browser tool unavailable."); } };
  const addTask = (event: FormEvent) => { event.preventDefault(); const title = taskDraft.trim(); if (!title) return; update(current => ({ ...current, tasks: [...current.tasks, { id: uid(), title, priority: "normal", completed: false, updatedAt: Date.now() }] })); setTaskDraft(""); };
  const addEvent = (event: FormEvent) => { event.preventDefault(); const title = eventDraft.trim(); if (!title || !eventDate) return; update(current => ({ ...current, events: [...current.events, { id: uid(), title, date: eventDate, updatedAt: Date.now() }] })); setEventDraft(""); };
  const syncLabel = sync === "saved" ? "Saved" : sync === "saving" ? "Saving…" : sync === "conflict" ? "Review conflict" : sync === "loading" ? "Loading…" : "Not saved";
  const greeting = !now ? "Welcome back" : now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <main onClickCapture={event => { if (!panel && !importReview && !recoveryReview) { const button = (event.target as HTMLElement).closest("button"); if (button) panelOpener.current = button; } }} className={`hq-shell density-${state.settings.density} ${cinema ? "cinema" : ""}`} style={{ "--hue": state.settings.accentHue, "--support-hue": state.settings.supportHue } as React.CSSProperties}>
      <AmbientField motion={state.settings.motion} hue={state.settings.accentHue} /><div className="grain" aria-hidden="true" />
      {transition > 0 && <div key={transition} className="theme-transition" aria-hidden="true"><i /><i /><i /></div>}
      <header className="topbar" inert={cinema}><button className="brand" onClick={() => setPanel(null)} aria-label="Operation HQ home"><span className="brand-mark"><Zap size={17} /></span><span><b>OPERATION HQ</b><small>COMMAND CENTRE</small></span></button><div className="time-centre"><strong>{now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—:—"}</strong><span>{now ? now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) : "Loading local time"}</span></div><div className="top-actions"><span className={`status-chip ${sync}`} title={signedIn ? "Private account sync" : "Sign in is required for cloud sync"}>{sync === "unsaved" ? <CloudOff size={14} /> : <Cloud size={14} />}{syncLabel}</span><button className="icon-button" onClick={() => setCinema(true)} title="Hide the interface"><Minimize2 size={18} /></button><button className="avatar" onClick={() => setPanel("settings")} aria-label="Open settings">{displayName.slice(0, 1).toUpperCase()}</button></div></header>
      <aside className="rail" aria-label="Primary navigation" inert={cinema}><button className={!panel ? "active" : ""} onClick={() => setPanel(null)}><LayoutDashboard /><span>Home</span></button><button className={panel === "tasks" ? "active" : ""} onClick={() => setPanel("tasks")}><ListTodo /><span>Tasks</span></button><button className={panel === "calendar" ? "active" : ""} onClick={() => setPanel("calendar")}><CalendarDays /><span>Calendar</span></button><button className={panel === "study" ? "active" : ""} onClick={() => setPanel("study")}><BookOpen /><span>Study</span></button><button className={panel === "notes" ? "active" : ""} onClick={() => setPanel("notes")}><NotebookPen /><span>Notes</span></button><div className="rail-spacer"/><button onClick={() => openBrowserTool("bookmarks")}><Bookmark /><span>Bookmarks</span></button><button onClick={() => openBrowserTool("gmail")}><Mail /><span>Mail</span></button><button className={panel === "settings" ? "active" : ""} onClick={() => setPanel("settings")}><Settings /><span>Settings</span></button></aside>
      <section className="workspace" inert={cinema}>
        {(coordinator.error || sync === "unsaved" || sync === "conflict") && <div className="save-notice" role="status"><p>{coordinator.error || "Changes have not reached cloud storage yet. Check the device recovery status below before leaving."}</p><div className="button-row"><button className="small-button" onClick={() => void coordinator.retry()}>Retry save</button><button className="small-button" onClick={() => exportWork()}>Export current work</button>{coordinator.conflict && <button className="small-button" onClick={() => setPanel("notes")}>Review both notes</button>}</div></div>}
        {coordinator.pending && <p className="device-copy-status" role="status">{coordinator.recoveryError || (coordinator.journaledGeneration === coordinator.generation ? "Unsaved work has a recovery copy on this device." : "Writing the recovery copy on this device…")}</p>}
        {coordinator.recoveryError && !coordinator.pending && <p className="device-copy-status" role="status">{coordinator.recoveryError}</p>}
        {sync === "loading" && <p role="status">Loading your saved work. New edits will be kept while it loads.</p>}
        <div className="hero-copy"><div><span className="eyebrow"><Sparkles size={14}/> YOUR DAY</span><h1>{greeting}, {displayName}.</h1><p>{nextTask ? <>Next by priority and due date: <strong>{nextTask.title}</strong>{nextTask.due ? `, due ${nextTask.due}` : ""}.</> : "No active tasks are recorded. Add the next thing you want to work on."}</p></div><button className="primary-action" onClick={() => nextTask ? setPanel("tasks") : setPanel("study")}><span>{nextTask ? "Review next task" : "Build a mission"}</span><ArrowRight size={18}/></button></div>
        <div className="widget-grid">
          <article className="widget foresight-card"><header><span className="widget-icon"><BrainCircuit/></span><div><small>FORESIGHT</small><h2>Next in your queue</h2></div><span className="signal">TASKS</span></header>{nextTask ? <><div className="focus-line"><span className={`priority-dot ${nextTask.priority}`}/><div><strong>{nextTask.title}</strong><p>{nextTask.subject || "Personal operations"} · {nextTask.estimateMinutes ? `${nextTask.estimateMinutes} min` : "estimate when ready"}</p></div></div><button className="text-button" onClick={() => setPanel("tasks")}>Review tasks <ChevronRight size={15}/></button></> : <Empty title="The queue is clear" detail="Add a task or ask Nexus to build a study mission."/>}</article>
          <article className="widget focus-card"><header><span className="widget-icon"><Focus/></span><div><small>FOCUS</small><h2>{state.focus.mission || "Unassigned mission"}</h2></div></header><div className="timer-face"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52"/><circle className="timer-progress" cx="60" cy="60" r="52" pathLength="100" style={{ strokeDashoffset: 100 - ((state.focus.minutes * 60 - secondsLeft) / Math.max(1, state.focus.minutes * 60)) * 100 }}/></svg><strong>{formatClock(secondsLeft)}</strong></div><div className="button-row"><button className="round-action" onClick={toggleTimer} aria-label={running ? "Pause focus timer" : "Start focus timer"}>{running ? <Pause/> : <Play/>}</button><button className="round-action secondary" onClick={() => { deadline.current = null; setRunning(false); setSecondsLeft(state.focus.minutes * 60); }} aria-label="Reset focus timer"><TimerReset/></button></div></article>
          <article className="widget weather-card"><header><span className="widget-icon"><Cloud/></span><div><small>WEATHER</small><h2>{weather ? weather.label : "Local atmosphere"}</h2></div></header>{weather ? <div className="weather-reading"><strong>{weather.temp}°</strong><span>Current temperature · °C<button className="small-button" onClick={requestWeather} disabled={weatherState === "loading"}>{weatherState === "loading" ? "Refreshing…" : weatherState === "error" ? "Refresh failed · retry" : "Refresh"}</button></span></div> : <button className="weather-request" onClick={requestWeather} disabled={weatherState === "loading"}>{weatherState === "loading" ? <RefreshCw className="spin"/> : <Cloud/>}<span>{weatherState === "denied" ? "Location blocked—change this site’s permission to retry" : weatherState === "error" ? "Weather unavailable—retry" : "Use my current location"}</span></button>}</article>
          <article className="widget schedule-card"><header><span className="widget-icon"><CalendarDays/></span><div><small>TODAY</small><h2>{todayEvents.length ? `${todayEvents.length} scheduled` : "No fixed events"}</h2></div></header><div className="timeline-list">{todayEvents.slice(0,3).map(event => <button key={event.id} onClick={() => setPanel("calendar")}><time>{event.start || "All day"}</time><span>{event.title}</span></button>)}{!todayEvents.length && <Empty title="Open capacity" detail="No calendar events are recorded for today. This is not a capacity estimate."/>}</div></article>
          <article className="widget tasks-card"><header><span className="widget-icon"><ListTodo/></span><div><small>TASKS</small><h2>{activeTasks.length ? `${activeTasks.length} active` : "Queue clear"}</h2></div><button className="mini-add" onClick={() => setPanel("tasks")} aria-label="Add task"><Plus/></button></header><div className="mini-list">{activeTasks.slice(0,4).map(task => <button key={task.id} onClick={() => update(current => ({...current,tasks:current.tasks.map(item => item.id===task.id ? {...item,completed:true,updatedAt:Date.now()} : item)}))}><Circle/><span>{task.title}</span><small>{task.priority}</small></button>)}{!activeTasks.length && <Empty title="Nothing pending" detail="Capture an action when one becomes real."/>}</div></article>
          <article className="widget bridge-card"><header><span className="widget-icon"><Link2/></span><div><small>BROWSER BRIDGE</small><h2>{bridge === "connected" ? "Extension connected" : bridge === "disabled" ? "Connection disabled" : "Extension not detected"}</h2></div><span className={`bridge-light ${bridge}`}/></header><p role="status">{bridgeMessage}</p><div className="button-row"><button className="small-button" onClick={openImport}><RefreshCw/>Import from extension</button><button className="small-button" onClick={() => openBrowserTool("nexus")}><Gauge/>Browser tools</button></div></article>
        </div>
        <form className="nexus" onSubmit={runCommand}><span className="nexus-core"><Command/></span><div className="nexus-input"><label htmlFor="nexus-command">NEXUS</label><input id="nexus-command" value={command} onChange={event => setCommand(event.target.value)} placeholder="Tell HQ what needs to happen…" autoComplete="off"/></div><button type="submit">Route <ArrowRight/></button></form>
        {commandResult && <section className="command-result" aria-live="polite"><button className="result-close" onClick={() => setCommandResult(null)} aria-label="Dismiss result"><X/></button><span className="result-icon"><WandSparkles/></span><div><small>REVIEW BEFORE ACTION</small><h2>{commandResult.title}</h2><p>{commandResult.detail}</p>{commandResult.chapters && <div className="chapter-row">{commandResult.chapters.map(chapter => <span key={chapter}>CH {chapter}</span>)}</div>}{themes.length > 0 && <div className="theme-options">{themes.map(choice => <button key={choice.name} onClick={() => applyTheme(choice)} style={{"--choice":choice.hue} as React.CSSProperties}><i/><span>{choice.name}</span></button>)}</div>}<div className="button-row">{commandResult.chapters && <><div className="study-plan-inputs"><label>Deadline<input type="date" required min={currentDateKey || undefined} value={studyDue} onChange={event => setStudyDue(event.target.value)}/></label><label>Minutes per chapter<input type="number" min={5} max={180} step={1} value={studyMinutes} onChange={event => setStudyMinutes(Number(event.target.value))}/></label></div>{studyError && <p role="alert">{studyError}</p>}<button className="small-button accent" onClick={applyStudyPlan}><Check/>Apply study plan</button></>}{/Browser review/.test(commandResult.title) && <button className="small-button accent" onClick={() => openBrowserTool("bookmarks")}><Bookmark/>Open browser review</button>}</div></div></section>}
      </section>
      <Dialog open={Boolean(panel)} onOpenChange={open => { if (!open) setPanel(null); }}><DialogContent className="module-panel hq-dialog" showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); panelOpener.current?.focus(); }}><header className="panel-head"><div><small>OPERATION HQ</small><DialogTitle>{panel === "tasks" ? "Tasks" : panel === "calendar" ? "Calendar" : panel === "notes" ? "Notes" : panel === "study" ? "Study overview" : "System settings"}</DialogTitle></div><button onClick={() => setPanel(null)} aria-label="Close panel"><X/></button></header>
        {panel === "tasks" && <div className="panel-body"><form className="capture-form" onSubmit={addTask}><input aria-label="New task" maxLength={500} value={taskDraft} onChange={event => setTaskDraft(event.target.value)} placeholder="Add a clear next action" autoFocus/><button><Plus/>Add</button></form><input className="task-search" aria-label="Search tasks" placeholder="Search tasks" value={taskQuery} onChange={event => {setTaskQuery(event.target.value);setTaskLimit(50);}}/><div className="task-list">{filteredTasks.slice(0, taskLimit).map(task => <div key={task.id} className={task.completed?"done":""}><button aria-label={`${task.completed ? "Reopen" : "Complete"} ${task.title}`} onClick={() => update(current => ({...current,tasks:current.tasks.map(item => item.id===task.id ? {...item,completed:!item.completed,updatedAt:Date.now()} : item)}))}>{task.completed?<CheckCircle2/>:<Circle/>}</button><span>{task.title}</span><small>{task.priority}</small></div>)}{!filteredTasks.length && <Empty title="No matching tasks" detail="Add an action or change the search."/>}</div>{filteredTasks.length > taskLimit && <button className="small-button" onClick={() => setTaskLimit(value => value + 50)}>Show next 50 tasks</button>}</div>}
        {panel === "calendar" && <div className="panel-body"><form className="capture-form event-form" onSubmit={addEvent}><input aria-label="Event title" maxLength={500} value={eventDraft} onChange={event => setEventDraft(event.target.value)} placeholder="Event name" autoFocus/><input aria-label="Event date" type="date" required value={eventDate} onChange={event => setEventDate(event.target.value)}/><button><Plus/>Add</button></form><div className="agenda">{agendaEvents.slice(0,eventLimit).map(event => <div key={event.id}><time>{new Date(`${event.date}T00:00:00`).toLocaleDateString([], {weekday:"short",day:"numeric",month:"short"})}</time><span>{event.title}</span><small>{event.start || "All day"}</small></div>)}{!state.events.length && <Empty title="Calendar is clear" detail="Add an event or explicitly import calendar events from the extension. Recurring timetable blocks are not imported."/>}</div>{agendaEvents.length > eventLimit && <button className="small-button" onClick={() => setEventLimit(value => value + 50)}>Show next 50 events</button>}</div>}
        {panel === "notes" && <div className="panel-body notes-body"><div className="notes-status"><ShieldCheck/>One document · check save status before leaving</div>{coordinator.conflict && <section className="notes-conflict"><h3>Two versions need your decision</h3><p>Your current text remains editable below. Export it before choosing another version if you want a separate backup.</p><label htmlFor="remote-notes">Saved elsewhere</label><textarea id="remote-notes" readOnly value={coordinator.conflict.remote}/><div className="button-row"><button className="small-button" onClick={() => coordinator.resolveNotes(state.notes.plain)}>Keep my current text</button><button className="small-button" onClick={() => coordinator.resolveNotes(coordinator.conflict!.remote)}>Use the other version</button><button className="small-button" onClick={() => coordinator.resolveNotes(state.notes.plain + "\n\n--- Other version ---\n\n" + coordinator.conflict!.remote)}>Keep both</button></div></section>}<textarea aria-label="Notes document" maxLength={200000} value={state.notes.plain} onChange={event => update(current => ({...current,notes:{plain:event.target.value,updatedAt:Date.now()}}))} placeholder="Write without fighting the editor…" autoFocus/></div>}
        {panel === "study" && <div className="panel-body study-body"><div className="study-intro"><BrainCircuit/><div><h3>Build today’s mission</h3><p>Ask Nexus for a subject and chapter list. It proposes tasks before you approve. Automatic rescheduling and textbook chapter navigation are not yet available in this dashboard.</p></div></div><div className="study-stats"><div><strong>{state.assignments.length}</strong><span>Assignments</span></div><div><strong>{state.exams.length}</strong><span>Exam plans</span></div><div><strong>{activeTasks.filter(task=>task.subject).length}</strong><span>Study actions</span></div></div><button className="panel-command" onClick={() => {panelOpener.current = document.getElementById("nexus-command");setPanel(null);}}>Ask Nexus to build a study plan <ArrowRight/></button></div>}
        {panel === "settings" && <div className="panel-body settings-body"><section><h3>Motion</h3><p>Full animates the ambient field up to 60fps; Balanced caps it at 24fps. Reduced removes decorative motion. Actual battery usage depends on your device.</p><div className="segmented">{(["full","balanced","reduced"] as const).map(mode => <button key={mode} className={state.settings.motion===mode?"active":""} onClick={() => update(current => ({...current,settings:{...current.settings,motion:mode,updatedAt:Date.now()}}))}>{mode}</button>)}</div></section><section><h3>Density</h3><div className="segmented">{(["calm","balanced","command"] as const).map(mode => <button key={mode} className={state.settings.density===mode?"active":""} onClick={() => update(current => ({...current,settings:{...current.settings,density:mode,updatedAt:Date.now()}}))}>{mode}</button>)}</div></section><section><h3>Connection</h3><p>{signedIn ? "Cloud saves are available when signed in; check the live save status." : "Sign in to enable cross-device saves."} The browser bridge is {bridge}.</p><div className="button-row"><button className="small-button" onClick={openImport}><RefreshCw/>Review browser import</button><button className="small-button" onClick={() => void openRecovery()}>Recover unsaved drafts</button></div></section></div>}
      </DialogContent></Dialog>
      <Dialog open={importReview} onOpenChange={open => {if(!open)closeImport();}}><DialogContent className="module-panel hq-dialog" showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={event => {event.preventDefault();panelOpener.current?.focus();}}>
        <header className="panel-head"><DialogTitle>Import browser planning data</DialogTitle><button onClick={closeImport} aria-label="Close import"><X/></button></header>
        <div className="panel-body import-body"><p>Read tasks, calendar entries and notes from the extension, then choose what to add to this account. Browser bookmarks, emails and credentials stay in the extension. Automatic writeback is off.</p><p>Enable <strong>Allow dashboard access</strong> in the extension popup first.</p>
          <button className="small-button" disabled={bridge === "checking"} onClick={pullBridge}>{bridge === "checking" ? "Reading…" : "Read preview from extension"}</button><p role="status">{bridgeMessage}</p>
          {importCandidate && <>
            <p>{browserImportSummary(state,importCandidate).newTasks} new tasks · {browserImportSummary(state,importCandidate).newEvents} new events. Previously imported records and your dashboard edits are kept.</p>
            <div className="import-preview"><h3>Tasks</h3>{importCandidate.tasks.slice(0,10).map(task=><p key={task.id}>{task.title}<small>{task.due ? ` · ${task.due}` : ''} · {task.priority}</small></p>)}{importCandidate.tasks.length>10 && <p>Export the preview to review all {importCandidate.tasks.length} tasks.</p>}<h3>Calendar</h3>{importCandidate.events.slice(0,10).map(event=><p key={event.id}>{event.date} · {event.title}</p>)}</div>
            <label className="preview-notes-label">Browser notes<textarea aria-label="Browser notes preview" readOnly value={importCandidate.notes.plain} /></label>
            {browserImportSummary(state,importCandidate).notesDiffer && <fieldset className="import-notes-choice"><legend>Your notes differ. Choose what to keep.</legend>{(['keep','browser','both'] as const).map(choice=><label key={choice}><input type="radio" name="notes-import" value={choice} checked={notesChoice===choice} onChange={()=>setNotesChoice(choice)}/>{choice==='keep' ? 'Keep dashboard notes' : choice==='browser' ? 'Use browser notes' : 'Keep both versions'}</label>)}</fieldset>}
            <label className="profile-confirm"><input type="checkbox" checked={ownProfile} onChange={event=>setOwnProfile(event.target.checked)}/>This is my browser profile; add this preview to my signed-in account.</label>
            <div className="button-row"><button className="small-button" onClick={() => exportWork(importCandidate)}>Export preview</button><button className="small-button accent" disabled={!coordinator.ready || Boolean(coordinator.conflict) || !ownProfile} onClick={acceptImport}>Import into my account</button></div>
          </>}
        </div>
      </DialogContent></Dialog>
      <Dialog open={recoveryReview} onOpenChange={setRecoveryReview}><DialogContent className="module-panel hq-dialog" showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={event=>{event.preventDefault();panelOpener.current?.focus();}}>
        <header className="panel-head"><DialogTitle>Recover unsaved drafts</DialogTitle><button onClick={()=>setRecoveryReview(false)} aria-label="Close recovery"><X/></button></header>
        <div className="panel-body"><p role="status">{recoveryMessage}</p>{drafts.length===0 && <p>No pending recovery copies were found for this account.</p>}{drafts.map(record=><section className="draft-record" key={record.id}><h3>{new Date(record.savedAt).toLocaleString()}</h3><p>{record.tasks} tasks · {record.events} events · {record.noteCharacters} note characters</p><div className="button-row"><button className="small-button" onClick={()=>void exportDraft(record)}>Export draft</button><button className="small-button accent" onClick={()=>void restoreDraft(record)}>Review and recover</button></div></section>)}{drafts.length>0 && <div className="button-row"><button className="small-button" onClick={()=>void olderDrafts()}>Older copies</button><button className="small-button" onClick={()=>void openRecovery()}>Newest copies</button></div>}</div>
      </DialogContent></Dialog>
      {cinema && <button className="cinema-exit" onClick={() => setCinema(false)}><Menu/>Restore dashboard</button>}
    </main>
  );
}
