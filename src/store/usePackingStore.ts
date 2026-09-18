import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MasterDB, Order, Box, FALLBACK_MASTER_DATA } from "../lib/packing";

type State = {
  master: MasterDB;
  order: Order;
  boxes: Box[];
  outlet: string;
  checker: string;
  cluster: string;
  companyCode: "BBB"|"BBT";
  sourceDocs: string[]; // DO.2026.06.00806 / IT.2026.06.00279 captured from Surat Jalan scanner — follows scan, user-editable via company toggle
  setMaster: (m: MasterDB)=>void;
  setOrder: (o: Order)=>void;
  setOutlet: (v:string)=>void;
  setChecker: (v:string)=>void;
  setCompanyCode: (v:"BBB"|"BBT")=>void;
  setCluster: (v:string)=>void;
  setSourceDocs: (docs: string[])=>void;
  addItem: (sku:string, baseQty:number, note:string)=>void;
  subItem: (sku:string, baseQty:number)=>void;
  clearOrder: ()=>void;
  setBoxes: (b: Box[])=>void;
  setItemNote: (sku: string, note: string) => void;
};

export const usePackingStore = create<State>()(
  persist(
    (set, get)=>({
      master: FALLBACK_MASTER_DATA,
      order: {},
      boxes: [],
      outlet: "",
      checker: "Select Checker",
      cluster: "",
      companyCode: "BBB",
      sourceDocs: [],
      setMaster: (m)=> set({ master:m }),
      setOrder: (o)=> set({ order:o }),
      setOutlet: (v)=> set({ outlet:v }),
      setChecker: (v)=> set({ checker:v }),
      setCompanyCode: (v)=> set({ companyCode:v }),
      setCluster: (v)=> set({ cluster:v }),
      setSourceDocs: (docs)=> set({ sourceDocs: [...new Set(docs.map(d=> String(d).trim().toUpperCase()).filter(Boolean))] }),
      setBoxes: (b)=> set({ boxes:b }),
      setItemNote: (sku, note)=>{ const { order } = get(); const next={...order}; if(next[sku]) next[sku]={ ...next[sku], note }; set({ order: next }); },
      addItem: (sku, baseQty, note)=>{
        const { order } = get();
        // multipliers ported from core.py add_item — preserve 1:1 (BBT variants are *1)
        let qty=baseQty;
        if(["Beef Patty Small","Beef Patty Large","Beef Patty Small (BBT)","Beef Patty Large (BBT)"].includes(sku)) qty*=18;
        else if(sku==="Thousand Island Mayonaise") qty*=20;
        else if(sku==="Thousand Island (BBT)") qty*=1;
        else if(sku==="Butter") qty*=40;
        const next={...order};
        if(next[sku]){ next[sku]={ qty: next[sku].qty+qty, note: next[sku].note.includes(note)? next[sku].note : `${next[sku].note}/${note}` };}
        else next[sku]={ qty, note };
        set({ order: next });
      },
      subItem: (sku, baseQty)=>{
        const { order } = get();
        let qty=baseQty;
        if(["Beef Patty Small","Beef Patty Large","Beef Patty Small (BBT)","Beef Patty Large (BBT)"].includes(sku)) qty*=18;
        else if(sku==="Thousand Island Mayonaise") qty*=20;
        else if(sku==="Thousand Island (BBT)") qty*=1;
        else if(sku==="Butter") qty*=40;
        const next={...order};
        if(next[sku]){ next[sku].qty-=qty; if(next[sku].qty<=0) delete next[sku]; }
        set({ order: next });
      },
      clearOrder: ()=> set({ order:{}, boxes:[], sourceDocs: [] }),
    }),
    { name: "plgen-packing-store" }
  )
);
