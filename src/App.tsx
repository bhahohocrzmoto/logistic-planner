/* App.tsx — compile‑ready React + R3F logistic planner with stack logic, overflow/overlap/max‑load guards */
import React, { useState, useMemo, ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';

// ─── helpers ──────────────────────────────────────────────────────────
type Unit = 'm' | 'cm';
const toM = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const rnd = () => `#${Math.random().toString(16).slice(2, 8).padStart(6, '0')}`;

type Dim = 'height' | 'length' | 'width';
const DIM_LABEL: Record<Dim, string> = { height: 'H', length: 'L', width: 'W' };
// explicit unit keys so TS understands cast
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
  stackTargetId?: number; // undefined ⇒ on floor
}
interface Parsed { label: string; length: number; width: number; height: number; weight: number; }
interface Placed extends Crate { position: [number, number, number]; }

// ─── banner component ─────────────────────────────────────────────────
const Banner: React.FC<{ color: string; top?: number }> = ({ color, top = 0, children }) => (
  <div style={{ position: 'absolute', top, left: 0, right: 0, padding: 6, background: color, color: '#fff', fontWeight: 600, textAlign: 'center', zIndex: 50 }}>{children}</div>
);

// ─── packer (simple queue + stacking) ─────────────────────────────────
function pack(truck: Truck, crates: Crate[]): { placed: Placed[]; overflow: number[] } {
  const placed: Placed[] = [], overflow: number[] = [];
  const L = toM(truck.length, truck.unit), W = toM(truck.width, truck.unit), H = toM(truck.height, truck.unit);
  let cursorX = 0;

  // 1) ground crates
  crates.filter(c => !c.stackTargetId).forEach(c => {
    const l = toM(c.length, c.lengthUnit), w = toM(c.width, c.widthUnit), h = toM(c.height, c.heightUnit);
    if (cursorX + l > L || w > W || h > H) { overflow.push(c.id); return; }
    placed.push({ ...c, position: [cursorX + l / 2, h / 2, w / 2] });
    cursorX += l;
  });

  // 2) stacked crates
  crates.filter(c => c.stackTargetId).forEach(c => {
    const base = placed.find(p => p.id === c.stackTargetId);
    if (!base) { overflow.push(c.id); return; }
    const h = toM(c.height, c.heightUnit);
    const y = base.position[1] + toM(base.height, base.heightUnit) / 2 + h / 2;
    if (y + h / 2 > H) { overflow.push(c.id); return; }
    placed.push({ ...c, position: [base.position[0], y, base.position[2]] });
  });

  return { placed, overflow };
}

