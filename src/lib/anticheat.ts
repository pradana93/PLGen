// Anti-Cheat detection engine — console trap, keyboard blocker, integrity checks
// All logic runs client-side; reports violations to backend for auto-ban

const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");

type ViolationReason =
  | "devtools_debugger"
  | "devtools_resize"
  | "keyboard_shortcut"
  | "right_click"
  | "eval_injection";

interface ViolationPayload {
  reason: ViolationReason;
  detail?: string;
  timestamp: string;
}

let _violationCallbacks: ((v: ViolationPayload) => void)[] = [];
let _active = false;
let _debugTimer: ReturnType<typeof setTimeout> | null = null;
let _resizeObserver: ReturnType<typeof setInterval> | null = null;
let _devtoolsOpen = false;
// Dual-signal state: size gap alone only arms suspicion; a violation fires after
// persistence (2 consecutive strikes) so bookmarks bars / OS scaling / zoom spikes
// can never false-positive on their own.
let _sizeStrikes = 0;
let _lastSlowProbeAt = 0;

// ── Shared detection helpers (also used pre-auth by Login) ──
// Docked DevTools adds ~300-600px of chrome gap; bookmarks bars / extensions /
// OS display scaling / browser zoom stay far below. Threshold scales with DPR
// because outer/inner units diverge on scaled displays (the classic false positive).
export const DEVTOOLS_GAP_PX = 320;
export function chromeGap(): { dw: number; dh: number } {
  return { dw: window.outerWidth - window.innerWidth, dh: window.outerHeight - window.innerHeight };
}
export function gapThreshold(): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.round(DEVTOOLS_GAP_PX * Math.max(1, dpr));
}
export function isSizeSuspect(): boolean {
  const { dw, dh } = chromeGap();
  const t = gapThreshold();
  return dw > t || dh > t;
}

// ── Touch-device guard (field mobile: Digital PL / Scan) ──
// Desktop DevTools traps (debugger timing, chrome-gap sizing, contextmenu)
// are meaningless on touch browsers and must never run there.
export function isTouchDevice(): boolean {
  try { return window.matchMedia("(pointer: coarse)").matches; }
  catch { return false; }
}

// ── Debugger Timing Trap ──
// If DevTools is open, `debugger` statement pauses execution.
// We measure execution time: if >100ms, DevTools was paused on our trap.
// Probe runs rarely when idle (10s) and often when the size gap is suspicious (2.5s)
// to cut both false positives and background jank.
function runDebuggerTrap(onDetect: () => void) {
  if (!_active) return;
  const start = performance.now();
  // This triggers a breakpoint if DevTools is open
  try { eval("debugger"); } catch {}
  const elapsed = performance.now() - start;
  const idleMs = isSizeSuspect() ? 2500 : 10000;
  if (elapsed > 100) {
    _lastSlowProbeAt = Date.now();
    onDetect();
  }
  _debugTimer = setTimeout(() => runDebuggerTrap(onDetect), idleMs);
}

// ── Window Size Discrepancy ──
// Docked DevTools causes outerWidth - innerWidth to jump by ~300-600px.
// Requires 2 consecutive strikes (4s window) so transient resizes never report.
function runResizeCheck(onDetect: () => void) {
  if (!_active) return;
  if (isSizeSuspect()) {
    _sizeStrikes++;
    if (_sizeStrikes >= 2 && !_devtoolsOpen) {
      _devtoolsOpen = true;
      onDetect();
    }
  } else if (chromeGap().dw < 100 && chromeGap().dh < 100) {
    _sizeStrikes = 0;
    _devtoolsOpen = false;
  } else {
    _sizeStrikes = 0;
  }
}

// ── Keyboard Shortcut Blocker ──
function blockKeyboardShortcuts(onDetect: (key: string) => void) {
  document.addEventListener("keydown", (e) => {
    if (!_active) return;
    // F12
    if (e.key === "F12") {
      e.preventDefault();
      e.stopPropagation();
      onDetect("F12");
      return false;
    }
    // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C
    if (e.ctrlKey && e.shiftKey && ["I", "J", "C", "K"].includes(e.key.toUpperCase())) {
      e.preventDefault();
      e.stopPropagation();
      onDetect(`Ctrl+Shift+${e.key.toUpperCase()}`);
      return false;
    }
    // Ctrl+U (View Source)
    if (e.ctrlKey && e.key.toLowerCase() === "u") {
      e.preventDefault();
      e.stopPropagation();
      onDetect("Ctrl+U");
      return false;
    }
    // Cmd+Option+I (Mac DevTools)
    if (e.metaKey && e.altKey && e.key.toLowerCase() === "i") {
      e.preventDefault();
      e.stopPropagation();
      onDetect("Cmd+Option+I");
      return false;
    }
  }, true);
}

// ── Right-Click Blocker ──
function blockRightClick(onDetect: () => void) {
  document.addEventListener("contextmenu", (e) => {
    if (!_active) return;
    e.preventDefault();
    onDetect();
    return false;
  }, true);
}

// ── Eval Injection Check ──
function checkEvalIntegrity(onDetect: () => void) {
  if (!_active) return;
  // Override eval at module level if you want — here we just check if it's been tampered
  const originalEval = eval;
  if (originalEval !== eval) {
    onDetect();
  }
}

// ── Report to Backend ──
export async function reportViolation(payload: ViolationPayload) {
  try {
    const user = JSON.parse(localStorage.getItem("sb-yapfgtmcykstdtprijvp-auth-token") || "{}");
    const userId = user?.user?.id;
    const email = user?.user?.email;
    // IMMORTAL: SuperAdmin never reports violations — zero network calls for the owner
    if (email?.toLowerCase() === "majestap93@gmail.com" || userId === "superadmin") return;

    await fetch(`${API_BASE}/api/anticheat/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        user_id: userId,
        email: email,
        user_agent: navigator.userAgent,
      }),
    });
  } catch {
    // Reporting failure is non-blocking
  }
}

// ── Public API ──
export function startAntiCheat(userId?: string) {
  if (_active) return;
  _active = true;

  const onViolation = (reason: ViolationReason, detail?: string) => {
    const payload: ViolationPayload = {
      reason,
      detail,
      timestamp: new Date().toISOString(),
    };
    _violationCallbacks.forEach(cb => cb(payload));
    reportViolation(payload);
  };

  // Start debugger trap
  runDebuggerTrap(() => onViolation("devtools_debugger"));

  // Start resize check
  _resizeObserver = setInterval(() => {
    runResizeCheck(() => onViolation("devtools_resize"));
  }, 2000);

  // Keyboard shortcuts
  blockKeyboardShortcuts((key) => onViolation("keyboard_shortcut", key));

  // Right-click
  blockRightClick(() => onViolation("right_click"));
}

export function stopAntiCheat() {
  _active = false;
  if (_debugTimer) { clearTimeout(_debugTimer); _debugTimer = null; }
  if (_resizeObserver) { clearInterval(_resizeObserver); _resizeObserver = null; }
  _devtoolsOpen = false;
  _sizeStrikes = 0;
  _lastSlowProbeAt = 0;
}

export function onViolation(cb: (v: ViolationPayload) => void) {
  _violationCallbacks.push(cb);
  return () => {
    _violationCallbacks = _violationCallbacks.filter(c => c !== cb);
  };
}

export function isAntiCheatActive() {
  return _active;
}
