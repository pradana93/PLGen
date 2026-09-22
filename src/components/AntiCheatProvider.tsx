import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { startAntiCheat, stopAntiCheat, onViolation } from "../lib/anticheat";

type Violation = { reason: string; detail?: string; timestamp: string };

interface AntiCheatCtx {
  violations: Violation[];
  violationCount: number;
  banned: boolean;
}

const Ctx = createContext<AntiCheatCtx>({ violations: [], violationCount: 0, banned: false });

export function useAntiCheat() { return useContext(Ctx); }

export default function AntiCheatProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [violations, setViolations] = useState<Violation[]>([]);

  const isBanned = profile?.banned === true;

  useEffect(() => {
    // IMMORTAL: SuperAdmin never runs anti-cheat engine at all — no traps, no reports, no risk
    if (!user || isBanned || profile?.role === "Super Admin") {
      stopAntiCheat();
      return;
    }
    startAntiCheat(user.id);
    const unsub = onViolation((v) => {
      setViolations(prev => [...prev.slice(-49), v]); // keep last 50
    });
    return () => { unsub(); stopAntiCheat(); };
  }, [user, isBanned]);

  return (
    <Ctx.Provider value={{ violations, violationCount: violations.length, banned: isBanned }}>
      {children}
    </Ctx.Provider>
  );
}
