/* App.tsx — React + @react-three/fiber logistic‑planner
   Restored layout logic & fixed repeated truncation‑errors.
   ─────────────────────────────────────────────────────────────
   • Heavy‑first, left/right alternating floor placement ⇒ axle balance
   • Stacked crates honoured (stackTargetId)
   • Grey vertical panel marks truck FRONT (at x = 0)
   • Per‑crate colour‑picker & opacity slider
   • Safety banners: overflow, max‑load, overlaps
----------------------------------------------------------------*/

import React, { useState, useMemo, ChangeEvent, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';
import * as XLSX from 'xlsx';

// ─── helpers ──────────────────────────────────────────────────────────
type Unit = 'm' | 'cm';
const toM = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const rand = () => `#${Math.floor(Math.random() * 0xffffff)
  .toString(16)
  .padStart(6, '0')}`;

type Dim = 'height' | 'length' | 'width';
const DIM: Record<Dim, string> = { height: 'H', length: 'L', width: 'W' };
const UNITS: Unit[] = ['m', 'cm'];

// ─── data models ──────────────────────────────────────────────────────
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
  opacity: number;
  stackable: boolean;
  stackTargetId?: number; // undefined ⇒ floor
}
interface ParsedRow {
  label: string;
  length: number;
  width: number;
  height: number;
  weight: number;
}
interface Placed extends Crate {
  position: [number, number, number];
}

// ─── UI helpers ───────────────────────────────────────────────────────
const Banner: React.FC<{ color: string; top?: number; children: ReactNode }> = ({ color, top = 0, children }) => (
  <div
    style={{
      position: 'absolute',
      top,
      left: 0,
      right: 0,
      padding: 6,
      background: color,
      color: '#fff',
      fontWeight: 600,
      textAlign: 'center',
      zIndex: 50,
    }}
  >
    {children}
  </div>
);

// ─── balanced packing algorithm ───────────────────────────────────────
function pack(truck: Truck, crates: Crate[]): { placed: Placed[]; overflow: number[] } {
  const placed: Placed[] = [], overflow: number[] = [];
  const L = toM(truck.length, truck.unit),
    W = toM(truck.width, truck.unit),
    H = toM(truck.height, truck.unit);

  // sort heavy‑to‑light (front‑first) + floor‑only
  const floor = crates.filter(c => !c.stackTargetId).sort((a, b) => b.weight - a.weight);
  let cursorX = 0;
  let leftSide = true;
  let pendingLeftLen = 0;

  floor.forEach(c => {
    const l = toM(c.length, c.lengthUnit),
      w = toM(c.width, c.widthUnit),
      h = toM(c.height, c.heightUnit);

    if (l > L || w > W || h > H) {
      overflow.push(c.id);
      return;
    }

    const zPos = leftSide ? w / 2 : W - w / 2;
    const xPos = cursorX + l / 2;

    if (xPos + l / 2 > L) {
      overflow.push(c.id);
      return;
    }

    placed.push({ ...c, position: [xPos, h / 2, zPos] });

    if (leftSide) {
      pendingLeftLen = Math.max(pendingLeftLen, l);
    } else {
      cursorX += Math.max(pendingLeftLen, l);
      pendingLeftLen = 0;
    }
    leftSide = !leftSide;
  });
  if (!leftSide) cursorX += pendingLeftLen; // odd‑count alignment

  // stacks -------------------------------------------------------------
  crates.filter(c => c.stackTargetId).forEach(c => {
    const base = placed.find(p => p.id === c.stackTargetId);
    if (!base) {
      overflow.push(c.id);
      return;
    }
    const h = toM(c.height, c.heightUnit);
    const newY = base.position[1] + toM(base.height, base.heightUnit) / 2 + h / 2;
    if (newY + h / 2 > H) {
      overflow.push(c.id);
      return;
    }
    placed.push({ ...c, position: [base.position[0], newY, base.position[2]] });
  });

  return { placed, overflow };
}

// ─── 3D sub‑components ────────────────────────────────────────────────
const CrateMesh: React.FC<{ p: Placed }> = ({ p }) => {
  const l = toM(p.length, p.lengthUnit),
    w = toM(p.width, p.widthUnit),
    h = toM(p.height, p.heightUnit);
  return (
    <mesh position={p.position}>
      <boxGeometry args={[l, h, w]} />
      <meshStandardMaterial color={p.colour} transparent opacity={p.opacity} />
      <Edges scale={1} />
    </mesh>
  );
};

