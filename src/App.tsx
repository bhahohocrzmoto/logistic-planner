/*  App.tsx  */
import React, { useState, useMemo, ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';

/* ---------- helpers ---------- */
type Unit = 'm' | 'cm';
const toMeters = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const randomColour = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

/* ---------- data models ---------- */
interface Truck { length: number; width: number; height: number; unit: Unit; }
interface CrateInput {
  id: number;
  label: string;
  length: number;  lengthUnit: Unit;
  width: number;   widthUnit: Unit;
  height: number;  heightUnit: Unit;
  weight: number;
  colour: string;
  stackable: boolean;
  stackTargetId?: number;
}
interface ParsedRow {
  label: string;
  length: number;
  width: number;
  height: number;
  weight: number;
}
interface CratePlaced extends CrateInput { position: [number, number, number]; }

/* ---------- collision check ---------- */
function cratesOverlap(a: CratePlaced, b: CratePlaced): boolean {
  const getBox = (c: CratePlaced) => {
    const l = toMeters(c.length, c.lengthUnit);
    const w = toMeters(c.width, c.widthUnit);
    const h = toMeters(c.height, c.heightUnit);
    const [x, y, z] = c.position;
    return {
      minX: x - l / 2, maxX: x + l / 2,
      minY: y - h / 2, maxY: y + h / 2,
      minZ: z - w / 2, maxZ: z + w / 2,
    };
  };
  const A = getBox(a);
  const B = getBox(b);
  return (
    A.minX < B.maxX && A.maxX > B.minX &&
    A.minY < B.maxY && A.maxY > B.minY &&
    A.minZ < B.maxZ && A.maxZ > B.minZ
  );
}

function findOverlaps(crates: CratePlaced[]): [CratePlaced, CratePlaced][] {
  const overlaps: [CratePlaced, CratePlaced][] = [];
  for (let i = 0; i < crates.length; i++) {
    for (let j = i + 1; j < crates.length; j++) {
      if (cratesOverlap(crates[i], crates[j])) {
        overlaps.push([crates[i], crates[j]]);
      }
    }
  }
  return overlaps;
}

/* ---------- packer ---------- */
function packCrates(truck: Truck, crates: CrateInput[]): { placed: CratePlaced[]; overflowIds: number[] } {
  const placed: CratePlaced[] = [];
  const overflow: number[] = [];
  const baseQueue = [...crates.filter(c => !c.stackTargetId)].sort((a, b) => b.weight - a.weight);
  const truckLen = toMeters(truck.length, truck.unit);
  const truckWid = toMeters(truck.width, truck.unit);
  const truckHei = toMeters(truck.height, truck.unit);
  let cursorL = 0;
  let cursorR = 0;

  for (const crate of baseQueue) {
    const l = toMeters(crate.length, crate.lengthUnit);
    const w = toMeters(crate.width, crate.widthUnit);
    const h = toMeters(crate.height, crate.heightUnit);
    if (h > truckHei) {
      overflow.push(crate.id);
      continue;
    }
    const lane = cursorL <= cursorR ? 'L' : 'R';
    const xFront = lane === 'L' ? cursorL : cursorR;
    if (xFront + l > truckLen || w > truckWid) {
      overflow.push(crate.id);
      continue;
    }
    const zCentre = lane === 'L' ? w / 2 : truckWid - w / 2;
    placed.push({ ...crate, position: [xFront + l / 2, h / 2, zCentre] });
    lane === 'L' ? (cursorL += l) : (cursorR += l);
  }

  crates.filter(c => c.stackTargetId).forEach(c => {
    const base = placed.find(p => p.id === c.stackTargetId);
    if (!base) {
      overflow.push(c.id);
      return;
    }
    const h = toMeters(c.height, c.heightUnit);
    const baseH = toMeters(base.height, base.heightUnit);
    const y = base.position[1] + baseH / 2 + h / 2;
    if (y + h / 2 > truckHei) {
      overflow.push(c.id);
      return;
    }
    placed.push({ ...c, position: [base.position[0], y, base.position[2]] });
  });
  return { placed, overflowIds: overflow };
}

export default function App() {
  const [truck, setTruck] = useState<Truck>({ length: 10, width: 2.5, height: 2.6, unit: 'm' });
  const [maxLoad, setMaxLoad] = useState<number>(1000);
  const [crates, setCrates] = useState<CrateInput[]>([]);
  const [history, setHistory] = useState<CrateInput[][]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [rowSelection, setRowSelection] = useState<Set<number>>(new Set());

  const { placed, overflowIds } = useMemo(() => packCrates(truck, crates), [truck, crates]);
  const totalWeight = placed.reduce((sum, c) => sum + c.weight, 0);
  const overWeight = totalWeight > maxLoad;
  const overlaps = findOverlaps(placed);

  // Render the overlap warning banner
  const overlapWarning = overlaps.length > 0 ? `🚫 Crate overlap detected between: ${overlaps.map(([a, b]) => `${a.label} & ${b.label}`).join(', ')}` : null;

  // rest of your component logic and render
  return (
    <>
      {(overflowIds.length > 0 || overWeight || overlaps.length > 0) && (
        <div style={{ position:'absolute',top:0,left:0,right:0,padding:'6px 12px',background:'#c62828',color:'#fff',fontWeight:600,zIndex:50,textAlign:'center'}}>
          {overflowIds.length > 0 && <>⚠️ Overflow: {overflowIds.map(id => crates.find(c => c.id === id)?.label).join(', ')} <br/></>}
          {overWeight && <>⚠️ Load exceeded: {totalWeight.toFixed(1)} kg / {maxLoad} kg<br/></>}
          {overlaps.length > 0 && <>{overlapWarning}</>}
        </div>
      )}
      {/* The rest of your render code remains unchanged */}
    </>
  );
}  
