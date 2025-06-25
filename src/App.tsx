/* App.tsx — React + @react-three/fiber logistic planner
   Features: max‑load capacity warning & lock, crate delete button, H×L×W labels, stacking logic, overlap detection. */
import React, { useState, useMemo, ChangeEvent, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';
import * as XLSX from 'xlsx';

// ─── helpers ──────────────────────────────────────────────────────────
type Unit = 'm' | 'cm';
const toM = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const rand = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

type Dim = 'height' | 'length' | 'width';
const DIM: Record<Dim, string> = { height: 'H', length: 'L', width: 'W' };
const UNITS: Unit[] = ['m', 'cm'];

type UnitKey = 'heightUnit' | 'lengthUnit' | 'widthUnit';

// ─── data models ──────────────────────────────────────────────────────
interface Truck { length: number; width: number; height: number; unit: Unit; maxLoad?: number; }
interface Crate {
  id: number; label: string;
  length: number; lengthUnit: Unit;
  width:  number; widthUnit:  Unit;
  height: number; heightUnit: Unit;
  weight: number; colour: string;
  stackable: boolean;
  stackTargetId?: number; // undefined ⇒ sits on floor
}
interface ParsedRow { label: string; length: number; width: number; height: number; weight: number; }
interface Placed extends Crate { position: [number, number, number]; }

// ─── UI helpers ───────────────────────────────────────────────────────
const Banner: React.FC<{ color: string; top?: number; children?: ReactNode }> = ({ color, top = 0, children }) => (
  <div style={{ position: 'absolute', top, left: 0, right: 0, padding: 6, background: color, color: '#fff', fontWeight: 600, textAlign: 'center', zIndex: 50 }}>{children}</div>
);

// ─── simple packing / stacking algorithm ──────────────────────────────
function pack(truck: Truck, crates: Crate[]): { placed: Placed[]; overflow: number[] } {
  const placed: Placed[] = [], overflow: number[] = [];
  const L = toM(truck.length, truck.unit), W = toM(truck.width, truck.unit), H = toM(truck.height, truck.unit);
  let cursor = 0; // x‑axis cursor along truck length (front→back)

  // first: crates on floor (no stackTarget)
  crates.filter(c => !c.stackTargetId).forEach(c => {
    const l = toM(c.length, c.lengthUnit), w = toM(c.width, c.widthUnit), h = toM(c.height, c.heightUnit);
    if (cursor + l > L || w > W || h > H) { overflow.push(c.id); return; }
    placed.push({ ...c, position: [cursor + l / 2, h / 2, w / 2] });
    cursor += l;
  });

  // then: stacked crates (stackTargetId exists)
  crates.filter(c => c.stackTargetId).forEach(c => {
    const base = placed.find(p => p.id === c.stackTargetId);
    if (!base) { overflow.push(c.id); return; }
    const h = toM(c.height, c.heightUnit);
    const newY = base.position[1] + toM(base.height, base.heightUnit) / 2 + h / 2;
    if (newY + h / 2 > H) { overflow.push(c.id); return; }
    placed.push({ ...c, position: [base.position[0], newY, base.position[2]] });
  });

  return { placed, overflow };
}

// ─── main component ───────────────────────────────────────────────────
export default function App() {
  // state ---------------------------------------------------------------
  const [truck, setTruck] = useState<Truck>({ length: 10, width: 2.5, height: 2.6, unit: 'm', maxLoad: 1000 });
  const [crates, setCrates] = useState<Crate[]>([{
    id: 1, label: 'Crate 1', length: 1, lengthUnit: 'm', width: 1, widthUnit: 'm', height: 1, heightUnit: 'm', weight: 200, colour: rand(), stackable: false,
  }]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [sel, setSel]   = useState<Set<number>>(new Set());

  // derived -------------------------------------------------------------
  const { placed, overflow } = useMemo(() => pack(truck, crates), [truck, crates]);
  const totalWeight = useMemo(() => crates.reduce((s, c) => s + c.weight, 0), [crates]);
  const capacityReached = truck.maxLoad !== undefined && totalWeight >= truck.maxLoad;
  const overlaps = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        if (a.id === b.stackTargetId || b.id === a.stackTargetId) continue; // ignore vertical pairs
        const ax = toM(a.length, a.lengthUnit) / 2, ay = toM(a.height, a.heightUnit) / 2, az = toM(a.width, a.widthUnit) / 2;
        const bx = toM(b.length, b.lengthUnit) / 2, by = toM(b.height, b.heightUnit) / 2, bz = toM(b.width, b.widthUnit) / 2;
        if (Math.abs(a.position[0] - b.position[0]) < ax + bx && Math.abs(a.position[1] - b.position[1]) < ay + by && Math.abs(a.position[2] - b.position[2]) < az + bz)
          list.push(`${a.label} & ${b.label}`);
      }
    }
    return list;
  }, [placed]);

  // actions -------------------------------------------------------------
  const addCrate = (row?: ParsedRow) => setCrates(arr => [...arr, {
    id: arr.length ? Math.max(...arr.map(c => c.id)) + 1 : 1,
    label: row?.label ?? `Crate ${arr.length + 1}`,
    length: row?.length ?? 1, lengthUnit: 'm',
    width:  row?.width  ?? 1, widthUnit:  'm',
    height: row?.height ?? 1, heightUnit: 'm',
    weight: row?.weight ?? 50,
    colour: rand(),
    stackable: true,
  }]);
  const upd = (id: number, patch: Partial<Crate>) => setCrates(arr => arr.map(c => c.id === id ? { ...c, ...patch } : c));
  const del = (id: number) => setCrates(arr => arr.filter(c => c.id !== id && c.stackTargetId !== id));

  // Excel import --------------------------------------------------------
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const wb = XLSX.read(ev.target!.result as ArrayBuffer);
      const js = XLSX.utils.sheet_to_json<ParsedRow>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      setRows(js); setSel(new Set());
    };
    reader.readAsArrayBuffer(e.target.files[0]);
  };

  // geometry constants --------------------------------------------------
  const TL = toM(truck.length, truck.unit), TW = toM(truck.width, truck.unit), TH = toM(truck.height, truck.unit);

  // render --------------------------------------------------------------
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* banners */}
      {overflow.length > 0 && <Banner color="#c62828">Overflow: {overflow.map(id => crates.find(c => c.id === id)!.label).join(', ')}</Banner>}
      {capacityReached && <Banner color="#f57c00" top={32}>Max load {totalWeight}/{truck.maxLoad} kg</Banner>}
      {overlaps.length > 0 && <Banner color="#b71c1c" top={64}>Overlap: {overlaps.join('; ')}</Banner>}

      {/* sidebar */}
      <aside style={{ width: 380, padding: 12, overflowY: 'auto', borderRight: '1px solid #ddd' }}>
        <h3>Truck</h3>
        {(['height','length','width'] as Dim[]).map(dim => (
          <p key={dim}>{DIM[dim]} <input type="number" style={{ width: 60 }} value={truck[dim]} onChange={e => setTruck({ ...truck, [dim]: +e.target.value } as Truck)} /> {truck.unit}</p>
        ))}
        <p>Unit <select value={truck.unit} onChange={e => setTruck({ ...truck, unit: e.target.value as Unit })}>{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></p>
        <p>Max load <input type="number" style={{ width: 90 }} value={truck.maxLoad ?? ''} onChange={e => setTruck({ ...truck, maxLoad: e.target.value ? +e.target.value : undefined })}/> kg</p>

        <h4>Import crates (Excel)</h4>
        <input type="file" accept=".xls,.xlsx" onChange={onFile} />
        {rows.length > 0 && (
          <div style={{ border: '1px solid #ccc', padding: 6, marginTop: 6 }}>
            {rows.map((r,i)=> (
              <p key={i}><input type="checkbox" checked={sel.has(i)} onChange={e=>{const s=new Set(sel); e.target.checked?s.add(i):s.delete(i); setSel(s);}}/> {r.label}</p>
            ))}
            <button disabled={sel.size===0 || capacityReached} onClick={()=>{sel.forEach(i=>addCrate(rows[i])); setRows([]); setSel(new Set());}}>Add selected</button>
          </div>
        )}

        <h3>Crates</h3>
        {crates.map(c => (
          <details key={c.id} style={{ marginBottom: 8 }}>
            <summary>{c.label} ({c.height}×{c.length}×{c.width}{c.heightUnit})</summary>
            {(['height','length','width'] as Dim[]).map(dim => {
              const uk = (dim+'Unit') as UnitKey;
              return <p key={dim}>{DIM[dim]} <input type="number" style={{ width: 60 }} value={c[dim]} onChange={e=>upd(c.id, { [dim]: +e.target.value } as Partial<Crate>)} /> <select value={c[uk]} onChange={e=>upd(c.id, { [uk]: e.target.value as Unit } as Partial<Crate>)}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></p>;
            })}
            <p>Wt <input type="number" style={{ width: 70 }} value={c.weight} onChange={e => upd(c.id, { weight: +e.target.value })}/> kg</p>
            {c.stackable && (
              <p>Stack on <select value={c.stackTargetId ?? ''} onChange={e => upd(c.id, { stackTargetId: e.target.value? +e.target.value : undefined })}>
                <option value="">floor</option>
                {crates.filter(b => b.id !== c.id && !b.stackTargetId && !crates.some(s => s.stackTargetId === b.id)).map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select></p>
            )}
            <button onClick={()=>del(c.id)}>🗑 Delete</button>
          </details>
        ))}
        <button disabled={capacityReached} onClick={()=>addCrate()}>+ Add crate</button>
      </aside>

      {/* 3‑D view */}
      <div style={{ flex: 1 }}>
        <Canvas shadows camera={{ position: [TL/2, TH, TW*2], fov: 50 }}>
          <ambientLight intensity={0.6} />
          <pointLight position={[0, TH, 0]} intensity={0.4} />

          {/* truck floor */}
          <mesh position={[TL/2, 0, TW/2]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
            <planeGeometry args={[TL, TW]} />
            <meshStandardMaterial color="#999" />
          </mesh>

          {/* crates */}
          {placed.map(p => (
            <mesh key={p.id} position={p.position} castShadow>
              <boxGeometry args={[toM(p.length,p.lengthUnit), toM(p.height,p.heightUnit), toM(p.width,p.widthUnit)]} />
              <meshStandardMaterial color={p.colour} transparent opacity={0.85} />
              <Edges />
            </mesh>
          ))}

          <OrbitControls target={[TL/2, TH/2, TW/2]} />
        </Canvas>
      </div>
    </div>
  );
}
