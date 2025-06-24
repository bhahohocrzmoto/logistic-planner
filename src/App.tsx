/* App.tsx – compile‑ready, complete file with working stacking logic, overlap + capacity guards */
import React, { useState, useMemo, ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';

// ─── helpers ───────────────────────────────────────────────────────────
type Unit = 'm' | 'cm';
const toM = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const rand = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

// dimensions & labels
type Dim = 'height' | 'length' | 'width';
const DIM_LABEL: Record<Dim, string> = { height: 'H', length: 'L', width: 'W' };
// key union used for casting
type UnitKey = 'heightUnit' | 'lengthUnit' | 'widthUnit';

// ─── data models ───────────────────────────────────────────────────────
interface Truck {
  length: number; width: number; height: number; unit: Unit; maxLoad?: number;
}
interface Crate {
  id: number; label: string;
  length: number; lengthUnit: Unit;
  width:  number; widthUnit:  Unit;
  height: number; heightUnit: Unit;
  weight: number; colour: string;
  stackable: boolean; stackTargetId?: number;
}
interface ParsedRow { label: string; length: number; width: number; height: number; weight: number; }
interface Placed extends Crate { position: [number, number, number]; }

// ─── ui helpers ────────────────────────────────────────────────────────
const Banner: React.FC<{ color: string; top?: number }> = ({ color, top = 0, children }) => (
  <div style={{ position: 'absolute', top, left: 0, right: 0, padding: 6, background: color, color: '#fff', fontWeight: 600, textAlign: 'center', zIndex: 50 }}>{children}</div>
);

// ─── packing algorithm (queue + stacking) ─────────────────────────────
function pack(truck: Truck, crates: Crate[]): { placed: Placed[]; ov: number[] } {
  const placed: Placed[] = [], ov: number[] = [];
  const L = toM(truck.length, truck.unit), W = toM(truck.width, truck.unit), H = toM(truck.height, truck.unit);
  let xCursor = 0;

  // 1. base crates
  crates.filter(c => !c.stackTargetId).forEach(c => {
    const l = toM(c.length, c.lengthUnit), w = toM(c.width, c.widthUnit), h = toM(c.height, c.heightUnit);
    if (xCursor + l > L || w > W || h > H) { ov.push(c.id); return; }
    placed.push({ ...c, position: [xCursor + l / 2, h / 2, w / 2] });
    xCursor += l;
  });

  // 2. stacked crates
  crates.filter(c => c.stackTargetId).forEach(c => {
    const base = placed.find(p => p.id === c.stackTargetId);
    if (!base) { ov.push(c.id); return; }
    const h = toM(c.height, c.heightUnit);
    const y = base.position[1] + toM(base.height, base.heightUnit) / 2 + h / 2;
    if (y + h / 2 > H) { ov.push(c.id); return; }
    placed.push({ ...c, position: [base.position[0], y, base.position[2]] });
  });

  return { placed, ov };
}

// ─── component ─────────────────────────────────────────────────────────
export default function App() {
  // state -----------------------------------------------------------------
  const [truck, setTruck] = useState<Truck>({ length: 10, width: 2.5, height: 2.6, unit: 'm', maxLoad: 1000 });
  const [crates, setCrates] = useState<Crate[]>([{
    id: 1, label: 'Crate 1', length: 1, lengthUnit: 'm', width: 1, widthUnit: 'm', height: 1, heightUnit: 'm', weight: 100, colour: rand(), stackable: false,
  }]);
  const [importRows, setImportRows] = useState<ParsedRow[]>([]);
  const [rowSel, setRowSel] = useState<Set<number>>(new Set());

  // derived --------------------------------------------------------------
  const { placed, ov } = useMemo(() => pack(truck, crates), [truck, crates]);
  const totalWeight = useMemo(() => crates.reduce((s, c) => s + c.weight, 0), [crates]);
  const capacityReached = truck.maxLoad !== undefined && totalWeight >= truck.maxLoad;
  const overlaps = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        if (a.id === b.stackTargetId || b.id === a.stackTargetId) continue; // intentional
        const ax = toM(a.length, a.lengthUnit) / 2, ay = toM(a.height, a.heightUnit) / 2, az = toM(a.width, a.widthUnit) / 2;
        const bx = toM(b.length, b.lengthUnit) / 2, by = toM(b.height, b.heightUnit) / 2, bz = toM(b.width, b.widthUnit) / 2;
        if (Math.abs(a.position[0] - b.position[0]) < ax + bx && Math.abs(a.position[1] - b.position[1]) < ay + by && Math.abs(a.position[2] - b.position[2]) < az + bz) list.push(`${a.label} & ${b.label}`);
      }
    }
    return list;
  }, [placed]);

  // helpers --------------------------------------------------------------
  const addCrate = (row?: ParsedRow) => setCrates(prev => ([...prev, {
    id: prev.length ? Math.max(...prev.map(c => c.id)) + 1 : 1,
    label: row?.label ?? `Crate ${prev.length + 1}`,
    length: row?.length ?? 1, lengthUnit: 'm',
    width:  row?.width  ?? 1, widthUnit:  'm',
    height: row?.height ?? 1, heightUnit: 'm',
    weight: row?.weight ?? 50,
    colour: rand(),
    stackable: false,
  }]));

  const updateCrate = (id: number, patch: Partial<Crate>) => setCrates(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  const deleteCrate = (id: number) => setCrates(prev => prev.filter(c => c.id !== id && c.stackTargetId !== id));

  const addCrateFromRow = (r: ParsedRow) => addCrate(r);

  // file import ----------------------------------------------------------
  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const wb = XLSX.read(ev.target!.result as ArrayBuffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<ParsedRow>(ws, { defval: '' });
      setImportRows(rows);
      setRowSel(new Set());
    };
    reader.readAsArrayBuffer(e.target.files[0]);
  };

  // constants ------------------------------------------------------------
  const TL = toM(truck.length, truck.unit), TW = toM(truck.width, truck.unit), TH = toM(truck.height, truck.unit);
  const occupiedBases = new Set(crates.filter(c => c.stackTargetId).map(c => c.stackTargetId!));

  // ─── render -----------------------------------------------------------
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {ov.length > 0 && <Banner color="#c62828">Overflow: {ov.map(id => crates.find(c => c.id === id)!.label).join(', ')}</Banner>}
      {capacityReached && <Banner color="#f57c00" top={32}>Max load {totalWeight}/{truck.maxLoad} kg</Banner>}
      {overlaps.length > 0 && <Banner color="#b71c1c" top={64}>Overlap: {overlaps.join('; ')}</Banner>}

      {/* sidebar */}
      <aside style={{ width: 380, padding: 12, overflowY: 'auto', borderRight: '1px solid #ddd' }}>
        <h3>Truck</h3>
        {(['height','length','width'] as Dim[]).map(dim => (
          <p key={dim}>{DIM_LABEL[dim]} <input type="number" style={{ width: 60 }} value={truck[dim]} onChange={e => setTruck({ ...truck, [dim]: +e.target.value })} /> {truck.unit}</p>
        ))}
        <p>Unit <select value={truck.unit} onChange={e => setTruck({ ...truck, unit: e.target.value as Unit })}><option value="m">m</option><option value="cm">cm</option></select></p>
        <p>Max load <input type="number" style={{ width: 70 }} value={truck.maxLoad ?? ''} onChange={e => setTruck({ ...truck, maxLoad: e.target.value ? +e.target.value : undefined })} /> kg</p>

        <h4>Import</h4>
        <input type="file" accept=".xls,.xlsx" onChange={handleFile} />
        {importRows.length > 0 && (
          <div style={{ border: '1px solid #ccc', padding: 6, marginTop: 6 }}>
            {importRows.map((r, i) => (
              <p key={i}><input type="checkbox" checked={rowSel.has(i)} onChange={e => { const s=new Set(rowSel); e.target.checked?s.add(i):s.delete(i); setRowSel(s); }} /> {r.label}</p>
            ))}
            <button disabled={rowSel.size===0||capacityReached} onClick={() => { rowSel.forEach(i => addCrateFromRow(importRows[i])); setImportRows([]); }}>Add selected</button>
          </div>
        )}

        <h3>Crates</h3>
        {crates.map(c => {
          const baseOptions = crates.filter(b => b.id !== c.id && !occupiedBases.has(b.id) && !b.stackTargetId);
          return (
            <details key={c
