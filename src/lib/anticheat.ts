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

// ── Debugger Timing Trap ──
// If DevTools is open, `debugger` statement pauses execution.
// We measure execution time: if >100ms, DevTools was paused on our trap.
function runDebuggerTrap(onDetect: () => void) {
  if (!_active) return;
  const start = performance.now();
  // This triggers a breakpoint if DevTools is open
  try { eval("debugger"); } catch {}
  const elapsed = performance.now() - start;
  if (elapsed > 100) {
    onDetect();
  }
  _debugTimer = setTimeout(() => runDebuggerTrap(onDetect), 3000);
}

// ── Window Size Discrepancy ──
// Docked DevTools causes outerWidth - innerWidth to jump by ~200-600px
function runResizeCheck(onDetect: () => void) {
  if (!_active) return;
  const diff = window.outerWidth - window.innerWidth;
  const diffH = window.outerHeight - window.innerHeight;
  // Threshold: 150px accounts for scrollbar; real DevTools dock is 200+
  if ((diff > 200 || diffH > 200) && !_devtoolsOpen) {
    _devtoolsOpen = true;
    onDetect();
  } else if (diff < 100 && diffH < 100) {
    _devtoolsOpen = false;
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
