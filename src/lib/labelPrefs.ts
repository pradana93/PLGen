// Label size preference — per browser, mirrors the Export Destination pattern
// (lib/drive.ts). Defaults to "standard", which is the original 6-per-A4 layout,
// so nothing changes for anyone who never touches the setting.
import type { SizedLabelTemplate } from "./labelSheets";

export type LabelTemplate = "standard" | SizedLabelTemplate;

const KEY = "plgen-label-size";

export function getLabelTemplate(): LabelTemplate {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "medium" || v === "large") return v;
  } catch {}
  return "standard";
}

export function setLabelTemplate(t: LabelTemplate) {
  try { localStorage.setItem(KEY, t); } catch {}
}

export const LABEL_TEMPLATE_OPTIONS: { id: LabelTemplate; perPage: number }[] = [
  { id: "standard", perPage: 6 },
  { id: "medium", perPage: 4 },
  { id: "large", perPage: 2 },
];
