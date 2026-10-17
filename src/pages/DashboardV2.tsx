// Dashboard v2 — multi-file Surat Jalan → per-outlet PL review.
//
// Phase 1: drop the DO (BBB) + IT (BBT) files together, parse them into outlet
//          groups, fuzzy-match outlets against Master Data, show a review screen.
// Phase 2: confirm / correct each outlet, register brand-new outlets (same path as
//          Dashboard v1's typo guard) and remember confirmed wordings so the same
//          vendor text auto-matches on later drops.
//
// Still nothing is generated and no packing data is written. The only network write
// is the user-initiated outlet registration — identical to Dashboard v1.
//
// Isolation: reads the packing store (master data only) and never writes to it.
// Dashboard v1, Digital PL, Live Board, scanner.ts and the export/packing pipeline
// are untouched.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { usePackingStore } from "../store/usePackingStore";
import { apiGet, apiPost } from "../lib/api";
import { calculateBoxes } from "../lib/packing";
import type { MasterDB, Order } from "../lib/packing";
import { parseDocuments, mergeAndMatch, dusMultiplier, isDusUom } from "../lib/groupScan";
import type { FileParseResult, GroupItem, MergedGroup, UnknownSku } from "../lib/groupScan";
import { normalizeOutletName } from "../lib/fuzzyOutlet";
import { loadAliases, learnAliases, forgetAlias, clearAliases, flatAliases, learnedEntries } from "../lib/outletAliases";
import type { AliasMap } from "../lib/outletAliases";
import { useLanguage } from "../i18n";

