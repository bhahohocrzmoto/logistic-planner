/* App.tsx – complete, compile‑safe with stacking logic */
import React, { useState, useMemo, ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';

// ─── helpers ───────────────────────────────────────────────────────────
type Unit = 'm' | 'cm';
const toM = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const rand = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

type Dim = 'height' | 'length' | 'width';
const LABEL: Record<Dim, string> = { height: 'H', length: 'L', width: 'W' };
type UnitKey = 'heightUnit' | 'lengthUnit' | 'widthUnit';

// ─── data models ───────────────────────────────────────────────────────
interface Truck { length: number; width: number; height: number; unit: Unit; maxLoad?: number; }
interface Crate {
  id: number; label: string;
  length: number; lengthUnit: Unit;
  width: number;  widthUnit: Unit;
  height: number; heightUnit: Unit;
  weight: number; colour: string;
  stackable: boolean;
  stackTargetId?: number; // undefined → ground
}
interface Placed extends Crate { position: [number, number, number]; }

const Banner: React.FC<{ c: string; y?: number; msg: string }> = ({ c, y = 0, msg }) => (
  <div style={{ position: 'absolute', top: y, left: 0, right: 0, padding: 6, background: c, color: '#fff', fontWeight: 600, textAlign: 'center', zIndex: 50 }}>{msg}</div>
);

// ─── naive packer with stacking ───────────────────────────────────────
function pack(truck: Truck, crates: Crate[]): { placed: Placed[]; ov: number[] } {
  const placed: Placed[] = [], ov: number[] = [];
  const L = toM(truck.length, truck.unit), W = toM(truck.width, truck.unit), H = toM(truck.height, truck.unit);
  let cursor = 0;

  // base crates
  crates.filter(c => !c.stackTargetId).forEach(c => {
    const l = toM(c.length, c.lengthUnit), w = toM(c.width, c.widthUnit), h = toM(c.height, c.heightUnit);
    if (cursor + l > L || w > W || h > H) { ov.push(c.id); return; }
    placed.push({ ...c, position: [cursor + l / 2, h / 2, w / 2] });
    cursor += l;
  });

  // stacked crates
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
  const [truck, setTruck] = useState<Truck>({ length: 10, width: 2.5, height: 2.6, unit: 'm', maxLoad: 1000 });
  const [crates, setCrates] = useState<Crate[]>([{
    id: 1, label: 'Crate 1', length: 1, lengthUnit: 'm', width: 1, widthUnit: 'm', height: 1, heightUnit: 'm', weight: 100, colour: rand(), stackable: false,
  }]);

  const { placed, ov } = useMemo(() => pack(truck, crates), [truck, crates]);
  const weight = crates.reduce((s, c) => s + c.weight, 0);
  const cap = truck.maxLoad !== undefined && weight >= truck.maxLoad;

  const overlaps = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      if (a.id === b.stackTargetId || b.id === a.stackTargetId) continue; // intentional
      const ax = toM(a.length, a.lengthUnit) / 2, ay = toM(a.height, a.heightUnit) / 2, az = toM(a.width, a.widthUnit) / 2;
      const bx = toM(b.length, b.lengthUnit) / 2, by = toM(b.height, b.heightUnit) / 2, bz = toM(b.width, b.widthUnit) / 2;
      if (Math.abs(a.position[0] - b.position[0]) < ax + bx && Math.abs(a.position[1] - b.position[1]) < ay + by && Math.abs(a.position[2] - b.position[2]) < az + bz) arr.push(`${a.label}&${b.label}`);
    }
    return arr;
  }, [placed]);

  // helpers
  const addCrate = () => setCrates([...crates, {
    id: Math.max(...crates.map(c => c.id)) + 1,
    label: `Crate ${crates.length + 1}`,
    length: 1, lengthUnit: 'm', width: 1, widthUnit: 'm', height: 1, heightUnit: 'm', weight: 50, colour: rand(), stackable: false,
  }]);
  const upd = (id: number, p: Partial<Crate>) => setCrates(crates.map(c => c.id === id ? { ...c, ...p } : c));
  const del = (id: number) => setCrates(crates.filter(c => c.id !== id && c.stackTargetId !== id));

  const TL = toM(truck.length, truck.unit), TW = toM(truck.width, truck.unit), TH = toM(truck.height, truck.unit);
  const occupied = new Set(crates.filter(c => c.stackTargetId).map(c => c.stackTargetId!));

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {ov.length > 0 && <Banner c="#c62828" msg={`Overflow: ${ov.map(id => crates.find(c => c.id === id)!.label).join(', ')}`} />}
      {cap && <Banner c="#f57c00" y={32} msg={`Max load ${weight}/${truck.maxLoad} kg`} />}
      {overlaps.length > 0 && <Banner c="#b71c1c" y={64} msg={`Overlap: ${overlaps.join(', ')}`} />}

      {/* Sidebar */}
      <aside style={{ width: 380, padding: 12, overflowY: 'auto', borderRight: '1px solid #ccc' }}>
        <h3>Truck</h3>
        {(['height','length','width'] as Dim[]).map(dim => (
          <p key={dim}>{LABEL[dim]} <input type="number" style={{ width: 60 }} value={truck[dim]} onChange={e => setTruck({ ...truck, [dim]: +e.target.value })}/> {truck.unit}</p>
        ))}
        <p>Unit <select value={truck.unit} onChange={e => setTruck({ ...truck, unit: e.target.value as Unit })}><option value="m">m</option><option value="cm">cm</option></select></p>
        <p>Max load <input type="number" style={{ width: 70 }} value={truck.maxLoad ?? ''} onChange={e => setTruck({ ...truck, maxLoad: e.target.value ? +e.target.value : undefined })}/> kg</p>

        <h3>Crates</h3>
        {crates.map(c => {
          const baseOpts = crates.filter(b => b.id !== c.id && !occupied.has(b.id) && !b.stackTargetId);
          return (
            <details key={c.id} style={{ marginBottom: 6 }}>
              <summary>{c.label}</summary>
              {(['height','length','width'] as Dim[]).map(dim => { const uk=(dim+'Unit') as UnitKey; return (
                <p key={dim}>{LABEL[dim]} <input type="number" style={{ width: 60 }} value={c[dim]} onChange={e=>upd(c.id,{[dim]:+e.target.value} as any)}/> <select value={c[uk]} onChange={e=>upd(c.id,{[uk]:e.target.value as Unit} as any)}><option value="m">m</option><option value="cm">cm</option></select></p>
              );})}
              <p>Weight <input type="number" style={{ width
