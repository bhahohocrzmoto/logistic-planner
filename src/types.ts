/*  src/types.ts
 *  Central place for shared type / constant definitions
 *  ───────────────────────────────────────────────────── */

export type Unit = "m" | "cm";

export interface Truck {
  l: number;   // length
  w: number;   // width
  h: number;   // height
  maxLoad: number;
  unit: Unit;
}

export interface Crate {
  id: number;
  l: number;
  w: number;
  h: number;
  weight: number;
  color: string;
  opacity: number;          // 0–1
  label: string;
  stack: "floor" | number;  // "floor" or id of crate it sits on
  /** Calculated placement by the algorithm (x,y,z) */
  pos: [number, number, number];
}