export default function DashboardV2(){
  const { t } = useLanguage();
  const storeMaster = usePackingStore(s => s.master);
  const [master, setMaster] = useState<MasterDB>(storeMaster);

  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<FileParseResult[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Phase 2 — remembered outlet matches (per browser) + the outlet picker.
  const [aliases, setAliases] = useState<AliasMap>({});
  const [picker, setPicker] = useState<{ id: string; raws: string[] } | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [registering, setRegistering] = useState<string | null>(null);

  const [dragOver, setDragOver] = useState(false);
  // Enter-counter (same fix as Dashboard v1): dragleave fires when crossing child
  // elements, so a boolean toggle makes the zone strobe.
  const dragCount = useRef(0);

  useEffect(()=>{ setAliases(loadAliases()); },[]);

  // Read-only master refresh — never written back to the shared store.
  useEffect(()=>{
    (async()=>{
      try { const md = await apiGet("/api/master_data"); if (md && (md as any).OUTLET_INFO) setMaster(md as MasterDB); } catch {}
    })();
  },[]);

  const outletCount = useMemo(()=> Object.keys(master.OUTLET_INFO || {}).length, [master]);
  const aliasesFlat = useMemo(()=> flatAliases(aliases), [aliases]);

  // Re-merge whenever the files, the Master Data or the learned mappings change, so a
  // confirmation immediately folds differently-worded groups onto the same outlet.
  const analysis = useMemo(
    ()=> (parsed.length ? mergeAndMatch(parsed, master, aliasesFlat) : null),
    [parsed, master, aliasesFlat]
  );
  const merged: MergedGroup[] = analysis?.merged ?? [];
  const unknown: UnknownSku[] = analysis?.unknownSkus ?? [];
  const qtyMissing = analysis?.qtyMissing ?? false;
  const learned = useMemo(()=> learnedEntries(aliases), [aliases]);

  const showToast = (msg: string)=>{
    setToast(msg);
    window.setTimeout(()=> setToast((cur)=> (cur === msg ? null : cur)), 3500);
  };

  const koliOf = (g: MergedGroup): number | null => {
    const order: Order = {};
    for (const [sku, qty] of Object.entries(g.qtyBySku)) if (qty > 0) order[sku] = { qty, note: "" };
    if (!Object.keys(order).length) return null;
    try { return calculateBoxes(order, master).length; } catch { return null; }
  };

  const run = async (files: File[])=>{
    if (!files.length) return;
    setBusy(true); setOpenId(null);
    try {
      const result = await parseDocuments(files, master);
      setParsed(result);
    } catch (e:any) {
      setParsed([]);
      showToast(e?.message || String(e));
    }
    setBusy(false);
  };

  const clearAll = ()=>{ setParsed([]); setOpenId(null); setPicker(null); };

  const rawsOf = (g: MergedGroup): string[] => (g.outletRaws.length ? g.outletRaws : (g.match.raw ? [g.match.raw] : []));

  const saveMapping = (raws: string[], key: string, msg: string)=>{
    setAliases((prev)=> learnAliases(raws, key, prev));
    showToast(msg);
  };

  const confirmOutlet = (raws: string[], key: string)=>{
    const raws2 = raws.length ? raws : [key];
    saveMapping(raws2, key, t("v2.confirmSaved", { raw: raws2[0], key }));
    setPicker(null); setPickerQuery("");
  };

  // Same endpoint/payload as Dashboard v1's typo guard, so both tabs stay consistent.
  const createOutlet = async (id: string, raws: string[], raw: string)=>{
    const name = String(raw || "").trim();
    if (!name) return;
    const key = name.toUpperCase();
    setRegistering(id);
    try {
      await apiPost("/api/outlet/register", {
        outlet_name: key,
        outlet_data: { name, phone: "", address: "", auto_registered: true, registered_at: new Date().toISOString() },
      });
      // Show it immediately, then re-read the canonical Master Data.
      setMaster((prev)=> ({ ...prev, OUTLET_INFO: { ...(prev.OUTLET_INFO || {}), [key]: { name, phone: "", address: "" } } } as MasterDB));
      try { const md = await apiGet("/api/master_data"); if (md && (md as any).OUTLET_INFO) setMaster(md as MasterDB); } catch {}
      saveMapping(raws.length ? raws : [name], key, t("v2.createdOutlet", { name: key }));
      setPicker(null); setPickerQuery("");
    } catch (e:any) {
      showToast(t("v2.registerFail", { err: e?.message || String(e) }));
    }
    setRegistering(null);
  };

  const forget = (raw: string)=>{
    setAliases((prev)=> forgetAlias(raw, prev));
    showToast(t("v2.forgotten"));
  };
  const forgetAll = ()=>{ setAliases(clearAliases()); showToast(t("v2.forgotAll")); };

  const warnText = (w: string, g?: MergedGroup): string => {
    switch (w) {
      case "mergedFiles": return t("v2.flagMerged", { n: g?.sourceFiles.length ?? 0 });
      case "qtyMissing": return t("v2.flagQtyMissing");
      case "satuanDus": return t("v2.flagSatuanDus");
      case "variantClash": return t("v2.flagVariant");
      case "unknownSku": return t("v2.flagUnknown", { n: g?.items.filter(i=>!i.sku).length ?? 0 });
      case "packaging": return t("v2.flagPackaging");
      default: return w;
    }
  };
  const confChip = (c: string)=> c === "high"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : c === "review"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-700 border-red-200";
  const confLabel = (c: string)=> c === "high" ? t("v2.confHigh") : c === "review" ? t("v2.confReview") : t("v2.confLow");
  const itemFlag = (it: GroupItem): string | null => {
    if (isDusUom(it.uom)) { const m = dusMultiplier(it.uom); return m ? t("v2.itemDusMult", { m }) : t("v2.flagSatuanDus"); }
    if (it.packaging) return t("v2.flagPackaging");
    return null;
  };

  // ── Phase 2 — matched-outlet cell: confirm / correct / register ────────────
  const renderMatch = (g: MergedGroup)=>{
    const m = g.match;
    const raws = rawsOf(g);
    const rawLabel = raws[0] || m.raw || "";

    if (m.key && m.confidence !== "low") {
      const learnedRaw = raws.find((r)=> aliases[normalizeOutletName(r)]);
      return (
        <div>
          <div className="font-bold text-[#0f1e2e] flex items-center gap-1.5 flex-wrap">
            {m.key}
            {m.learned && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">{t("v2.learnedBadge")}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border ${confChip(m.confidence)}`}>{confLabel(m.confidence)} {Math.round(m.score * 100)}%</span>
            <button
              onClick={()=>{ setPicker({ id: g.id, raws }); setPickerQuery(""); }}
              className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 transition"
            >{t("v2.change")}</button>
            {learnedRaw && (
              <button
                onClick={()=> forget(learnedRaw)}
                className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
              >{t("v2.forget")}</button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="text-red-600 font-bold text-xs">{t("v2.noMatch")}</div>
        <div className="mt-1 space-y-1">
          {m.candidates.map((c)=> (
            <button
              key={c.key}
              onClick={()=> confirmOutlet(raws, c.key)}
              className="w-full text-left text-[10px] font-semibold px-1.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
            >{t("v2.candidateUse", { key: c.key, pct: Math.round(c.score * 100) })}</button>
          ))}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <button
            onClick={()=>{ setPicker({ id: g.id, raws }); setPickerQuery(""); }}
            className="text-[10px] font-black px-2 py-1 rounded-lg bg-[#0f1e2e] text-white hover:bg-black transition"
          >{t("v2.chooseOutlet")}</button>
          <button
            onClick={()=> void createOutlet(g.id, raws, rawLabel)}
            disabled={registering === g.id}
            title={t("v2.createOutletHint")}
            className="text-[10px] font-black px-2 py-1 rounded-lg bg-white border-2 border-[#e74c3c] text-[#e74c3c] hover:bg-red-50 disabled:opacity-50 transition"
          >{registering === g.id ? t("v2.registering") : t("v2.createOutlet", { name: rawLabel.toUpperCase() })}</button>
        </div>
      </div>
    );
  };

  // ── Phase 2 — outlet search picker ────────────────────────────────────────
  const pickerList = useMemo(()=>{
    if (!picker) return [];
    const q = pickerQuery.trim().toUpperCase();
    const keys = Object.keys(master.OUTLET_INFO || {});
    const info = master.OUTLET_INFO as Record<string, { name?: string } | undefined>;
    const list = q
      ? keys.filter((k)=> k.includes(q) || String(info[k]?.name || "").toUpperCase().includes(q))
      : keys;
    return list.slice(0, 60);
  }, [picker, pickerQuery, master]);

  const totalLines = parsed.reduce((s, r)=> s + r.stats.items, 0);
  const totalGroups = merged.length;

  return (
    <div className="max-w-[1400px] mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-black text-[#0f1e2e] flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0f1e2e] to-[#2c3e50] text-white flex items-center justify-center text-sm">🧾</span>
              {t("v2.title")}
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-[760px] leading-relaxed">{t("v2.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-500">
              {t("v2.outletPool", { n: outletCount })}
            </span>
            {(parsed.length > 0) && (
              <button onClick={clearAll} className="text-[11px] font-black px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 transition">✕ {t("v2.clear")}</button>
            )}
          </div>
        </div>

        {/* Dropzone */}
        <div
          onDragEnter={e=>{ e.preventDefault(); dragCount.current++; setDragOver(true); }}
          onDragOver={e=>{ e.preventDefault(); }}
          onDragLeave={()=>{ dragCount.current = Math.max(0, dragCount.current-1); if (dragCount.current === 0) setDragOver(false); }}
          onDrop={e=>{ e.preventDefault(); dragCount.current = 0; setDragOver(false); void run(Array.from(e.dataTransfer.files || [])); }}
          className={`mt-4 rounded-2xl border-2 border-dashed px-5 py-7 text-center transition-all ${dragOver ? "border-[#27ae60] bg-emerald-50/60 scale-[1.01]" : "border-slate-300 bg-slate-50/60"}`}
        >
          <div className={`text-2xl ${dragOver ? "dz-box" : ""}`}>📦</div>
          <div className="mt-1 font-black text-[#0f1e2e] text-sm">{dragOver ? t("v2.release") : t("v2.dropTitle")}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{t("v2.dropSub")}</div>
          <label className="inline-block mt-3">
            <span className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-black px-4 py-2 rounded-xl bg-[#0f1e2e] text-white hover:bg-black transition">
              {busy ? t("v2.reading") : t("v2.browse")}
            </span>
            <input
              type="file" multiple accept=".pdf,.xlsx,.xls" className="hidden"
              onChange={e=>{ const f = Array.from(e.target.files || []); (e.target as HTMLInputElement).value = ""; void run(f); }}
            />
          </label>
        </div>

        {qtyMissing && (
          <div className="mt-3 text-[11px] font-semibold rounded-xl px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700">⚠️ {t("v2.warnNoQty")}</div>
        )}
      </div>

      {parsed.length === 0 && !busy && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-400">{t("v2.empty")}</div>
      )}

      {/* File cards */}
      {parsed.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {parsed.map((r)=> (
            <div key={r.fileName} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${r.kind === "IT" ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-violet-50 text-violet-700 border-violet-200"}`}>
                  {r.kind ?? "?"} • {r.entity ?? "?"}
                </span>
                <span className="text-[11px] font-mono text-slate-400 truncate flex-1" title={r.fileName}>{r.fileName}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 border border-slate-100 py-1.5">
                  <div className="text-[10px] font-black tracking-widest text-slate-400">{t("v2.fileGroups")}</div>
                  <div className="font-black text-[#0f1e2e]">{r.groups.length}</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 py-1.5">
                  <div className="text-[10px] font-black tracking-widest text-slate-400">{t("v2.fileLines")}</div>
                  <div className="font-black text-[#0f1e2e]">{r.stats.items}</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 py-1.5">
                  <div className="text-[10px] font-black tracking-widest text-slate-400">{t("v2.fileResolved")}</div>
                  <div className="font-black text-[#0f1e2e]">{r.stats.items ? Math.round(r.stats.resolved / r.stats.items * 100) : 0}%</div>
                </div>
              </div>
              {r.refs.length > 0 && <div className="mt-2 text-[10px] font-mono text-slate-400 truncate" title={r.refs.join(", ")}>REF: {r.refs.join(" • ")}</div>}
              {r.warnings.filter(w=> w !== "noQtyColumn").map((w)=> (
                <div key={w} className="mt-2 text-[10px] font-bold rounded-lg px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700">
                  {w === "unsupportedExt" ? t("v2.warnUnsupported") : w === "noEntity" ? t("v2.warnNoEntity") : w === "noRows" ? t("v2.warnNoRows") : w === "readError" ? t("v2.warnRead", { err: r.errorText || "" }) : w}
                </div>
              ))}
              {r.warnings.includes("noQtyColumn") && (
                <div className="mt-2 text-[10px] font-bold rounded-lg px-2 py-1 bg-red-50 border border-red-200 text-red-700">{t("v2.warnNoQtyFile")}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Outlet review */}
      {merged.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-black text-[#0f1e2e] text-sm">{t("v2.reviewTitle")}</div>
              <div className="text-[11px] text-slate-500">{t("v2.reviewHint", { n: outletCount, groups: totalGroups, lines: totalLines })}</div>
            </div>
            <div className="text-[10px] font-black px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-500">{t("v2.phaseBadge")}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] font-black tracking-widest text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2">{t("v2.colOutlet")}</th>
                  <th className="text-left px-3 py-2">{t("v2.colMatched")}</th>
                  <th className="text-left px-3 py-2">{t("v2.colRefs")}</th>
                  <th className="text-right px-3 py-2">{t("v2.colItems")}</th>
                  <th className="text-right px-3 py-2">{t("v2.colQty")}</th>
                  <th className="text-right px-3 py-2">{t("v2.colKoli")}</th>
                  <th className="text-left px-3 py-2">{t("v2.colFlags")}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {merged.map((g)=> {
                  const koli = koliOf(g);
                  const open = openId === g.id;
                  return (
                    <Fragment key={g.id}>
                      <tr className={`border-t border-slate-100 align-top ${open ? "bg-slate-50/70" : "hover:bg-slate-50/50"}`}>
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-[#0f1e2e]">{g.outletRaws.join(" / ") || "—"}</div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {g.entities.map((e)=> <span key={e} className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500">{e}</span>)}
                            {g.warehouses.map((w)=> <span key={w} className="text-[10px] text-slate-400">{t("v2.fromWarehouse", { w })}</span>)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">{renderMatch(g)}</td>
                        <td className="px-3 py-2.5"><div className="text-[11px] font-mono text-slate-500">{g.refs.length ? g.refs.join(" • ") : "—"}</div></td>
                        <td className="px-3 py-2.5 text-right font-bold">{g.items.length}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{g.qtyTotal || "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{koli === null ? "—" : koli}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {g.warnings.map((w)=> (
                              <span key={w} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${w === "mergedFiles" ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{warnText(w, g)}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={()=> setOpenId(open ? null : g.id)} className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 transition">
                            {open ? "▴" : "▾"} {t("v2.expand")}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-t border-slate-100 bg-slate-50/40">
                          <td colSpan={8} className="px-3 py-3">
                            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-[10px] font-black tracking-widest text-slate-400">
                                  <tr>
                                    <th className="text-left px-3 py-2">{t("v2.colCode")}</th>
                                    <th className="text-left px-3 py-2">{t("v2.colName")}</th>
                                    <th className="text-left px-3 py-2">{t("v2.colSku")}</th>
                                    <th className="text-right px-3 py-2">{t("v2.colQtyShort")}</th>
                                    <th className="text-left px-3 py-2">{t("v2.colUom")}</th>
                                    <th className="text-left px-3 py-2">{t("v2.colNote")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.items.map((it, i)=> (
                                    <tr key={i} className="border-t border-slate-100">
                                      <td className="px-3 py-1.5 font-mono text-slate-500">{it.kode || "—"}</td>
                                      <td className="px-3 py-1.5">{it.rawName}</td>
                                      <td className={`px-3 py-1.5 font-semibold ${it.sku ? "text-[#0f1e2e]" : "text-red-600"}`}>{it.sku ?? t("v2.unresolved")}</td>
                                      <td className="px-3 py-1.5 text-right font-mono">{it.qty ?? "—"}</td>
                                      <td className="px-3 py-1.5 text-slate-500">{it.uom || "—"}</td>
                                      <td className="px-3 py-1.5">{itemFlag(it) ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700">{itemFlag(it)}</span> : null}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unknown SKUs */}
      {parsed.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="font-black text-[#0f1e2e] text-sm">{t("v2.unknownTitle")}</div>
            <div className="text-[11px] text-slate-500">{t("v2.unknownHint")}</div>
          </div>
          {unknown.length === 0 ? (
            <div className="px-4 py-4 text-xs font-bold text-emerald-600">{t("v2.noUnknown")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] font-black tracking-widest text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2">{t("v2.colCode")}</th>
                    <th className="text-left px-3 py-2">{t("v2.colName")}</th>
                    <th className="text-right px-3 py-2">{t("v2.colQtyShort")}</th>
                    <th className="text-left px-3 py-2">{t("v2.colOutlets")}</th>
                  </tr>
                </thead>
                <tbody>
                  {unknown.map((u, i)=> (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 font-mono text-slate-500">{u.kode || "—"}</td>
                      <td className="px-3 py-1.5 font-semibold text-red-600">{u.rawName}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{u.qtySum || "—"}</td>
                      <td className="px-3 py-1.5 text-slate-500">{u.outlets.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Learned outlet matches (Phase 2) */}
      <details className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <summary className="px-4 py-3 cursor-pointer select-none flex items-center justify-between gap-3 list-none">
          <span>
            <span className="font-black text-[#0f1e2e] text-sm">🧠 {t("v2.learnedTitle")}</span>
            <span className="text-[11px] text-slate-500 ml-2">{t("v2.learnedHint")}</span>
          </span>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700">{learned.length}</span>
        </summary>
        <div className="px-4 pb-4">
          {learned.length === 0 ? (
            <div className="text-xs text-slate-400">{t("v2.learnedEmpty")}</div>
          ) : (
            <>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {learned.map((e)=> (
                  <div key={e.norm} className="flex items-center justify-between gap-2 text-[11px] rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-600">{e.raw || e.norm}</span>
                      <span className="text-slate-400 mx-1.5">→</span>
                      <span className="font-bold text-[#0f1e2e]">{e.key}</span>
                    </div>
                    <button onClick={()=> forget(e.raw || e.norm)} className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 transition">{t("v2.forget")}</button>
                  </div>
                ))}
              </div>
              <button onClick={forgetAll} className="mt-3 text-[11px] font-black px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 transition">{t("v2.clearLearned")}</button>
            </>
          )}
        </div>
      </details>

      {/* Phase note */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-500 flex items-start gap-2">
        <span>🧪</span>
        <span>{t("v2.nextPhase")}</span>
      </div>

      {/* Outlet picker */}
      {picker && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={()=>{ setPicker(null); setPickerQuery(""); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden" onClick={e=> e.stopPropagation()}>
            <div className="bg-[#f4f6f9] p-4 border-b">
              <div className="text-base font-extrabold text-[#0f1e2e]">{t("v2.pickerTitle", { raw: picker.raws[0] || "" })}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{t("v2.pickerHint")}</div>
            </div>
            <div className="p-4 space-y-3">
              <input
                autoFocus
                value={pickerQuery}
                onChange={e=> setPickerQuery(e.target.value)}
                placeholder={t("v2.searchOutlet")}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0f1e2e]"
              />
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
                {pickerList.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-slate-400">{t("v2.pickerEmpty")}</div>
                ) : pickerList.map((k)=> (
                  <button
                    key={k}
                    onClick={()=> confirmOutlet(picker.raws, k)}
                    className="w-full text-left px-3 py-2 hover:bg-[#ecf0f1] transition"
                  >
                    <div className="text-xs font-bold text-[#0f1e2e]">{k}</div>
                    {String((master.OUTLET_INFO as any)[k]?.name || "") && (
                      <div className="text-[10px] text-slate-400">{String((master.OUTLET_INFO as any)[k]?.name)}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 pt-0 flex items-center gap-2">
              <button
                onClick={()=> void createOutlet(picker.id, picker.raws, picker.raws[0] || "")}
                disabled={registering === picker.id}
                className="flex-1 bg-white border-2 border-[#e74c3c] text-[#e74c3c] rounded-lg py-2 font-bold text-xs hover:bg-red-50 disabled:opacity-50 transition"
              >{registering === picker.id ? t("v2.registering") : t("v2.createOutlet", { name: (picker.raws[0] || "").toUpperCase() })}</button>
              <button
                onClick={()=>{ setPicker(null); setPickerQuery(""); }}
                className="flex-1 bg-gray-200 rounded-lg py-2 font-bold text-xs text-slate-600"
              >❌ {t("v2.cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-4 right-4 bg-[#2c3e50] text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold z-50">{toast}</div>}
    </div>
  );
}
