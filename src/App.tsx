/* App.tsx – FINAL compile‑safe, fully closed JSX */
import React, { useState, useMemo, ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';

/** ───────── helpers ───────── */
type Unit = 'm' | 'cm';
const toM = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const rand = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

type Dim = 'height' | 'length' | 'width';
const LABEL: Record<Dim, string> = { height: 'H', length: 'L', width: 'W' };
// keys for unit fields
type UnitKey = 'heightUnit' | 'lengthUnit' | 'widthUnit';

/** ───────── data models ───────── */
interface Truck { length: number; width: number; height: number; unit: Unit; maxLoad?: number; }
interface Crate { id: number; label: string; length: number; lengthUnit: Unit; width: number; widthUnit: Unit; height: number; heightUnit: Unit; weight: number; colour: string; stackable: boolean; stackTargetId?: number; }
interface Parsed { label: string; length: number; width: number; height: number; weight: number; }
interface Placed extends Crate { position: [number, number, number]; }

/** ───────── banner ───────── */
const Banner: React.FC<{ color: string; top?: number; children: React.ReactNode }> = ({ color, top = 0, children }) => (
  <div style={{ position: 'absolute', top, left: 0, right: 0, padding: 6, background: color, color: '#fff', fontWeight: 600, textAlign: 'center', zIndex: 50 }}>{children}</div>
);

/** ───────── packer ───────── */
function pack(truck: Truck, crates: Crate[]): { placed: Placed[]; overflow: number[] } {
  const placed: Placed[] = [];
  const overflow: number[] = [];
  const L = toM(truck.length, truck.unit), W = toM(truck.width, truck.unit), H = toM(truck.height, truck.unit);
  let l1 = 0, l2 = 0;
  crates.filter(c => !c.stackTargetId).sort((a, b) => b.weight - a.weight).forEach(c => {
    const l = toM(c.length, c.lengthUnit), w = toM(c.width, c.widthUnit), h = toM(c.height, c.heightUnit);
    const lane = l1 <= l2 ? 1 : 2, x = lane === 1 ? l1 : l2;
    if (h > H || x + l > L || w > W) { overflow.push(c.id); return; }
    placed.push({ ...c, position: [x + l / 2, h / 2, lane === 1 ? w / 2 : W - w / 2] });
    lane === 1 ? (l1 += l) : (l2 += l);
  });
  crates.filter(c => c.stackTargetId).forEach(c => {
    const base = placed.find(p => p.id === c.stackTargetId);
    if (!base) { overflow.push(c.id); return; }
    const y = base.position[1] + toM(base.height, base.heightUnit) / 2 + toM(c.height, c.heightUnit) / 2;
    if (y + toM(c.height, c.heightUnit) / 2 > H) { overflow.push(c.id); return; }
    placed.push({ ...c, position: [base.position[0], y, base.position[2]] });
  });
  return { placed, overflow };
}

/** ───────── component ───────── */
export default function App() {
  /* state */
  const [truck, setTruck] = useState<Truck>({ length: 10, width: 2.5, height: 2.6, unit: 'm', maxLoad: 1000 });
  const [crates, setCrates] = useState<Crate[]>([{
    id: 1, label: 'Crate 1', length: 1, lengthUnit: 'm', width: 1, widthUnit: 'm', height: 1, heightUnit: 'm', weight: 100, colour: rand(), stackable: false,
  }]);
  const [rows, setRows] = useState<Parsed[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());

  /* derived */
  const { placed, overflow } = useMemo(() => pack(truck, crates), [truck, crates]);
  const totalWeight = useMemo(() => crates.reduce((s, c) => s + c.weight, 0), [crates]);
  const capacityReached = truck.maxLoad !== undefined && totalWeight >= truck.maxLoad!;
  const overlaps = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        if (a.id === b.stackTargetId || b.id === a.stackTargetId) continue;
        const ax = toM(a.length, a.lengthUnit) / 2, ay = toM(a.height, a.heightUnit) / 2, az = toM(a.width, a.widthUnit) / 2;
        const bx = toM(b.length, b.lengthUnit) / 2, by = toM(b.height, b.heightUnit) / 2, bz = toM(b.width, b.widthUnit) / 2;
        if (Math.abs(a.position[0] - b.position[0]) < ax + bx && Math.abs(a.position[1] - b.position[1]) < ay + by && Math.abs(a.position[2] - b.position[2]) < az + bz) list.push(`${a.label} & ${b.label}`);
      }
    }
    return list;
  }, [placed]);

  /* helpers */
  const addCrate = (r?: Parsed) => setCrates([...crates, {
    id: crates.length ? Math.max(...crates.map(c => c.id)) + 1 : 1,
    label: r?.label ?? `Crate ${crates.length + 1}`,
    length: r?.length ?? 1, lengthUnit: 'm',
    width: r?.width ?? 1, widthUnit: 'm',
    height: r?.height ?? 1, heightUnit: 'm',
    weight: r?.weight ?? 50,
    colour: rand(),
    stackable: false,
  }]);
  const updateCrate = (id: number, patch: Partial<Crate>) => setCrates(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const deleteCrate = (id: number) => setCrates(prev => prev.filter(c => c.id !== id && c.stackTargetId !== id));

  /* file upload */
  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const ws = XLSX.read(ev.target!.result as ArrayBuffer).Sheets[0] ?? Object.values(XLSX.read(ev.target!.result as ArrayBuffer).Sheets)[0];
      const js = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];
      setRows(js.map(o => ({ label: o.label || o.Label, length: +o.length || +o.Length, width: +o.width || +o.Width, height: +o.height || +o.Height, weight: +o.weight || +o.Weight })));
      setSel(new Set());
    };
    reader.readAsArrayBuffer(e.target.files[0]);
  };

  /* dimensions */
  const TL = toM(truck.length, truck.unit), TW = toM(truck.width, truck.unit), TH = toM(truck.height, truck.unit);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {overflow.length > 0 && <Banner color="#c62828">Overflow: {overflow.map(id => crates.find(c => c.id === id)!.label).join(', ')}</Banner>}
      {capacityReached && <Banner color="#f57c00" top={32}>Max load {totalWeight}/{truck.maxLoad} kg</Banner>}
      {overlaps.length > 0 && <Banner color="#b71c1c" top={64}>Overlap: {overlaps.join('; ')}</Banner>}

      {/* sidebar */}
      <aside style={{ width: 380, padding: 12, overflowY: 'auto', borderRight: '1px solid #ccc' }}>
        <h3>Truck</h3>
        {(['height','length','width'] as Dim[]).map(dim => (
          <p key={dim}>{LABEL[dim]} <input type="number" style={{ width: 60 }} value={truck[dim]} onChange={e => setTruck({ ...truck, [dim]: +e.target.value })} /> {truck.unit}</p>
        ))}
        <p>Unit <select value={truck.unit} onChange={e => setTruck({ ...truck, unit: e.target.value as Unit })}><option value="m">m</option><option value="cm">cm</option></select></p>
        <p>Max load <input type="number" style
