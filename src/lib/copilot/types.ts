// PLGen Copilot — shared types

export type CopilotLang = "en" | "id";

export type Timeframe =
  | "today"
  | "yesterday"
  | "week"
  | "last_week"
  | "month"
  | "last_month"
  | "7d"
  | "30d"
  | "all";

export type CopilotIntent =
  | { type: "greeting" }
  | { type: "help" }
  | { type: "summary"; period: Timeframe }
  | { type: "checker"; checker: string; period: Timeframe }
  | { type: "outlet"; outlet: string; period: Timeframe }
  | { type: "sku" }
  | { type: "stock" }
  | { type: "anomaly" }
  | { type: "team" }
  | { type: "trend" }
  | { type: "fallback" };

export interface PLEntry {
  delivery_no?: string;
  outlet?: string;
  checker?: string;
  status?: string;
  total_weight_kg?: number;
  created_at?: string;
  scanned_at?: string;
  [k: string]: any;
}

export interface CopilotContext {
  lang: CopilotLang;
  page: string;
  userLabel: string;
  role: string;
  data: PLEntry[];
  summary: any;
  checkers: string[];
  master: any;
  stock: Record<string, number> | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "copilot";
  text: string;
  suggestions?: string[];
}

export interface IntentMatch {
  intent: CopilotIntent;
  confidence: number;
}
