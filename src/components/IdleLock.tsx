// Idle auto-lock for shared warehouse PCs — new component, zero impact on packing logic.
// 15 min silent timer (any tab activity resets all tabs via localStorage heartbeat),
// 60s dismissible warning pill, then fullscreen lock: password-only unlock (email
// prefilled, Supabase re-auth). Drafts/board state persist in localStorage throughout.
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n";

const IDLE_MS = 15 * 60 * 1000;
const WARN_MS = 60 * 1000;
const PING_KEY = "plgen-idle-ping";
export const LOCK_NOW_EVENT = "plgen-lock-now";

function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function IdleLock(){
  const { user, profile, signIn } = useAuth();
  const { t } = useLanguage();
  const [locked, setLocked] = useState(false);
  const [warnLeft, setWarnLeft] = useState<number | null>(null);
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [lockedAt, setLockedAt] = useState<string>("");
  const lastRef = useRef<number>(Date.now());
  const lockedRef = useRef(false);
  const lastPingWrite = useRef(0);

  const touch = ()=>{
    lastRef.current = Date.now();
    if (lockedRef.current) return;
    setWarnLeft(null);
    // heartbeat so other tabs stay awake (throttled)
    if (Date.now() - lastPingWrite.current > 5000) {
      lastPingWrite.current = Date.now();
      try { localStorage.setItem(PING_KEY, String(Date.now())); } catch {}
    }
  };

  useEffect(()=>{
    if (!user) return;
    lockedRef.current = false;
    setLocked(false);
    setWarnLeft(null);
    lastRef.current = Date.now();

    const onActivity = ()=> touch();
    const events: (keyof WindowEventMap)[] = ["mousemove","mousedown","keydown","touchstart","scroll","wheel"];
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    const onPing = (e: StorageEvent)=>{
      if (e.key === PING_KEY && e.newValue) {
        const v = Number(e.newValue);
        if (!isNaN(v) && v > lastRef.current) {
          lastRef.current = v;
          if (!lockedRef.current) setWarnLeft(null);
        }
      }
    };
    window.addEventListener("storage", onPing);
    const lockNow = ()=>{
      lockedRef.current = true;
      setWarnLeft(null);
      setPw(""); setErr("");
      setLockedAt(new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));
      setLocked(true);
    };
    window.addEventListener(LOCK_NOW_EVENT, lockNow as any);

    const tick = setInterval(()=>{
      if (lockedRef.current || document.hidden) return;
      const idle = Date.now() - lastRef.current;
      if (idle >= IDLE_MS) {
        lockNow();
      } else if (idle >= IDLE_MS - WARN_MS) {
        setWarnLeft(IDLE_MS - idle);
      } else {
        setWarnLeft(prev => (prev === null ? prev : null));
      }
    }, 1000);
    return ()=>{
      events.forEach(e => window.removeEventListener(e, onActivity));
      window.removeEventListener("storage", onPing);
      window.removeEventListener(LOCK_NOW_EVENT, lockNow as any);
      clearInterval(tick);
    };
  },[user]);

  if (!user) return null;

  const unlock = async (e: React.FormEvent)=>{
    e.preventDefault();
    setErr("");
    if (!pw) return;
    setUnlocking(true);
    const email = (profile?.email || user.email || "").trim().toLowerCase();
    const r = await signIn(email, pw);
    setUnlocking(false);
    if ((r as any)?.error) { setErr((r as any).error); return; }
    lockedRef.current = false;
    setPw("");
    setLocked(false);
    setWarnLeft(null);
    touch();
  };

  return (
    <>
      {warnLeft !== null && !locked && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[95] flex items-center gap-3 px-4 py-2.5 rounded-full bg-[#0f1e2e] text-white text-xs font-bold shadow-[0_8px_24px_rgba(0,0,0,0.25)] border border-white/10">
          <span>🔒 {t("idle.lockingIn", { left: fmtLeft(warnLeft) })}</span>
          <button onClick={touch} className="px-3 py-1 rounded-full bg-white text-[#0f1e2e] font-black hover:bg-gray-100 transition active:scale-95">{t("idle.stay")}</button>
        </div>
      )}
      {locked && (
        <div className="fixed inset-0 z-[100] bg-gradient-to-br from-[#0f1e2e] via-[#162a45] to-[#1e3a5f] flex items-center justify-center p-4 overflow-hidden">
          <div className="absolute -top-24 -right-24 w-[520px] h-[520px] bg-white/[0.06] rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 w-[640px] h-[640px] bg-sky-400/[0.07] rounded-full blur-[90px] pointer-events-none" />
          <div className="relative w-full max-w-sm rounded-[24px] overflow-hidden border border-white/10 bg-white/5 backdrop-blur-sm shadow-[0_24px_64px_rgba(0,0,0,0.28)] p-8 text-white text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-white text-[#0f1e2e] flex items-center justify-center text-2xl font-black shadow-lg border border-white/20">
              {(profile?.alias || profile?.email || user.email || "?")[0].toUpperCase()}
            </div>
            <div className="mt-3 font-black text-[16px]">{profile?.alias || user.email.split("@")[0]}</div>
            <div className="text-[11px] tracking-widest font-semibold text-white/50">{profile?.role || ""}</div>
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold">🔒 {t("idle.locked")}</div>
            <form onSubmit={unlock} className="mt-5 space-y-3 text-left">
              <div>
                <label className="text-xs font-extrabold tracking-wide text-white/70">{t("idle.password")}</label>
                <div className="relative mt-1">
                  <input value={pw} onChange={e=> setPw(e.target.value)} placeholder="••••••••" type={showPw ? "text" : "password"} required autoComplete="current-password" autoFocus className="w-full border border-white/15 rounded-xl pl-3 pr-12 py-3 text-sm bg-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/25 transition" />
                  <button type="button" onClick={()=> setShowPw(v=>!v)} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg text-xs font-bold text-white/60 hover:bg-white/10">{showPw ? t("idle.hide") : t("idle.show")}</button>
                </div>
              </div>
              {err && <div className="text-xs text-red-300 bg-red-500/10 border border-red-400/30 rounded-xl p-2.5">⛔ {err}</div>}
              <button type="submit" disabled={unlocking || !pw} className="w-full bg-white text-[#0f1e2e] rounded-xl py-3 font-black text-sm shadow disabled:opacity-50 transition active:scale-[0.99]">
                {unlocking ? t("idle.unlocking") : `${t("idle.unlock")} →`}
              </button>
            </form>
            <div className="text-[11px] text-white/40 mt-4">{t("idle.lockedAt", { at: lockedAt })}<br />{t("idle.draftsSafe")}</div>
          </div>
        </div>
      )}
    </>
  );
}