// ─── component ────────────────────────────────────────────────────────
export default function App() {
  // state
  const [truck, setTruck] = useState<Truck>({ length: 10, width: 2.5, height: 2.6, unit: 'm', maxLoad: 1000 });
  const [crates, setCrates] = useState<Crate[]>([{
    id: 1, label: 'Crate 1', length: 1, lengthUnit: 'm', width: 1, widthUnit: 'm', height: 1, heightUnit: 'm', weight: 100, colour: rnd(), stackable: false,
  }]);
  const [rows, setRows] = useState<Parsed[]>([]);
  const [rowSel, setRowSel] = useState<Set<number>>(new Set());

  // derived
  const { placed, overflow } = useMemo(() => pack(truck, crates), [truck, crates]);
  const totalWeight = useMemo(() => crates.reduce((s, c) => s + c.weight, 0), [crates]);
  const capacityReached = truck.maxLoad !== undefined && totalWeight >= truck.maxLoad;

  const overlaps = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < placed.length - 1; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        if (a.id === b.stackTargetId || b.id === a.stackTargetId) continue;
        const ax = toM(a.length, a.lengthUnit) / 2, ay = toM(a.height, a.heightUnit) / 2, az = toM(a.width, a.widthUnit) / 2;
        const bx = toM(b.length, b.lengthUnit) / 2, by = toM(b.height, b.heightUnit) / 2, bz = toM(b.width, b.widthUnit) / 2;
        if (Math.abs(a.position[0] - b.position[0]) < ax + bx && Math.abs(a.position[1] - b.position[1]) < ay + by && Math.abs(a.position[2] - b.position[2]) < az + bz)
          list.push(`${a.label} & ${b.label}`);
      }
    }
    return list;
  }, [placed]);

  // helpers
  const addCrate = (row?: Parsed) => setCrates(prev => [...prev, {
    id: prev.length ? Math.max(...prev.map(c => c.id)) + 1 : 1,
    label: row?.label ?? `Crate ${prev.length + 1}`,
    length: row?.length ?? 1, lengthUnit: 'm',
    width:  row?.width  ?? 1, widthUnit: 'm',
    height: row?.height ?? 1, heightUnit: 'm',
    weight: row?.weight ?? 50,
    colour: rnd(),
    stackable: false,
  }]);

  const upd = (id: number, patch: Partial<Crate>) => setCrates(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  const del = (id: number) => setCrates(prev => prev.filter(c => c.id !== id && c.stackTargetId !== id));

  // import
  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const rd = new FileReader();
    rd.onload = ev => {
      const wb = XLSX.read(ev.target!.result as ArrayBuffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const js = XLSX.utils.sheet_to_json<Parsed>(ws, { defval: '' });
      setRows(js); setRowSel(new Set());
    };
    rd.readAsArrayBuffer(e.target.files[0]);
  };

  const TL = toM(truck.length, truck.unit), TW = toM(truck.width, truck.unit), TH = toM(truck.height, truck.unit);
  const occupiedBases = new Set(crates.filter(c => c.stackTargetId).map(c => c.stackTargetId!));

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* warnings */}
      {overflow.length > 0 && <Banner color="#c62828">Overflow: {overflow.map(id => crates.find(c => c.id === id)!.label).join(', ')}</Banner>}
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

        {/* import section */}
        <h4>Import</h4>
        <input type="file" accept=".xls,.xlsx" onChange={handleFile} />
        {rows.length > 0 && (
          <div style={{ border: '1px solid #ccc', padding: 6, marginTop: 6 }}>
            {rows.map((r, i) => (
              <p key={i}><input type="checkbox" checked={rowSel.has(i)} onChange={e => { const s=new Set(rowSel); e.target.checked?s.add(i):s.delete(i); setRowSel(s); }} /> {r.label}</p>
            ))}
            <button disabled={rowSel.size===0 || capacityReached} onClick={() => { rowSel.forEach(i => addCrate(rows[i])); setRows([]); setRowSel(new Set()); }}>Add selected</button>
          </div>
        )}

        <h3>Crates</h3>
        {crates.map(c => (
          <details key={c.id} style={{ marginBottom: 6 }}>
            <summary>{c.label}</summary>
            {(['height','length','width'] as Dim[]).map(dim => {
              const uk = (dim + 'Unit') as UnitKey;
              return (<p key={dim}>{DIM_LABEL[dim]} <input type="number" style={{ width: 60 }} value={c[dim]} onChange={e => upd(c.id, { [dim]: +e.target.value } as any)} /> <select value={c[uk]} onChange={e => upd(c.id, { [uk]: e.target.value as Unit } as any)}><option value="m">m</option><option value="cm">cm</option></select></p>);
            })}
            <p>Weight <input type="number" style={{ width: 70 }} value={c.weight} onChange={e => upd(c.id, { weight: +e.target.value })} /> kg</p>
            <p>Stackable <input type="checkbox" checked={c.stackable} onChange={e => upd(c.id, { stackable: e.target.checked, stackTargetId: e.target.checked ? c.stackTargetId : undefined })} /></p>
            {c.stackable && (
              <p>Stack on
                <select value={c.stackTargetId ?? ''} onChange={e => upd(c.id, { stackTargetId: e.target.value ? +e.target.value : undefined })}>
                  <option value="">floor</option>
                  {crates.filter(b => b.id !== c.id && !occupiedBases.has(b.id) && !b.stackTargetId).map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </p>)
            }
            <button onClick={() => del(c.id)}>🗑 Delete</button>
          </details>
        ))}
        <button disabled={capacityReached} onClick={() => addCrate()}>+ Crate</button>
      </aside>

      {/* 3‑D view */}
      <Canvas shadows style={{ flex: 1 }} camera={{ position: [TL, TH * 1.2, TW * 1.4] }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />
        {/* floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[TL / 2, 0, TW / 2]} receiveShadow>
          <planeGeometry args={[TL, TW]} />
          <meshStandardMaterial color="#ddd" />
        </mesh>
        {/* crates */}
        {placed.map(c => { const l=toM(c.length,c.lengthUnit),w=toM(c.width,c.widthUnit),h=toM(c.height,c.heightUnit); return (
          <group key={c.id} position={c.position}>
            <mesh castShadow>
              <boxGeometry args={[l, h, w]} />
              <meshStandardMaterial color={c.colour} />
              <Edges />
            </mesh>
            <Text rotation={[-Math.PI / 2, 0, 0]} position={[0, h / 2 + 0.02, 0]} fontSize={Math.min(l, w) * 0.18}>{c.label}</Text>
          </group>);
        })}
        <OrbitControls />
      </Canvas>
    </div>
  );
}
