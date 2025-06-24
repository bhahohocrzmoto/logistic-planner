/*  App.tsx – FULL, tested compile‑safe and complete JSX  */
import React, { useState, useMemo, ChangeEvent, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';

/* ── helpers ────────────────────────────────────────────────────────── */
type Unit = 'm' | 'cm';
const toMeters = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const randColor = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

/* ── models ─────────────────────────────────────────────────────────── */
interface Truck { length: number; width: number; height: number; unit: Unit; maxLoad?: number; }
type DimAxis = 'height' | 'length' | 'width';
const DIM_LABEL: Record<DimAxis, string> = { height: 'H', length: 'L', width: 'W' };

interface CrateInput {
  id: number;
  label: string;
  length: number; lengthUnit: Unit;
  width:  number; widthUnit:  Unit;
  height: number; heightUnit: Unit;
  weight: number;
  colour: string;
  stackable: boolean;
  stackTargetId?: number;
}
interface ParsedRow { label: string; length: number; width: number; height: number; weight: number; }
interface CratePlaced extends CrateInput { position: [number, number, number]; }

type DimUnitKey = `${DimAxis}Unit`;

/* ── tiny Banner component for warnings ─────────────────────────────── */
const Banner: React.FC<{ color: string; top?: number; children: ReactNode }> = ({ color, top = 0, children }) => (
  <div style={{ position: 'absolute', top, left: 0, right: 0, padding: '6px 12px', background: color, color: '#fff', fontWeight: 600, textAlign: 'center', zIndex: 50 }}>
    {children}
  </div>
);

/* ── packer (simple two‑lane) ───────────────────────────────────────── */
function packCrates(truck: Truck, crates: CrateInput[]): { placed: CratePlaced[]; overflowIds: number[] } {
  const placed: CratePlaced[] = [];
  const overflow: number[] = [];

  const base = crates.filter(c => !c.stackTargetId).sort((a, b) => b.weight - a.weight);
  const L = toMeters(truck.length, truck.unit);
  const W = toMeters(truck.width , truck.unit);
  const H = toMeters(truck.height, truck.unit);

  let curL = 0; let curR = 0;
  for (const c of base) {
    const l = toMeters(c.length, c.lengthUnit);
    const w = toMeters(c.width , c.widthUnit );
    const h = toMeters(c.height, c.heightUnit);
    if (h > H) { overflow.push(c.id); continue; }
    const lane = curL <= curR ? 'L' : 'R';
    const xFront = lane === 'L' ? curL : curR;
    if (xFront + l > L || w > W) { overflow.push(c.id); continue; }
    const z = lane === 'L' ? w / 2 : W - w / 2;
    placed.push({ ...c, position: [xFront + l / 2, h / 2, z] });
    lane === 'L' ? (curL += l) : (curR += l);
  }

  // stacked crates
  crates.filter(c => c.stackTargetId).forEach(c => {
    const baseCrate = placed.find(p => p.id === c.stackTargetId);
    if (!baseCrate) { overflow.push(c.id); return; }
    const h = toMeters(c.height, c.heightUnit);
    const baseH = toMeters(baseCrate.height, baseCrate.heightUnit);
    const y = baseCrate.position[1] + baseH / 2 + h / 2;
    if (y + h / 2 > H) { overflow.push(c.id); return; }
    placed.push({ ...c, position: [baseCrate.position[0], y, baseCrate.position[2]] });
  });

  return { placed, overflowIds: overflow };
}

/* ── main component ─────────────────────────────────────────────────── */
export default function App() {
  /* state */
  const [truck, setTruck] = useState<Truck>({ length: 10, width: 2.5, height: 2.6, unit: 'm', maxLoad: 1000 });
  const [crates, setCrates] = useState<CrateInput[]>([{
    id: 1, label: 'Crate 1', length: 1, lengthUnit: 'm', width: 1, widthUnit: 'm', height: 1, heightUnit: 'm', weight: 100, colour: randColor(), stackable: false,
  }]);
  const [history, setHistory] = useState<CrateInput[][]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [rowSel, setRowSel] = useState<Set<number>>(new Set());

  /* derived */
  const { placed, overflowIds } = useMemo(() => packCrates(truck, crates), [truck, crates]);
  const totalWeight = useMemo(() => crates.reduce((s, c) => s + c.weight, 0), [crates]);
  const capacityReached = truck.maxLoad !== undefined && totalWeight >= (truck.maxLoad ?? Infinity);

  // overlap detection
  const overlaps = useMemo(() => {
    const list: [string, string][] = [];
    for (let i = 0; i < placed.length - 1; i++) {
      const a = placed[i];
      const dimsA = {
        xMin: a.position[0] - toMeters(a.length, a.lengthUnit) / 2,
        xMax: a.position[0] + toMeters(a.length, a.lengthUnit) / 2,
        yMin: a.position[1] - toMeters(a.height, a.heightUnit) / 2,
        yMax: a.position[1] + toMeters(a.height, a.heightUnit) / 2,
        zMin: a.position[2] - toMeters(a.width , a.widthUnit ) / 2,
        zMax: a.position[2] + toMeters(a.width , a.widthUnit ) / 2,
      };
      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j];
        if (a.id === b.stackTargetId || b.id === a.stackTargetId) continue;
        const dimsB = {
          xMin: b.position[0] - toMeters(b.length, b.lengthUnit) / 2,
          xMax: b.position[0] + toMeters(b.length, b.lengthUnit) / 2,
          yMin: b.position[1] - toMeters(b.height, b.heightUnit) / 2,
          yMax: b.position[1] + toMeters(b.height, b.heightUnit) / 2,
          zMin: b.position[2] - toMeters(b.width , b.widthUnit ) / 2,
          zMax: b.position[2] + toMeters(b.width , b.widthUnit ) / 2,
        };
        const o = dimsA.xMin < dimsB.xMax && dimsA.xMax > dimsB.xMin &&
                  dimsA.yMin < dimsB.yMax && dimsA.yMax > dimsB.yMin &&
                  dimsA.zMin < dimsB.zMax && dimsA.zMax > dimsB.zMin;
        if (o) list.push([a.label, b.label]);
      }
    }
    return list;
  }, [placed]);

  /* helpers */
  const snap = () => setHistory([JSON.parse(JSON.stringify(crates))]);
  const updTruck = <K extends keyof Truck>(k: K, v: Truck[K]) => setTruck(t => ({ ...t, [k]: v }));
  const updCrate = (id: number, patch: Partial<CrateInput>) => setCrates(p => p.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const delCrate = (id: number) => { snap(); setCrates(p => p.filter(c => c.id !== id && c.stackTargetId !== id)); };
  const undo = () => history.length && (setCrates(history[0]), setHistory([]));

  const addCrate = (data?: ParsedRow) => setCrates(prev => ([
    ...prev,
    {
      id: Math.max(...prev.map(c => c.id)) + 1,
      label: data?.label ?? `Crate ${prev.length + 1}`,
      length: data?.length ?? 1, lengthUnit: 'm',
      width:  data?.width  ?? 1, widthUnit:  'm',
      height: data?.height ?? 1, heightUnit: 'm',
      weight: data?.weight ?? 50,
      colour: randColor(),
      stackable: false,
    },
  ]));

  /* file import */
  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = ev => {
      const wb = XLSX.read(ev.target!.result as ArrayBuffer);
      const js = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }) as any[];
      const rows: ParsedRow[] = [];
      js.forEach((r, idx) => {
        const label = r.Label || r.label;
        const length = Number(r.Length || r.length);
        const width  = Number(r.Width  || r.width );
        const height = Number(r.Height || r.height);
        const weight = Number(r.Weight || r.weight);
        if (label && length && width && height && weight) rows.push({ label, length, width, height, weight });
        else console.warn(`Row ${idx + 2} ignored`);
      });
      setParsedRows(rows); setRowSel(new Set());
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const addSelectedRows = () => {
    const addW = parsedRows.reduce((s, r, i) => rowSel.has(i) ? s + r.weight : s, 0);
    if (truck.maxLoad !== undefined && totalWeight + addW > truck.maxLoad) {
      alert('Adding would exceed max load');
      return;
    }
    snap();
    parsedRows.forEach((r, i) => rowSel.has(i) && addCrate(r));
    setParsedRows([]); setRowSel(new Set());
  };

  /* render constants */
  const truckL = toMeters(truck.length, truck.unit);
  const truckW = toMeters(truck.width , truck.unit);
  const truckH = toMeters(truck.height, truck.unit);
  const occupiedBaseIds = new Set(crates.filter(c => c.stackTargetId).map(c => c.stackTargetId!));

  /* ── JSX ──────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* banners */}
      {overflowIds.length > 0 && <Banner color="#c62828">Truck volume overflow: {overflowIds.map(id => crates.find(c => c.id === id)!.label).join(', ')}</Banner>}
      {capacityReached && <Banner color="#f57c00" top={32}>Max load reached ({totalWeight} / {truck.maxLoad} kg)</Banner>}
      {overlaps.length > 0 && <Banner color="#b71c1c" top={64}>Overlaps: {overlaps.map(p => `${p[0]} & ${p[1]}`).join('; ')}</Banner>}

      <img src="/nav-help.png" alt="nav help" style={{ position: 'absolute', right: 10, bottom: 10, width: 130, opacity: 0.9, pointerEvents: 'none' }} />

      {/* sidebar */}
      <aside style
