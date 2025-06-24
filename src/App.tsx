/* App.tsx – compact, compile‑safe, full JSX */
import React, { useState, useMemo, ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';

type Unit = 'm' | 'cm';
const toM = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const rnd = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

type Dim = 'height' | 'length' | 'width';
const D: Record<Dim, string> = { height: 'H', length: 'L', width: 'W' };

interface Truck { length: number; width: number; height: number; unit: Unit; maxLoad?: number; }
interface Crate { id: number; label: string; length: number; lengthUnit: Unit; width: number; widthUnit: Unit; height: number; heightUnit: Unit; weight: number; colour: string; stackable: boolean; stackTargetId?: number; }
interface Row { label: string; length: number; width: number; height: number; weight: number; }
interface Placed extends Crate { position: [number, number, number]; }

const Banner: React.FC<{ c: string; t?: number; msg: string }> = ({ c, t = 0, msg }) => (
  <div style={{ position: 'absolute', top: t, left: 0, right: 0, padding: 6, background: c, color: '#fff', fontWeight: 600, textAlign: 'center', zIndex: 50 }}>{msg}</div>
);

function pack(truck: Truck, crates: Crate[]): { placed: Placed[]; overflow: number[] } {
  const P: Placed[] = [], O: number[] = [];
  const base = crates.filter(c => !c.stackTargetId).sort((a, b) => b.weight - a.weight);
  const L = toM(truck.length, truck.unit), W = toM(truck.width, truck.unit), H = toM(truck.height, truck.unit);
  let l1 = 0, l2 = 0;
  base.forEach(c => {
    const l = toM(c.length, c.lengthUnit), w = toM(c.width, c.widthUnit), h = toM(c.height, c.heightUnit);
    if (h > H) { O.push(c.id); return; }
    const lane = l1 <= l2 ? 1 : 2, x = lane === 1 ? l1 : l2;
    if (x + l > L || w > W) { O.push(c.id); return; }
    P.push({ ...c, position: [x + l / 2, h / 2, lane === 1 ? w / 2 : W - w / 2] });
    lane === 1 ? (l1 += l) : (l2 += l);
  });
  crates.filter(c => c.stackTargetId).forEach(c => {
    const b = P.find(p => p.id === c.stackTargetId);
    if (!b) { O.push(c.id); return; }
    const h = toM(c.height, c.heightUnit), y = b.position[1] + toM(b.height, b.heightUnit) / 2 + h / 2;
    if (y + h / 2 > H) { O.push(c.id); return; }
    P.push({ ...c, position: [b.position[0], y, b.position[2]] });
  });
  return { placed: P, overflow: O };
}

export default function App() {
  const [truck, setTruck] = useState<Truck>({ length: 10, width: 2.5, height: 2.6, unit: 'm', maxLoad: 1000 });
  const [cr, setCr] = useState<Crate[]>([{ id: 1, label: 'Crate 1', length: 1, lengthUnit: 'm', width: 1, widthUnit: 'm', height: 1, heightUnit: 'm', weight: 100, colour: rnd(), stackable: false }]);
  const [rows, setRows] = useState<Row[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [hist, setHist] = useState<Crate[][]>([]);

  const { placed, overflow } = useMemo(() => pack(truck, cr), [truck, cr]);
  const weight = useMemo(() => cr.reduce((s, c) => s + c.weight, 0), [cr]);
  const cap = truck.maxLoad !== undefined && weight >= truck.maxLoad;

  const overlaps = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        if (a.id === b.stackTargetId || b.id === a.stackTargetId) continue;
        const ax = toM(a.length, a.lengthUnit) / 2, ay = toM(a.height, a.heightUnit) / 2, az = toM(a.width, a.widthUnit) / 2;
        const bx = toM(b.length, b.lengthUnit) / 2, by = toM(b.height, b.heightUnit) / 2, bz = toM(b.width, b.widthUnit) / 2;
        const o = Math.abs(a.position[0] - b.position[0]) < ax + bx && Math.abs(a.position[1] - b.position[1]) < ay + by && Math.abs(a.position[2] - b.position[2]) < az + bz;
        if (o) list.push(`${a.label} & ${b.label}`);
      }
    }
    return list;
  }, [placed]);

  const snap = () => setHist([JSON.parse(JSON.stringify(cr))]);
  const updCrate = (id: number, p: Partial<Crate>) => setCr(cr.map(c => (c.id === id ? { ...c, ...p } : c)));
  const del = (id: number) => { snap(); setCr(cr.filter(c => c.id !== id && c.stackTargetId !== id)); };
  const add = (r?: Row) => setCr([...cr, { id: Math.max(...cr.map(c => c.id)) + 1, label: r?.label ?? `Crate ${cr.length + 1}`, length: r?.length ?? 1, lengthUnit: 'm', width: r?.width ?? 1, widthUnit: 'm', height: r?.height ?? 1, heightUnit: 'm', weight: r?.weight ?? 50, colour: rnd(), stackable: false }]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const wb = XLSX.read(ev.target!.result as ArrayBuffer);
      const js = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }) as any[];
      const r: Row[] = [];
      js.forEach(o => { if (o.label || o.Label) r.push({ label: o.label || o.Label, length: +o.length || +o.Length, width: +o.width || +o.Width, height: +o.height || +o.Height, weight: +o.weight || +o.Weight }); });
      setRows(r); setSel(new Set());
    };
    reader.readAsArrayBuffer(e.target.files[0]);
  };

  const truckL = toM(truck.length, truck.unit), truckW = toM(truck.width, truck.unit), truckH = toM(truck.height, truck.unit);
  const occBase = new Set(cr.filter(c => c.stackTargetId).map(c => c.stackTargetId!));

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {overflow.length > 0 && <Banner c="#c62828" msg={`Overflow: ${overflow.map(id => cr.find(c => c.id === id)!.label).join(', ')}`} />}
      {cap && <Banner c="#f57c00" t={32} msg={`Max load reached (${weight}/${truck.maxLoad} kg)`} />}
      {overlaps.length > 0 && <Banner c="#b71c1c" t={64} msg={`Overlap: ${overlaps.join('; ')}`} />}

      <aside style={{ width: 360, padding: 12, overflowY: 'auto', borderRight: '1px solid #ccc' }}>
        <h2>Truck</h2>
        {(['height', 'length', 'width'] as Dim[]).map(d => (
          <p key={d}>{D[d]} <input type="number" style={{ width: 60 }} value={truck[d]} onChange={e => setTruck({ ...truck, [d]: +e.target.value })} /> {truck.unit}</p>
        ))}
        <p>Unit <select value={truck.unit} onChange={e => setTruck({ ...truck, unit: e.target.value as Unit })}><option value="m">m</option><option value="cm">cm</option></select></p>
        <p>Max load <input type="number" style={{ width: 70 }} value={truck.maxLoad ?? ''} onChange={e => setTruck({ ...truck, maxLoad: e.target.value ? +e.target.value : undefined })} /> kg</p>

        <h3>Import</h3>
        <input type="file" accept=".xls,.xlsx" onChange={onFile} />
        {rows.length > 0 && (
          <div style={{ border: '1px solid #ccc', padding: 6, marginTop: 6 }}>
            {rows.map((r, i) => (
              <p key={i}><input type="checkbox" checked={sel.has(i)} onChange={e => { const s = new Set(sel); e.target.checked ? s.add(i) : s.delete(i); setSel(s); }} /> {r.label} ({r.height}×{r.length}×{r.width}) – {r.weight}kg</p>
            ))}
            <button disabled={sel.size === 0 || cap} onClick={() => { sel.forEach(i => add(rows[i])); setRows([]);} }>Add selected</button>
          </div>
        )}

        <h2>Crates</h2>
        {cr.map(c => (
          <details key={c.id} style={{ marginBottom: 8 }} open>
            <summary>{c.label}</summary>
            {(['height', 'length', 'width'] as Dim[]).map(dim => {
              const uKey = `${dim}Unit` as const; return (
                <p key={dim}>{D[dim]} <input type="number" style={{ width: 60 }} value={c[dim]} onChange={e => updCrate(c.id, { [dim]: +e.target.value } as any)} />
                  <select value={c[uKey]} onChange={e => updCrate(c.id, { [uKey]: e.target.value as Unit } as any)}><option value="m">m</option><option value="cm">cm</option></select>
                </p>
              );
            })}
            <p>Weight <input type="number" style={{ width: 70 }} value={c