// ─── main component ───────────────────────────────────────────────────
export default function App() {
  // state --------------------------------------------------------------
  const [truck, setTruck] = useState<Truck>({ length: 10, width: 2.5, height: 2.6, unit: 'm', maxLoad: 1000 });
  const [crates, setCrates] = useState<Crate[]>([
    {
      id: 1,
      label: 'Crate 1',
      length: 1,
      lengthUnit: 'm',
      width: 1,
      widthUnit: 'm',
      height: 1,
      heightUnit: 'm',
      weight: 200,
      colour: rand(),
      opacity: 0.85,
      stackable: true,
    },
  ]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [selImport, setSelImport] = useState<Set<number>>(new Set());

  // derived ------------------------------------------------------------
  const { placed, overflow } = useMemo(() => pack(truck, crates), [truck, crates]);
  const totalWeight = useMemo(() => crates.reduce((s, c) => s + c.weight, 0), [crates]);
  const capacityReached = truck.maxLoad !== undefined && totalWeight >= truck.maxLoad;
  const overlaps = useMemo(() => {
    const o: string[] = [];
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i],
          b = placed[j];
        if (a.id === b.stackTargetId || b.id === a.stackTargetId) continue;
        const ax = toM(a.length, a.lengthUnit) / 2,
          ay = toM(a.height, a.heightUnit) / 2,
          az = toM(a.width, a.widthUnit) / 2;
        const bx = toM(b.length, b.lengthUnit) / 2,
          by = toM(b.height, b.heightUnit) / 2,
          bz = toM(b.width, b.widthUnit) / 2;
        if (
          Math.abs(a.position[0] - b.position[0]) < ax + bx &&
          Math.abs(a.position[1] - b.position[1]) < ay + by &&
          Math.abs(a.position[2] - b.position[2]) < az + bz
        )
          o.push(`${a.label} & ${b.label}`);
      }
    return o;
  }, [placed]);

  // actions ------------------------------------------------------------
  const addCrate = (row?: ParsedRow) =>
    setCrates(list => [
      ...list,
      {
        id: list.length ? Math.max(...list.map(c => c.id)) + 1 : 1,
        label: row?.label || `Crate ${list.length + 1}`,
        length: row?.length || 1,
        lengthUnit: 'm',
        width: row?.width || 1,
        widthUnit: 'm',
        height: row?.height || 1,
        heightUnit: 'm',
        weight: row?.weight || 50,
        colour: rand(),
        opacity: 0.85,
        stackable: true,
      },
    ]);

  const upd = (id: number, patch: Partial<Crate>) =>
    setCrates(list => list.map(c => (c.id === id ? { ...c, ...patch } : c)));

  const del = (id: number) =>
    setCrates(list => list.filter(c => c.id !== id && c.stackTargetId !== id));

  // Excel import -------------------------------------------------------
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const wb = XLSX.read(ev.target!.result as ArrayBuffer);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const js = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: '' });
      setRows(js);
      setSelImport(new Set());
    };
    reader.readAsArrayBuffer(e.target.files[0]);
  };

  // geometry constants -------------------------------------------------
  const TL = toM(truck.length, truck.unit);
  const TW = toM(truck.width, truck.unit);
  const TH = toM(truck.height, truck.unit);

  // render -------------------------------------------------------------
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', fontSize: 14 }}>
      {/* ───────── BANNERS */}
      {overflow.length > 0 && (
        <Banner color="#d32f2f">Overflow: {overflow.map(id => crates.find(c => c.id === id)!.label).join(', ')}</Banner>
      )}
      {capacityReached && (
        <Banner color="#f57c00" top={32}>
          Max load {totalWeight}/{truck.maxLoad} kg
        </Banner>
      )}
      {overlaps.length > 0 && (
        <Banner color="#b71c1c" top={64}>
          Overlap: {overlaps.join('; ')}
        </Banner>
      )}

      {/* ───────── SIDEBAR */}
      <aside style={{ width: 300, padding: 12, overflowY: 'auto', borderRight: '1px solid #ddd' }}>
        <h3>Truck</h3>
        {(['height', 'length', 'width'] as Dim[]).map(dim => (
          <p key={dim} style={{ margin: 4 }}>
            {DIM[dim]}{' '}
            <input
              type="number"
              style={{ width: 70 }}
              value={(truck as any)[dim]}
              onChange={e => setTruck({ ...truck, [dim]: +e.target.value } as Truck)}
            />{' '}
            {truck.unit}
          </p>
        ))}
        <p style={{ margin: 4 }}>
          Unit{' '}
          <select value={truck.unit} onChange={e => setTruck({ ...truck, unit: e.target.value as Unit })}>
            {UNITS.map(u => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </p>
        <p style={{ margin: 4 }}>
          Max load{' '}
          <input
            type="number"
            style={{ width: 100 }}
            value={truck.maxLoad ?? ''}
            onChange={e => setTruck({ ...truck, maxLoad: e.target.value ? +e.target.value : undefined })}
          />{' '}
          kg
        </p>

        <h4>Import crates (Excel)</h4>
        <input type="file" accept=".xls,.xlsx" onChange={onFile} />
        {rows.length > 0 && (
          <div style={{ border: '1px solid #ccc', padding: 6, marginTop: 6 }}>
            {rows.map((r, i) => (
              <p key={i} style={{ margin: 2 }}>
                <input
                  type="checkbox"
                  checked={selImport.has(i)}
                  onChange={e => {
                    const s = new Set(selImport);
                    e.target.checked ? s.add(i) : s.delete(i);
                    setSelImport(s);
                  }}
                />{' '}
                {r.label}
              </p>
            ))}
            <button
              disabled={selImport.size === 0 || capacityReached}
              onClick={() => {
                selImport.forEach(i => addCrate(rows[i]));
                setRows([]);
                setSelImport(new Set());
              }}
            >
              Add selected
            </button>
          </div>
        )}

        <h3>Crates</h3>
        {crates.map(c => (
          <details key={c.id} style={{ marginBottom: 6 }}>
            <summary>
              {c.label} ({c.length}×{c.width}×{c.height}{c.lengthUnit})
            </summary>
            {(['height', 'length', 'width'] as Dim[]).map(dim => (
              <p key={dim} style={{ margin: 2 }}>
                {DIM[dim]}{' '}
                <input
                  type="number"
                  style={{ width: 60 }}
                  value={(c as any)[dim]}
                  onChange={e => upd(c.id, { [dim]: +e.target.value } as any)}
                />{' '}
                <select
                  value={(c as any)[`${dim}Unit`] as Unit}
                  onChange={e => upd(c.id, { [`${dim}Unit`]: e.target.value } as any)}
                >
                  {UNITS.map(u => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </p>
            ))}
            <p style={{ margin: 2 }}>
              Wt{' '}
              <input
                type="number"
                style={{ width: 70 }}
                value={c.weight}
                onChange={e => upd(c.id, { weight: +e.target.value })}
              />{' '}
              kg
            </p>
            <p style={{ margin: 2 }}>
              Colour <input type="color" value={c.colour} onChange={e => upd(c.id, { colour: e.target.value })} />
              &nbsp;Opacity{' '}
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={c.opacity}
                onChange={e => upd(c.id, { opacity: +e.target.value })}
              />
            </p>
            <p style={{ margin: 2 }}>
              Stack on{' '}
              <select
                value={c.stackTargetId ?? 'floor'}
                onChange={e => upd(c.id, { stackTargetId: e.target.value === 'floor' ? undefined : +e.target.value })}
              >
                <option value="floor">floor</option>
                {crates
                  .filter(cc => cc.stackable && cc.id !== c.id)
                  .map(cc => (
                    <option key={cc.id} value={cc.id}>
                      {cc.label}
                    </option>
                  ))}
              </select>
            </p>
            <button onClick={() => del(c.id)}>🗑 Delete</button>
          </details>
        ))}
        <button disabled={capacityReached} onClick={() => addCrate()}>+ Add crate</button>
      </aside>

      {/* ───────── 3D VIEW */}
      <Canvas shadows camera={{ position: [TL * 0.7, TH * 1.5, TL * 1.2], fov: 50 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 10, 2]} castShadow intensity={0.6} />

        {/* floor */}
        <mesh receiveShadow position={[TL / 2, 0, TW / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[TL, TW]} />
          <meshStandardMaterial color="#111" />
        </mesh>

        {/* front panel */}
        <mesh position={[0, TH / 2, TW / 2]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[TH, TW]} />
          <meshStandardMaterial color="#555" side={2} transparent opacity={0.8} />
        </mesh>

        {placed.map(p => (
          <CrateMesh key={p.id} p={p} />
        ))}

        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
