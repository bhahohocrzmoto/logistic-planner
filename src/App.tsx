/* App.tsx – full compile‑safe file */
import React, { useState, useMemo, ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';

/* ───────── helpers ───────── */
type Unit = 'm' | 'cm';
const toMeters = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const randomColour = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

type DimAxis = 'height' | 'length' | 'width';
const LABEL: Record<DimAxis, string> = { height: 'H', length: 'L', width: 'W' };

type UnitKey = `${DimAxis}Unit`;

/* ───────── models ───────── */
interface Truck {
  length: number;
  width: number;
  height: number;
  unit: Unit;
  maxLoad?: number;
}
interface Crate {
  id: number;
  label: string;
  length: number; lengthUnit: Unit;
  width: number; widthUnit: Unit;
  height: number; heightUnit: Unit;
  weight: number;
  colour: string;
  stackable: boolean;
  stackTargetId?: number;
}
interface ParsedRow { label: string; length: number; width: number; height: number; weight: number; }
interface PlacedCrate extends Crate { position: [number, number, number]; }

/* ───────── UI ───────── */
const Banner: React.FC<{ color: string; top?: number }> = ({ color, top = 0, children }) => (
  <div style={{ position: 'absolute', top, left: 0, right: 0, padding: '6px 12px', background: color, color: '#fff', fontWeight: 600, textAlign: 'center', zIndex: 50 }}>
    {children}
  </div>
);

/* ───────── packer ───────── */
function packCrates(truck: Truck, crates: Crate[]): { placed: PlacedCrate[]; overflow: number[] } {
  const placed: PlacedCrate[] = [];
  const overflow: number[] = [];

  const base = crates.filter(c => !c.stackTargetId).sort((a, b) => b.weight - a.weight);
  const L = toMeters(truck.length, truck.unit);
  const W = toMeters(truck.width, truck.unit);
  const H = toMeters(truck.height, truck.unit);

  let curL = 0, curR = 0;
  base.forEach(c => {
    const l = toMeters(c.length, c.lengthUnit);
    const w = toMeters(c.width, c.widthUnit);
    const h = toMeters(c.height, c.heightUnit);
    if (h > H) { overflow.push(c.id); return; }
    const lane = curL <= curR ? 'L' : 'R';
    const x = lane === 'L' ? curL : curR;
    if (x + l > L || w > W) { overflow.push(c.id); return; }
    placed.push({ ...c, position: [x + l / 2, h / 2, lane === 'L' ? w / 2 : W - w / 2] });
    lane === 'L' ? (curL += l) : (curR += l);
  });

  crates.filter(c => c.stackTargetId).forEach(c => {
    const baseCrate = placed.find(p => p.id === c.stackTargetId);
    if (!baseCrate) { overflow.push(c.id); return; }
    const h = toMeters(c.height, c.heightUnit);
    const y = baseCrate.position[1] + toMeters(baseCrate.height, baseCrate.heightUnit) / 2 + h / 2;
    if (y + h / 2 > H) { overflow.push(c.id); return; }
    placed.push({ ...c, position: [baseCrate.position[0], y, baseCrate.position[2]] });
  });
  return { placed, overflow };
}

/* ───────── component ───────── */
export default function App() {
  /* state */
  const [truck, setTruck] = useState<Truck>({ length: 10, width: 2.5, height: 2.6, unit: 'm', maxLoad: 1000 });
  const [crates, setCrates] = useState<Crate[]>([{
    id: 1,
    label: 'Crate 1',
    length: 1, lengthUnit: 'm',
    width: 1, widthUnit: 'm',
    height: 1, heightUnit: 'm',
    weight: 100,
    colour: randomColour(),
    stackable: false,
  }]);
  const [history, setHistory] = useState<Crate[][]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [rowSel, setRowSel] = useState<Set<number>>(new Set());

  /* derived */
  const { placed, overflow } = useMemo(() => packCrates(truck, crates), [truck, crates]);
  const totalWeight = useMemo(() => crates.reduce((s, c) => s + c.weight, 0), [crates]);
  const capacityReached = truck.maxLoad !== undefined && totalWeight >= truck.maxLoad;

  const overlaps = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < placed.length - 1; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        if (a.id === b.stackTargetId || b.id === a.stackTargetId) continue;
        const ax = toMeters(a.length, a.lengthUnit) / 2;
        const ay = toMeters(a.height, a.heightUnit) / 2;
        const az = toMeters(a.width, a.widthUnit) / 2;
        const bx = toMeters(b.length, b.lengthUnit) / 2;
        const by = toMeters(b.height, b.heightUnit) / 2;
        const bz = toMeters(b.width, b.widthUnit) / 2;
        const collide = Math.abs(a.position[0] - b.position[0]) < ax + bx &&
                        Math.abs(a.position[1] - b.position[1]) < ay + by &&
                        Math.abs(a.position[2] - b.position[2]) < az + bz;
        if (collide) list.push(`${a.label} & ${b.label}`);
      }
    }
    return list;
  }, [placed]);

  /* helpers */
  const snapshot = () => setHistory([JSON.parse(JSON.stringify(crates))]);
  const updateCrate = (id: number, patch: Partial<Crate>) => setCrates(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const deleteCrate = (id: number) => { snapshot(); setCrates(prev => prev.filter(c => c.id !== id && c.stackTargetId !== id)); };
  const addCrate = (row?: ParsedRow) => setCrates(prev => ([
    ...prev,
    {
      id: prev.length ? Math.max(...prev.map(c => c.id)) + 1 : 1,
      label: row?.label ?? `Crate ${prev.length + 1}`,
      length: row?.length ?? 1, lengthUnit: 'm',
      width: row?.width ?? 1, widthUnit: 'm',
      height: row?.height ?? 1, heightUnit: 'm',
      weight: row?.weight ?? 50,
      colour: randomColour(),
      stackable: false,
    },
  ]));

  /* file upload */
  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const wb = XLSX.read(evt.target!.result as ArrayBuffer);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];
      const rows: ParsedRow[] = [];
      json.forEach(r => {
        const label = r.label || r.Label;
        const length = +r.length || +r.Length;
        const width = +r.width || +r.Width;
        const height = +r.height || +r.Height;
        const weight = +r.weight || +r.Weight;
        if (label && length && width && height && weight) rows.push({ label, length, width, height, weight });
      });
      setParsedRows(rows); setRowSel(new Set());
    };
    reader.readAsArrayBuffer(e.target.files[0]);
    e.target.value = '';
  };

  /* render constants */
  const truckL = toMeters(truck.length, truck.unit);
  const truckW = toMeters(truck.width, truck.unit);
  const truckH = toMeters(truck.height, truck.unit);
  const occupiedBaseIds = new Set(crates.filter(c => c.stackTargetId).map(c => c.stackTargetId!));

  /* JSX */
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* warnings */}
      {overflow.length > 0 && <Banner color="#c62828">Overflow: {overflow.map(id => crates.find(c => c.id === id)!.label).join(', ')}</Banner>}
      {capacityReached && <Banner color="#f57c00" top={32}>Max load reached ({totalWeight} / {truck.maxLoad} kg)</Banner>}
      {overlaps.length > 0 && <Banner color="#b71c1c" top={64}>Overlaps: {overlaps.join('; ')}</Banner>}

      {/* sidebar */}
      <aside style={{ width: 380, padding: 12, overflowY: 'auto', borderRight: '1px solid #ccc' }}>
        <h2>Truck</h2>
        {(['height', 'length', 'width'] as DimAxis[]).map(dim => (
          <p key={dim}>{LABEL[dim]} <input type="number" style
