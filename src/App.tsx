/* App.tsx – fixed missing UnitKey type causing TS2304 */
import React, { useState, useMemo, ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';

// ─── helpers ──────────────────────────────────────────────────────────
type Unit = 'm' | 'cm';
const m = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const rnd = () => `#${Math.random().toString(16).slice(2, 8).padStart(6, '0')}`;

type Dim = 'height' | 'length' | 'width';
const LBL: Record<Dim, string> = { height: 'H', length: 'L', width: 'W' };
// NEW: explicit union for the "heightUnit" | "lengthUnit" | "widthUnit" keys
type UnitKey = 'heightUnit' | 'lengthUnit' | 'widthUnit';

// ─── data models ──────────────────────────────────────────────────────
interface Truck { length: number; width: number; height: number; unit: Unit; maxLoad?: number; }
interface Crate { id: number; label: string; length: number; lengthUnit: Unit; width: number; widthUnit: Unit; height: number; heightUnit: Unit; weight: number; colour: string; stackable: boolean; stackTargetId?: number; }
interface Parsed { label: string; length: number; width: number; height: number; weight: number; }
interface Placed extends Crate { position: [number, number, number]; }

// ─── banner ───────────────────────────────────────────────────────────
const Banner: React.FC<{ c: string; y?: number; msg: string }> = ({ c, y = 0, msg }) => (
  <div style={{ position: 'absolute', top: y, left: 0, right: 0, padding: 6, background: c, color: '#fff', fontWeight: 600, textAlign: 'center', zIndex: 50 }}>{msg}</div>
);

// ─── packer (two‑lane + stacking) ─────────────────────────────────────
function pack(t: Truck, crates: Crate[]): { placed: Placed[]; ov: number[] } {
  const p: Placed[] = [], ov: number[] = [], L = m(t.length, t.unit), W = m(t.width, t.unit), H = m(t.height, t.unit);
  let l1 = 0, l2 = 0;
  [...crates].filter(c => !c.stackTargetId).sort((a, b) => b.weight - a.weight).forEach(c => {
    const l = m(c.length, c.lengthUnit), w = m(c.width, c.widthUnit), h = m(c.height, c.heightUnit), lane = l1 <= l2 ? 1 : 2, x = lane === 1 ? l1 : l2;
    if (h > H || x + l > L || w > W) { ov.push(c.id); return; }
    p.push({ ...c, position: [x + l / 2, h / 2, lane === 1 ? w / 2 : W - w / 2] });
    lane === 1 ? (l1 += l) : (l2 += l);
  });
  crates.filter(c => c.stackTargetId).forEach(c => {
    const base = p.find(b => b.id === c.stackTargetId); if (!base) { ov.push(c.id); return; }
    const y = base.position[1] + m(base.height, base.heightUnit) / 2 + m(c.height, c.heightUnit) / 2;
    if (y + m(c.height, c.heightUnit) / 2 > H) { ov.push(c.id); return; }
    p.push({ ...c, position: [base.position[0], y, base.position[2]] });
  });
  return { placed: p, ov };
}

// ─── component ────────────────────────────────────────────────────────
export default function App() {
  /* state */
  const [truck, setTruck] = useState<Truck>({ length: 10, width: 2.5, height: 2.6, unit: 'm', maxLoad: 1000 });
  const [cr, setCr] = useState<Crate[]>([{ id: 1, label: 'Crate 1', length: 1, lengthUnit: 'm', width: 1, widthUnit: 'm', height: 1, heightUnit: 'm', weight: 100, colour: rnd(), stackable: false }]);
  const [rows, setRows] = useState<Parsed[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());

  /* derived */
  const { placed, ov } = useMemo(() => pack(truck, cr), [truck, cr]);
  const weight = cr.reduce((s, c) => s + c.weight, 0);
  const cap = truck.maxLoad !== undefined && weight >= truck.maxLoad;
  const overlaps = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < placed.length; ++i) for (let j = i + 1; j < placed.length; ++j) {
      const a = placed[i], b = placed[j]; if (a.id === b.stackTargetId || b.id === a.stackTargetId) continue;
      const ax = m(a.length, a.lengthUnit) / 2, ay = m(a.height, a.heightUnit) / 2, az = m(a.width, a.widthUnit) / 2;
      const bx = m(b.length, b.lengthUnit) / 2, by = m(b.height, b.heightUnit) / 2, bz = m(b.width, b.widthUnit) / 2;
      if (Math.abs(a.position[0] - b.position[0]) < ax + bx && Math.abs(a.position[1] - b.position[1]) < ay + by && Math.abs(a.position[2] - b.position[2]) < az + bz) list.push(`${a.label}&${b.label}`);
    }
    return list;
  }, [placed]);

  /* helpers */
  const add = (r?: Parsed) => setCr([...cr, { id: cr.length ? Math.max(...cr.map(c => c.id)) + 1 : 1, label: r?.label ?? `Crate ${cr.length + 1}`, length: r?.length ?? 1, lengthUnit: 'm', width: r?.width ?? 1, widthUnit: 'm', height: r?.height ?? 1, heightUnit: 'm', weight: r?.weight ?? 50, colour: rnd(), stackable: false }]);
  const upd = (id: number, p: Partial<Crate>) => setCr(cr.map(c => (c.id === id ? { ...c, ...p } : c)));
  const del = (id: number) => setCr(cr.filter(c => c.id !== id && c.stackTargetId !== id));

  /* upload */
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const rd = new FileReader();
    rd.onload = ev => {
      const js = XLSX.utils.sheet_to_json(XLSX.read(ev.target!.result as ArrayBuffer).Sheets['Sheet1'], { defval: '' }) as any[];
      setRows(js.map(o => ({ label: o.label || o.Label, length: +o.length || +o.Length, width: +o.width || +o.Width, height: +o.height || +o.Height, weight: +o.weight || +o.Weight })));
    };
    rd.readAsArrayBuffer(e.target.files[0]);
  };

  /* 3‑D constants */
  const TL = m(truck.length, truck.unit), TW = m(truck.width, truck.unit), TH = m(truck.height, truck.unit);

  /* JSX */
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {ov.length > 0 && <Banner c="#c62828" msg={`Overflow: ${ov.map(id => cr.find(c => c.id === id)!.label).join(', ')}`} />}
      {cap && <Banner c="#f57c00" y={32} msg={`Max load ${weight}/${truck.maxLoad}kg`} />}
      {overlaps.length > 0 && <Banner c="#b71c1c" y={64} msg={`Overlap: ${overlaps.join(',')}`} />}

      {/* sidebar */}
      <aside style={{ width: 360, padding: 8, overflowY: 'auto', borderRight: '1px solid #ccc' }}>
        <h3>Truck</h3>
        {(['height', 'length', 'width'] as Dim[]).map(d => (
          <p key={d}>{LBL[d]} <input type="number" style
