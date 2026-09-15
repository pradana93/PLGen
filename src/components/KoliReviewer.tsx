// 1:1 port of addons.py open_koli_reviewer (2076-2383) + core.py on_calculate finalize
// Preserves: deepcopy, refresh_tree, drag 6px threshold + tooltip, DnD prompt (qty + merge/insert), Move Selected, ledger retry, learn

import { useState, useEffect, useRef } from "react";
import { usePackingStore } from "../store/usePackingStore";

type Box = Record<string, number>;

export default function KoliReviewer({
  outlet,
  boxes,
  onApprove,
  onClose,
}: {
  outlet: string;
  boxes: Box[];
  onApprove: (finalBoxes: Box[]) => void;
  onClose: () => void;
}) {
  const { master } = usePackingStore();
  const [working, setWorking] = useState<Box[]>(() => JSON.parse(JSON.stringify(boxes)));
  const [drag, setDrag] = useState<null | { from: number; sku: string; qty: number; startX: number; startY: number; active: boolean }>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [dndPrompt, setDndPrompt] = useState<null | { from: number; target: number | "NEW"; sku: string; max: number }>(null);
  const [moveQty, setMoveQty] = useState(1);
  const [moveAction, setMoveAction] = useState<"merge" | "insert">("merge");
  const [showMove, setShowMove] = useState(false);
  const [moveFrom, setMoveFrom] = useState<{ koli: number; sku: string; qty: number } | null>(null);
  const [moveDest, setMoveDest] = useState<string>("");

  // Refresh like Python refresh_tree: filter empty boxes
  const visibleBoxes = working.filter(b => Object.keys(b).length > 0);

  // Drag handlers — 6px threshold like Python
  const onDragStart = (e: React.MouseEvent, fromKoli: number, sku: string, qty: number) => {
    setDrag({ from: fromKoli, sku, qty, startX: e.clientX, startY: e.clientY, active: false });
  };
  const onDragMove = (e: React.MouseEvent) => {
    if (!drag || drag.from === null) return;
    if (!drag.active) {
      if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) < 6) return;
      setDrag({ ...drag, active: true });
      setTooltip({ x: e.clientX + 15, y: e.clientY + 15, text: `Moving: ${drag.qty}x ${drag.sku}` });
      return;
    }
    setTooltip({ x: e.clientX + 15, y: e.clientY + 15, text: `Moving: ${drag.qty}x ${drag.sku}` });
  };
  const onDragEnd = (e: React.MouseEvent, target: number | "NEW" | null) => {
    setTooltip(null);
    if (!drag || !drag.active) { setDrag(null); return; }
    const active = drag;
    setDrag(null);
    if (target === null || target === active.from) return;
    // Defer prompt like Python after(80)
    setTimeout(() => {
      setDndPrompt({ from: active.from, target: target as number | "NEW", sku: active.sku, max: active.qty });
      setMoveQty(active.qty);
      setMoveAction("merge");
    }, 80);
  };

  const confirmDnd = () => {
    if (!dndPrompt) return;
    const { from, target, sku, max } = dndPrompt;
    if (moveQty <= 0 || moveQty > max) return;
    const next = JSON.parse(JSON.stringify(working)) as Box[];
    // Deduct from source
    next[from][sku] -= moveQty;
    if (next[from][sku] <= 0) delete next[from][sku];
    if (target === "NEW") {
      next.push({ [sku]: moveQty });
    } else {
      const idx = target as number;
      if (moveAction === "insert") {
        next.splice(idx, 0, { [sku]: moveQty });
      } else {
        if (next[idx][sku]) next[idx][sku] += moveQty;
        else next[idx][sku] = moveQty;
      }
    }
    // Learn like _learn_packing_behavior
    try {
      const key = "ai_packing_weights";
      const cur = JSON.parse(localStorage.getItem(key) || "{}");
      if (!cur[sku]) cur[sku] = { manual_moves: 0, total_qty_moved: 0 };
      cur[sku].manual_moves += 1;
      cur[sku].total_qty_moved += moveQty;
      localStorage.setItem(key, JSON.stringify(cur));
    } catch {}
    setWorking(next.filter(b=> Object.keys(b).length>0));
    setDndPrompt(null);
  };

  // Move Selected like Python move_item()
  const openMove = () => {
    // Find selected via DOM? Simplify: pick first selected item via click state — we use moveFrom set on item click
    if (!moveFrom) { alert("Please select an item to move (click an item first)."); return; }
    const idx = moveFrom.koli;
    const total = working.length;
    const options = Array.from({length: total}, (_,i)=> `Koli ${i+1}`);
    options.push("🌟 New Final Koli");
    let def = options[0];
    if (total > 1 && idx < total - 1) def = options[idx+1];
    setMoveDest(def);
    setMoveQty(moveFrom.qty);
    setMoveAction("merge");
    setShowMove(true);
  };

  const confirmMove = () => {
    if (!moveFrom) return;
    if (moveQty <= 0 || moveQty > moveFrom.qty) { alert("Invalid quantity"); return; }
    const fromIdx = moveFrom.koli;
    const sku = moveFrom.sku;
    const destStr = moveDest;
    const next = JSON.parse(JSON.stringify(working)) as Box[];
    next[fromIdx][sku] -= moveQty;
    if (next[fromIdx][sku] <= 0) delete next[fromIdx][sku];
    if (destStr === "🌟 New Final Koli") {
      next.push({ [sku]: moveQty });
    } else {
      const targetIdx = parseInt(destStr.replace("Koli ", ""), 10) - 1;
      if (moveAction === "insert") next.splice(targetIdx, 0, { [sku]: moveQty });
      else {
        if (next[targetIdx][sku]) next[targetIdx][sku] += moveQty;
        else next[targetIdx][sku] = moveQty;
      }
    }
    try {
      const cur = JSON.parse(localStorage.getItem("ai_packing_weights") || "{}");
      if (!cur[sku]) cur[sku] = { manual_moves: 0, total_qty_moved: 0 };
      cur[sku].manual_moves += 1;
      cur[sku].total_qty_moved += moveQty;
      localStorage.setItem("ai_packing_weights", JSON.stringify(cur));
    } catch {}
    setWorking(next.filter(b=> Object.keys(b).length>0));
    setShowMove(false);
    setMoveFrom(null);
  };

  const handleFinalize = async () => {
    const finalBoxes = working.filter(b => Object.keys(b).length>0);
    // Robust ledger like Python finalize -> _robust_ledger_post
    const totalDeductions: Record<string, number> = {};
    for (const box of finalBoxes) for (const [k,v] of Object.entries(box)) totalDeductions[k] = (totalDeductions[k]||0)+ v;
    // Fire-and-forget with retry like Python while True
    const payload = { hwid: localStorage.getItem("hwid") || "web", outlet, items: totalDeductions };
    const base = (import.meta as any).env?.VITE_API_URL ?? ((import.meta as any).env?.PROD ? "" : "http://localhost:4000");
    const postLedger = async () => {
      // If offline, queue (mimic OFFLINE_MODE)
      if (!navigator.onLine) {
        try { const q = JSON.parse(localStorage.getItem("pending_sync")||"[]"); q.push({ endpoint:"/api/ledger/record", payload }); localStorage.setItem("pending_sync", JSON.stringify(q)); } catch {}
        return;
      }
      let tries = 0;
      while (tries < 3) {
        try {
          const r = await fetch(`${base}/api/ledger/record`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
          if (r.ok) break;
        } catch {}
        await new Promise(r=> setTimeout(r, 4000));
        tries++;
      }
    };
    postLedger(); // fire-and-forget
    onApprove(finalBoxes);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onMouseMove={onDragMove} onMouseUp={()=> setTooltip(null)}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b">
          <h3 className="font-bold">📦 Koli Pre-Flight Check: {outlet.toUpperCase()}</h3>
          <p className="text-xs text-gray-500">Reviewing Packing Layout — drag items between Koli or use Move button. Total Koli: {visibleBoxes.length}</p>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {visibleBoxes.map((box, idx)=> {
            const total = Object.values(box).reduce((a,b)=> a+Number(b), 0);
            return (
              <div
                key={idx}
                className="border rounded-lg bg-[#f9fafb]"
                onMouseUp={(e)=> onDragEnd(e as any, idx)}
                onDragOver={(e)=> e.preventDefault()}
                onDrop={(e)=> { e.preventDefault(); onDragEnd(e as any, idx); }}
              >
                <div className="bg-[#ecf0f1] px-3 py-2 font-bold text-sm flex justify-between">
                  <span>📦 KOLI {idx+1} (Total Items: {total})</span>
                  <button onClick={()=> { const n=[...working]; n.splice(idx,1); setWorking(n.filter(b=>Object.keys(b).length>0)); }} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Remove Koli</button>
                </div>
                <div className="divide-y">
                  {Object.entries(box).sort(([a],[b])=> a.localeCompare(b)).map(([sku,qty])=> (
                    <div
                      key={sku}
                      draggable
                      onMouseDown={(e)=> onDragStart(e, idx, sku, qty as number)}
                      onClick={()=> setMoveFrom({ koli: idx, sku, qty: qty as number })}
                      className={`flex justify-between px-3 py-2 text-sm cursor-grab ${moveFrom?.koli===idx && moveFrom?.sku===sku ? "bg-yellow-100" : "hover:bg-white"}`}
                      title="Drag to another Koli or click then Move Selected"
                    >
                      <span>{sku}</span><span className="font-bold">{String(qty)} <span className="font-mono text-xs bg-[#ecf0f1] px-1.5 py-0.5 rounded ml-1">{master.ITEM_UOM?.[sku] || "Pack"}</span></span>
                    </div>
                  ))}
                  {Object.keys(box).length===0 && <div className="p-3 text-xs text-gray-400">Empty</div>}
                </div>
              </div>
            );
          })}
          <div
            className="border-2 border-dashed rounded-lg p-4 text-center text-sm text-gray-500"
            onMouseUp={(e)=> onDragEnd(e as any, "NEW")}
            onDragOver={(e)=> e.preventDefault()}
            onDrop={(e)=> { e.preventDefault(); onDragEnd(e as any, "NEW"); }}
          >
            Drop here to create 🌟 New Final Koli
          </div>
        </div>

        <div className="p-4 border-t flex gap-2 justify-between">
          <button onClick={openMove} className="px-4 py-2 rounded-lg bg-[#f39c12] text-white font-bold text-sm">↕️ Move Selected Item</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 text-sm">Cancel</button>
            <button onClick={handleFinalize} className="px-6 py-2 rounded-lg bg-[#27ae60] text-white font-bold">✅ APPROVE & EXPORT</button>
          </div>
        </div>
      </div>

      {tooltip && <div className="fixed bg-[#2c3e50] text-white px-3 py-1 rounded text-xs font-bold pointer-events-none" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>}

      {dndPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-4">
            <h4 className="font-bold text-center">Moving: {dndPrompt.sku}<br/>From KOLI {dndPrompt.from+1} → {dndPrompt.target==="NEW" ? "🌟 New Final Koli" : `KOLI ${(dndPrompt.target as number)+1}`}</h4>
            <label className="text-sm mt-3 block">Qty to Move (Max {dndPrompt.max}):</label>
            <input type="number" min={1} max={dndPrompt.max} value={moveQty} onChange={e=> setMoveQty(parseInt(e.target.value)||1)} className="w-full border rounded px-2 py-1 text-center" />
            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={moveAction==="merge"} onChange={()=> setMoveAction("merge")} /> Merge (Mix into existing Koli)</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={moveAction==="insert"} onChange={()=> setMoveAction("insert")} /> Insert (Create new Koli & Shift down)</label>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={()=> setDndPrompt(null)} className="flex-1 bg-gray-200 rounded py-2 text-sm">Cancel</button>
              <button onClick={confirmDnd} className="flex-1 bg-[#f39c12] text-white rounded py-2 font-bold text-sm">Confirm Move</button>
            </div>
          </div>
        </div>
      )}

      {showMove && moveFrom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-4">
            <h4 className="font-bold text-center">Moving: {moveFrom.sku}</h4>
            <label className="text-sm mt-2 block">Qty to Move (Max {moveFrom.qty}):</label>
            <input type="number" min={1} max={moveFrom.qty} value={moveQty} onChange={e=> setMoveQty(parseInt(e.target.value)||1)} className="w-full border rounded px-2 py-1 text-center" />
            <label className="text-sm mt-3 block">Destination Position:</label>
            <select value={moveDest} onChange={e=> setMoveDest(e.target.value)} className="w-full border rounded px-2 py-1">
              {Array.from({length: working.length}, (_,i)=> `Koli ${i+1}`).concat("🌟 New Final Koli").map(o=> <option key={o} value={o}>{o}</option>)}
            </select>
            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={moveAction==="merge"} onChange={()=> setMoveAction("merge")} /> Merge</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={moveAction==="insert"} onChange={()=> setMoveAction("insert")} /> Insert</label>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={()=> setShowMove(false)} className="flex-1 bg-gray-200 rounded py-2 text-sm">Cancel</button>
              <button onClick={confirmMove} className="flex-1 bg-[#f39c12] text-white rounded py-2 font-bold">Confirm Move</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
