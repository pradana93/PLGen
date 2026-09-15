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
  setMaster: (m: MasterDB)=>void;
  setOrder: (o: Order)=>void;
  setOutlet: (v:string)=>void;
  setChecker: (v:string)=>void;
  setCompanyCode: (v:"BBB"|"BBT")=>void;
  setCluster: (v:string)=>void;
  addItem: (sku:string, baseQty:number, note:string)=>void;
  subItem: (sku:string, baseQty:number)=>void;
  clearOrder: ()=>void;
  setBoxes: (b: Box[])=>void;
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
      setMaster: (m)=> set({ master:m }),
      setOrder: (o)=> set({ order:o }),
      setOutlet: (v)=> set({ outlet:v }),
      setChecker: (v)=> set({ checker:v }),
      setCompanyCode: (v)=> set({ companyCode:v }),
      setCluster: (v)=> set({ cluster:v }),
      setBoxes: (b)=> set({ boxes:b }),
      addItem: (sku, baseQty, note)=>{
        const { master, order } = get();
        // multipliers ported from core.py
        let qty=baseQty;
        if(["Beef Patty Small","Beef Patty Large"].includes(sku)) qty*=18;
        else if(sku==="Thousand Island Mayonaise") qty*=20;
        else if(sku==="Butter") qty*=40;
        const next={...order};
        if(next[sku]){ next[sku]={ qty: next[sku].qty+qty, note: next[sku].note.includes(note)? next[sku].note : `${next[sku].note}/${note}` };}
        else next[sku]={ qty, note };
        set({ order: next });
      },
      subItem: (sku, baseQty)=>{
        const { order } = get();
        let qty=baseQty;
        if(["Beef Patty Small","Beef Patty Large"].includes(sku)) qty*=18;
        else if(sku==="Thousand Island Mayonaise") qty*=20;
        else if(sku==="Butter") qty*=40;
        const next={...order};
        if(next[sku]){ next[sku].qty-=qty; if(next[sku].qty<=0) delete next[sku]; }
        set({ order: next });
      },
      clearOrder: ()=> set({ order:{}, boxes:[] }),
    }),
    { name: "plgen-packing-store" }
  )
);
