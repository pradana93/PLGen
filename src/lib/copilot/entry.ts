// PLGen Copilot — entry point: classify → resolve
import { classify } from "./brain";
import { resolveIntent } from "./summaries";
import type { CopilotContext } from "./types";

export function ask(text: string, ctx: CopilotContext): { reply: string; intentType: string; confidence: number } {
  const match = classify(text, ctx);
  const reply = resolveIntent(match.intent, ctx);
  return { reply, intentType: match.intent.type, confidence: match.confidence };
}
