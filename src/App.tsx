/*  App.tsx  – COMPLETE FILE, compilation‑safe (Render ESLint issue fixed) */
import React, { useState, useMemo, ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';

/* ───── helpers ───── */
type Unit = 'm' | 'cm';
const toMeters = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const randColor = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

/* ───── models ───── */
interface Truck { length: number; width: number; height: number; unit: Unit; maxLoad?: number; }

// dimension helpers
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

/* ───── packer (simple two‑lane) ───── */
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
    const w = toMeters(c.width,  c.widthUnit);
    const h = toMeters(c.height, c.heightUnit);
    if (h > H) { overflow.push(c.id); continue; }
    const lane = curL <= curR ? 'L' : 'R';
    const xFront = lane === 'L' ? curL : curR;
    if (xFront + l > L || w > W) { overflow.push(c.id); continue; }
    const z = lane === 'L' ? w / 2 : W - w / 2;
    placed.push({ ...c, position: [xFront + l / 2, h / 2, z] });
    lane === 'L' ? (curL += l) : (curR += l);
  }

  // stacked
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

/* ───── component ───── */
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

  // overlaps
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

  /* ───── JSX ───── */
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* global banners */}
      {overflowIds.length > 0 && (
        <Banner color="#c62828">Truck volume overflow: {overflowIds.map(id => crates.find(c => c.id === id)!.label).join(', ')}</Banner>
      )}
      {capacityReached && (
        <Banner color="#f57c00" top={32}>Max load reached ({totalWeight} / {truck.maxLoad} kg)</Banner>
      )}
      {overlaps.length > 0 && (
        <Banner color="#b71c1c" top={64}>Overlaps: {overlaps.map(p => `${p[0]} & ${p[1]}`).join('; ')}</Banner>
      )}

      {/* mouse cheat‑sheet */}
      <img src="/nav-help.png" alt="controls" style={{ position: 'absolute', right: 10, bottom: 10, width: 130, opacity: 0.9, pointerEvents: 'none' }} />

      {/* left panel */}
      <aside style={{ width: 380, padding: 16, overflowY: 'auto', borderRight: '1px solid #ddd' }}>
        {/* truck settings */}
        <h2>Truck</h2>
        {(['height', 'length', 'width'] as DimAxis[]).map(axis => (
          <p key={axis}>{DIM_LABEL[axis]}:{' '}
            <input type="number" style={{ width: 70 }} value={truck[axis]} onChange={e => updTruck(axis, Number(e.target.value))} /> {truck.unit}
          </p>
        ))}
        <p>Unit <select value={truck.unit} onChange={e => updTruck('unit', e.target.value as Unit)}>
          <option value="m">m</option><option value="cm">cm</option>
        </select></p>
        <p>Max load (kg){' '}<input type="number" style={{ width: 80 }} value={truck.maxLoad ?? ''} onChange={e => updTruck('maxLoad', e.target.value ? Number(e.target.value) : undefined)} /></p>

        {/* bulk import */}
        <h3 style={{ marginTop: 24 }}>Bulk import</h3>
        <input type="file" accept=".xls,.xlsx" onChange={handleFile} />
        {parsedRows.length > 0 && (
          <div style={{ border: '1px solid #ccc', padding: 8, marginTop: 8 }}>
            <strong>Select rows:</strong>
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead><tr><th></th><th>Label</th><th>H</th><th>L</th><th>W</th><th>Wt</th></tr></thead>
              <tbody>
                {parsedRows.map((r, i) => (
                  <tr key={i} style={{ opacity: truck.maxLoad !== undefined && totalWeight + r.weight > truck.maxLoad ? 0.4 : 1 }}>
                    <td><input type="checkbox" disabled={truck.maxLoad !== undefined && totalWeight + r.weight > truck.maxLoad} checked={rowSel.has(i)} onChange={e => { const set = new Set(rowSel); e.target.checked ? set.add(i) : set.delete(i); setRowSel(set); }} /></td>
                    <td>{r.label}</td><td>{r.height}</td><td>{r.length}</td><td>{r.width}</td><td>{r.weight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addSelectedRows} disabled={rowSel.size === 0 || capacityReached} style={{ marginTop: 6 }}>Add selected</button>
          </div>
        )}

        {/* crate list */}
        <h2 style={{ marginTop: 24 }}>Crates</h2>
        {crates.map(c => {
          const baseOptions = crates.filter(b => b.id !== c.id && !occupiedBaseIds.has(b.id) && !b.stackTargetId);
          return (
            <fieldset key={c.id} style={{ marginBottom: 16 }}>
              <legend>{c.label}</legend>
              <label>Label <input value={c.label} onChange={e => updCrate(c.id, { label: e.target.value })} /></label>
              {(['height', 'length', 'width'] as DimAxis[]).map(axis => {
                const unitKey = (axis + 'Unit') as DimUnitKey;
                return (
                  <p key={axis}>{DIM_LABEL[axis]}:{' '}
                    <input type="number" style={{ width: 60 }} value={c[axis]} onChange={e => updCrate(c.id, { [axis]: Number(e.target.value) } as any)} />{' '}
                    <select value={c[unitKey]} onChange={e => updCrate(c.id, { [unitKey]: e.target.value as Unit } as any)}>
                      <option value="m">m</option><option value="cm">cm</option>
                    </select>
                  </p>
                );
              })}
              <p>Weight <input type="number" style={{ width: 70 }} value={c.weight} onChange={e => updCrate(c.id, { weight: Number(e.target.value) })} /> kg</p>
              <p>Colour <input type="color" value={c.colour} onChange={e => updCrate(c.id, { colour: e.target.value })} /></p>
              <p>Stackable <input type="checkbox" checked={c.stackable} onChange={e => updCrate(c.id, { stackable: e.target.checked })} /></p>
              {c.stackable && (
                <p>On top of <select value={c.stackTargetId ?? ''} onChange={e => updCrate(c.id, { stackTargetId: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">—</option>
                  {baseOptions.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select></p>
              )}
              <button onClick={() => delCrate(c.id)} style={{ marginTop: 4 }}>🗑 Delete</button>
            </fieldset>
          );
        })}
        <button onClick={() => { if (!capacityReached) { snap(); addCrate(); } }} disabled={capacityReached}>+ Blank crate</button>
        <button onClick={undo} disabled={!history.length} style={{ marginLeft: 8 }}>Undo</button>
        <p style={{ fontSize: 12, color: '#666' }}>Scene updates instantly.</p>
      </aside>

      {/* 3‑D view */}
      <main style={{ flex: 1 }}>
        <Canvas shadows camera={{ position: [truckL, truckH * 1.3, truckW * 1.4] }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />

          {/* floor & side */}
          <mesh position={[0.025, truckH / 2, truckW / 2]} receiveShadow>
            <boxGeometry args={[0.05, truckH, truckW]} /><meshStandardMaterial color="#777" transparent opacity={0.35} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[truckL / 2, 0, truckW / 2]} receiveShadow>
            <planeGeometry args
