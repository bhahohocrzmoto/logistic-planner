/*  App.tsx  – fully rebuilt to fix truncated JSX & ESLint syntax error */
import React, { useState, useMemo, ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';

/* ───────────────────────── helpers ───────────────────────── */
type Unit = 'm' | 'cm';
const toMeters = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const randomColour = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

/* ───────────────────────── models ───────────────────────── */
interface Truck {
  length: number;
  width: number;
  height: number;
  unit: Unit;
  maxLoad?: number; // kg
}

// dimensions helpers
type DimAxis = 'height' | 'length' | 'width';
type DimUnitKey = `${DimAxis}Unit`;

interface CrateInput {
  id: number;
  label: string;
  length: number; lengthUnit: Unit;
  width: number;  widthUnit: Unit;
  height: number; heightUnit: Unit;
  weight: number;
  colour: string;
  stackable: boolean;
  stackTargetId?: number;
}
interface ParsedRow { label: string; length: number; width: number; height: number; weight: number; }
interface CratePlaced extends CrateInput { position: [number, number, number]; }

/* ─────────────────── naive packer ─────────────────── */
function packCrates(truck: Truck, crates: CrateInput[]): { placed: CratePlaced[]; overflowIds: number[] } {
  const placed: CratePlaced[] = [];
  const overflow: number[] = [];

  const baseQueue = [...crates.filter(c => !c.stackTargetId)].sort((a, b) => b.weight - a.weight);

  const truckLen = toMeters(truck.length, truck.unit);
  const truckWid = toMeters(truck.width, truck.unit);
  const truckHei = toMeters(truck.height, truck.unit);

  let cursorL = 0;
  let cursorR = 0;

  for (const crate of baseQueue) {
    const l = toMeters(crate.length, crate.lengthUnit);
    const w = toMeters(crate.width, crate.widthUnit);
    const h = toMeters(crate.height, crate.heightUnit);

    if (h > truckHei) { overflow.push(crate.id); continue; }

    const lane = cursorL <= cursorR ? 'L' : 'R';
    const xFront = lane === 'L' ? cursorL : cursorR;

    if (xFront + l > truckLen || w > truckWid) { overflow.push(crate.id); continue; }

    const zCentre = lane === 'L' ? w / 2 : truckWid - w / 2;
    placed.push({ ...crate, position: [xFront + l / 2, h / 2, zCentre] });
    lane === 'L' ? (cursorL += l) : (cursorR += l);
  }

  // stacked crates
  crates.filter(c => c.stackTargetId).forEach(c => {
    const base = placed.find(p => p.id === c.stackTargetId);
    if (!base) { overflow.push(c.id); return; }

    const h = toMeters(c.height, c.heightUnit);
    const baseH = toMeters(base.height, base.heightUnit);
    const y = base.position[1] + baseH / 2 + h / 2;

    if (y + h / 2 > truckHei) { overflow.push(c.id); return; }

    placed.push({ ...c, position: [base.position[0], y, base.position[2]] });
  });

  return { placed, overflowIds: overflow };
}

/* ═══════════════════════ COMPONENT ═══════════════════════ */
export default function App() {
  /* ─ state ─ */
  const [truck, setTruck] = useState<Truck>({ length: 10, width: 2.5, height: 2.6, unit: 'm', maxLoad: 1000 });
  const [crates, setCrates] = useState<CrateInput[]>([{
    id: 1, label: 'Crate 1', length: 1, lengthUnit: 'm', width: 1, widthUnit: 'm', height: 1, heightUnit: 'm', weight: 100, colour: randomColour(), stackable: false,
  }]);
  const [history, setHistory] = useState<CrateInput[][]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [rowSelection, setRowSelection] = useState<Set<number>>(new Set());

  /* ─ derived ─ */
  const { placed, overflowIds } = useMemo(() => packCrates(truck, crates), [truck, crates]);
  const totalWeight = useMemo(() => crates.reduce((s, c) => s + c.weight, 0), [crates]);
  const capacityReached = truck.maxLoad !== undefined && totalWeight >= truck.maxLoad;

  /* overlap detector */
  const overlaps = useMemo(() => {
    const list: [string, string][] = [];
    for (let i = 0; i < placed.length - 1; i++) {
      const a = placed[i];
      const dimsA = {
        xMin: a.position[0] - toMeters(a.length, a.lengthUnit) / 2,
        xMax: a.position[0] + toMeters(a.length, a.lengthUnit) / 2,
        yMin: a.position[1] - toMeters(a.height, a.heightUnit) / 2,
        yMax: a.position[1] + toMeters(a.height, a.heightUnit) / 2,
        zMin: a.position[2] - toMeters(a.width, a.widthUnit) / 2,
        zMax: a.position[2] + toMeters(a.width, a.widthUnit) / 2,
      };
      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j];
        if (a.id === b.stackTargetId || b.id === a.stackTargetId) continue;
        const dimsB = {
          xMin: b.position[0] - toMeters(b.length, b.lengthUnit) / 2,
          xMax: b.position[0] + toMeters(b.length, b.lengthUnit) / 2,
          yMin: b.position[1] - toMeters(b.height, b.heightUnit) / 2,
          yMax: b.position[1] + toMeters(b.height, b.heightUnit) / 2,
          zMin: b.position[2] - toMeters(b.width, b.widthUnit) / 2,
          zMax: b.position[2] + toMeters(b.width, b.widthUnit) / 2,
        };
        const overlap = dimsA.xMin < dimsB.xMax && dimsA.xMax > dimsB.xMin &&
                        dimsA.yMin < dimsB.yMax && dimsA.yMax > dimsB.yMin &&
                        dimsA.zMin < dimsB.zMax && dimsA.zMax > dimsB.zMin;
        if (overlap) list.push([a.label, b.label]);
      }
    }
    return list;
  }, [placed]);

  /* ─ helpers ─ */
  const updTruck = <K extends keyof Truck>(k: K, v: Truck[K]) => setTruck(p => ({ ...p, [k]: v }));
  const updCrate = (id: number, patch: Partial<CrateInput>) => setCrates(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const snapshot = () => setHistory([JSON.parse(JSON.stringify(crates))]);
  const undo = () => history.length && (setCrates(history[0]), setHistory([]));
  const deleteCrate = (id: number) => { snapshot(); setCrates(prev => prev.filter(c => c.id !== id && c.stackTargetId !== id)); };

  const addCrateFromData = (data: ParsedRow) => setCrates(prev => ([
    ...prev,
    {
      id: prev.length ? Math.max(...prev.map(c => c.id)) + 1 : 1,
      label: data.label,
      length: data.length, lengthUnit: 'm',
      width: data.width,  widthUnit: 'm',
      height: data.height, heightUnit: 'm',
      weight: data.weight,
      colour: randomColour(),
      stackable: false,
    },
  ]));

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = evt => {
      const wb = XLSX.read(evt.target!.result as ArrayBuffer);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];
      const rows: ParsedRow[] = [];
      json.forEach((row, idx) => {
        const label = row.Label || row.label;
        const length = Number(row.length || row.Length);
        const width = Number(row.width || row.Width);
        const height = Number(row.height || row.Height);
        const weight = Number(row.weight || row.Weight);
        if (label && length && width && height && weight) rows.push({ label, length, width, height, weight });
        else console.warn(`Row ${idx + 2} skipped`);
      });
      setParsedRows(rows); setRowSelection(new Set()); e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const addSelectedRows = () => {
    const addWeight = parsedRows.reduce((s, r, i) => rowSelection.has(i) ? s + r.weight : s, 0);
    if (truck.maxLoad !== undefined && totalWeight + addWeight > truck.maxLoad) {
      alert('Adding these crates would exceed the truck\'s max load.');
      return;
    }
    snapshot();
    parsedRows.forEach((row, i) => rowSelection.has(i) && addCrateFromData(row));
    setParsedRows([]); setRowSelection(new Set());
  };

  /* ─ UI constants ─ */
  const dims: DimAxis[] = ['height', 'length', 'width'];
  const dimLabels: Record<DimAxis, string> = { height: 'H', length: 'L', width: 'W' };

  /* ─ render ─ */
  const truckLen = toMeters(truck.length, truck.unit);
  const truckWid = toMeters(truck.width, truck.unit);
  const truckHei = toMeters(truck.height, truck.unit);
  const occupiedBaseIds = crates.filter(c => c.stackTargetId).map(c => c.stackTargetId!) as number[];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* banners */}
      {overflowIds.length > 0 && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '6px 12px', background: '#c62828', color: '#fff', fontWeight: 600, zIndex: 50, textAlign: 'center' }}>
          ⚠️ Truck capacity (volume) exceeded by {overflowIds.map(id => crates.find(c => c.id === id)!.label).join(', ')}
        </div>
      )}
      {capacityReached && (
        <div style={{ position: 'absolute', top: 32, left: 0, right
