/*  App.tsx  - UPDATED WITH LOAD‑CAPACITY, DELETE, H×L×W DISPLAY & OVERLAP CHECKS */
import React, { useState, useMemo, ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';

/* ---------- helpers ---------- */
type Unit = 'm' | 'cm';
const toMeters = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const randomColour = () =>
  '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

/* ---------- data models ---------- */
interface Truck {
  length: number;
  width: number;
  height: number;
  unit: Unit;
  /** Maximum load capacity in kg (optional). */
  maxLoad?: number;
}
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
interface ParsedRow {
  label: string;
  length: number;
  width: number;
  height: number;
  weight: number;
}
interface CratePlaced extends CrateInput { position: [number, number, number]; }

/* ---------- dual‑lane packer ---------- */
function packCrates(
  truck: Truck,
  crates: CrateInput[]
): { placed: CratePlaced[]; overflowIds: number[] } {
  const placed: CratePlaced[] = [];
  const overflow: number[] = [];

  const baseQueue = [...crates.filter(c => !c.stackTargetId)].sort(
    (a, b) => b.weight - a.weight
  );

  const truckLen = toMeters(truck.length, truck.unit);
  const truckWid = toMeters(truck.width, truck.unit);
  const truckHei = toMeters(truck.height, truck.unit);

  let cursorL = 0;
  let cursorR = 0;

  for (const crate of baseQueue) {
    const l = toMeters(crate.length, crate.lengthUnit);
    const w = toMeters(crate.width, crate.widthUnit);
    const h = toMeters(crate.height, crate.heightUnit);

    if (h > truckHei) {
      overflow.push(crate.id);
      continue;
    }

    const lane = cursorL <= cursorR ? 'L' : 'R';
    const xFront = lane === 'L' ? cursorL : cursorR;

    if (xFront + l > truckLen || w > truckWid) {
      overflow.push(crate.id);
      continue;
    }

    const zCentre = lane === 'L' ? w / 2 : truckWid - w / 2;

    placed.push({
      ...crate,
      position: [xFront + l / 2, h / 2, zCentre]
    });

    lane === 'L' ? (cursorL += l) : (cursorR += l);
  }

  /* ---------- stacked crates ---------- */
  crates
    .filter(c => c.stackTargetId)
    .forEach(c => {
      const base = placed.find(p => p.id === c.stackTargetId);
      if (!base) {
        overflow.push(c.id);
        return;
      }

      const h = toMeters(c.height, c.heightUnit);
      const baseH = toMeters(base.height, base.heightUnit);
      const y = base.position[1] + baseH / 2 + h / 2;

      if (y + h / 2 > truckHei) {
        overflow.push(c.id);
        return;
      }

      placed.push({
        ...c,
        position: [base.position[0], y, base.position[2]]
      });
    });

  return { placed, overflowIds: overflow };
}

/* ======================================================================= */
export default function App() {
  /* ---------------- state -------------------------------------------- */
  const [truck, setTruck] = useState<Truck>({
    length: 10,
    width: 2.5,
    height: 2.6,
    unit: 'm',
    maxLoad: 1000 // kg
  });

  const [crates, setCrates] = useState<CrateInput[]>([{
    id: 1, label: 'Crate 1', length: 1, lengthUnit: 'm',
    width: 1,  widthUnit: 'm', height: 1, heightUnit: 'm',
    weight: 100, colour: randomColour(), stackable: false,
  }]);

  /* one‑step undo */
  const [history, setHistory] = useState<CrateInput[][]>([]);

  /* rows parsed from an uploaded sheet */
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [rowSelection, setRowSelection] = useState<Set<number>>(new Set());

  /* ---------------- derived layout & helpers ------------------------- */
  const { placed, overflowIds } = useMemo(() => packCrates(truck, crates), [truck, crates]);

  const totalWeight = useMemo(() => crates.reduce((s, c) => s + c.weight, 0), [crates]);
  const capacityReached = useMemo(() => (
    truck.maxLoad !== undefined && totalWeight >= truck.maxLoad
  ), [truck.maxLoad, totalWeight]);

  /* overlap detection (ignore crate with its base when stacked) */
  const overlaps = useMemo(() => {
    const list: [string, string][] = [];
    for (let i = 0; i < placed.length - 1; i++) {
      const a = placed[i];
      const dimsA = {
        xMin: a.position[0] - toMeters(a.length, a.lengthUnit) / 2,
        xMax: a.position[0] + toMeters(a.length, a.lengthUnit) / 2,
        yMin: a.position[1] - toMeters(a.height, a.heightUnit) / 2,
        yMax: a.position[1] + toMeters(a.height, a.heightUnit) / 2,
        zMin: a.position[2] - toMeters(a.width,  a.widthUnit)  / 2,
        zMax: a.position[2] + toMeters(a.width,  a.widthUnit)  / 2,
      };
      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j];
        if (a.id === b.stackTargetId || b.id === a.stackTargetId) continue; // stacked pair
        const dimsB = {
          xMin: b.position[0] - toMeters(b.length, b.lengthUnit) / 2,
          xMax: b.position[0] + toMeters(b.length, b.lengthUnit) / 2,
          yMin: b.position[1] - toMeters(b.height, b.heightUnit) / 2,
          yMax: b.position[1] + toMeters(b.height, b.heightUnit) / 2,
          zMin: b.position[2] - toMeters(b.width,  b.widthUnit)  / 2,
          zMax: b.position[2] + toMeters(b.width,  b.widthUnit)  / 2,
        };
        const xOverlap = dimsA.xMin < dimsB.xMax && dimsA.xMax > dimsB.xMin;
        const yOverlap = dimsA.yMin < dimsB.yMax && dimsA.yMax > dimsB.yMin;
        const zOverlap = dimsA.zMin < dimsB.zMax && dimsA.zMax > dimsB.zMin;
        if (xOverlap && yOverlap && zOverlap) {
          list.push([a.label, b.label]);
        }
      }
    }
    return list;
  }, [placed]);

  const updTruck = (k: keyof Truck, v: any) => setTruck(p => ({ ...p, [k]: v }));
  const updCrate = (id: number, patch: Partial<CrateInput>) =>
    setCrates(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));

  const snapshot = () => setHistory([JSON.parse(JSON.stringify(crates))]);
  const addCrateFromData = (data: ParsedRow) => {
    setCrates(prev => [
      ...prev,
      {
        id: prev.length ? Math.max(...prev.map(c => c.id)) + 1 : 1,
        label: data.label,
        length: data.length, lengthUnit: 'm',
        width:  data.width,  widthUnit: 'm',
        height: data.height, heightUnit: 'm',
        weight: data.weight,
        colour: randomColour(),
        stackable: false,
      },
    ]);
  };
  const undo = () => history.length && (setCrates(history[0]), setHistory([]));

  const deleteCrate = (id: number) => {
    snapshot();
    setCrates(prev => prev.filter(c => c.id !== id && c.stackTargetId !== id));
  };

  /* ---------- XLSX upload handler ---------- */
  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = evt => {
      const wb = XLSX.read(evt.target!.result as ArrayBuffer);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const rows: ParsedRow[] = [];
      json.forEach((row, idx) => {
        const label  = row.Label  || row.label;
        const length = Number(row.length || row.Length);
        const width  = Number(row.width  || row.Width);
        const height = Number(row.height || row.Height);
        const weight = Number(row.weight || row.Weight);
        if (label && length && width && height && weight) {
          rows.push({ label, length, width, height, weight });
        } else {
          console.warn(`Row ${idx + 2} skipped (missing field)`);
        }
      });
      setParsedRows(rows);
      setRowSelection(new Set());   // reset selection
      e.target.value = '';          // allow re‑upload same file if needed
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
    setParsedRows([]);
    setRowSelection(new Set());
  };

  /* ---------------- render ------------------------------------------ */
  const truckLen = toMeters(truck.length, truck.unit);
  const truckWid = toMeters(truck.width,  truck.unit);
  const truckHei = toMeters(truck.height, truck.unit);
  const occupiedBaseIds = crates.filter(c => c.stackTargetId).map(c => c.stackTargetId!) as number[];

  const dimLabels: Record<'height' | 'length' | 'width', string> = { height: 'H', length: 'L', width: 'W' };
  const dimOrder: (keyof CrateInput)[] = ['height', 'length', 'width'];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ========= warnings ========= */}
      {overflowIds.length > 0 && (
        <div style={{ position:'absolute',top:0,left:0,right:0,padding:'6px 12px',
          background:'#c62828',color:'#fff',fontWeight:600,zIndex:50,textAlign:'center'}}>
          ⚠️ Truck capacity (volume) exceeded by&nbsp;
          {overflowIds.map(id => crates.find(c => c.id === id)!.label).join(', ')}
        </div>
      )}
      {capacityReached && (
        <div style={{ position:'absolute',top:32,left:0,right:0,padding:'6px 12px',
          background:'#f57c00',color:'#fff',fontWeight:600,zIndex:50,textAlign:'center'}}>
          ⚠️ Max load reached ({totalWeight} kg / {truck.maxLoad} kg)
        </div>
      )}
      {overlaps.length > 0 && (
        <div style={{ position:'absolute',top:64,left:0,right:0,padding:'6px 12px',
          background:'#b71c1c',color:'#fff',fontWeight:600,zIndex:50,textAlign:'center'}}>
          ⚠️ Overlapping crates detected: {overlaps.map(p => `${p[0]} & ${p[1]}`).join('; ')}
        </div>
      )}

      <img src="/nav-help.png" alt="Mouse controls"
           style={{ position:'absolute',right:10,bottom:10,width:130,opacity:.9,pointerEvents:'none',zIndex:40}}/>

      {/* ========= left column ========= */}
      <div style={{ width: 380, padding: 16, overflowY: 'auto', borderRight: '1px solid #ddd' }}>
        {/* ---- truck inputs ---- */}
        <h2>Truck</h2>
        {(['height','length','width'] as const).map(d => (
          <p key={d}>{dimLabels[d]}:{' '}
            <input type="number" style={{width:70}} value={truck[d]} onChange={e=>updTruck(d,Number(e.target.value))}/> {truck.unit}
          </p>
        ))}
        <p>Unit <select value={truck.unit} onChange={e=>updTruck('unit',e.target.value as Unit)}>
          <option value="m">m</option><option value="cm">cm</option>
        </select></p>
        <p>Max load (kg):{' '}
          <input type="number" style={{width:80}} value={truck.maxLoad ?? ''}
                 onChange={e=>updTruck('maxLoad', e.target.value ? Number(e.target.value) : undefined)}/>
        </p>

        {/* ---- Upload & template ---------- */}
        <h3 style={{marginTop:24}}>Bulk import</h3>
        <input type="file" accept=".xls,.xlsx" onChange={handleFile} />
        <p style={{fontSize:12,color:'#666',margin:'4px 0'}}>
          Template: <a href="/Template.xlsx" download>download</a>
        </p>

        {/* ---- preview table ---------- */}
        {parsedRows.length > 0 && (
          <div style={{ border:'1px solid #ccc', padding:8, margin:'8px 0' }}>
            <strong>Select rows to add:</strong>
            <table style={{ width:'100%', fontSize:12 }}>
              <thead><tr><th></th><th>Label</th><th>H</th><th>L</th><th>W</th><th>Wt</th></tr></thead>
              <tbody>
              {parsedRows.map((r,i)=>(
                <tr key={i} style={{opacity: (truck.maxLoad!==undefined && totalWeight + r.weight > truck.maxLoad) ? .4 : 1}}>
                  <td><input type="checkbox"
                        disabled={truck.maxLoad!==undefined && totalWeight + r.weight > truck.maxLoad}
                        checked={rowSelection.has(i)}
                        onChange={e=>{
                          const s=new Set(rowSelection);
                          e.target.checked? s.add(i): s.delete(i);
                          setRowSelection(s);
                        }}/></td>
                  <td>{r.label}</td><td>{r.height}</td><td>{r.length}</td><td>{r.width}</td><td>{r.weight}</td>
                </tr>
              ))}
              </tbody>
            </table>
            <button
              onClick={addSelectedRows}
              disabled={rowSelection.size===0 || capacityReached}
              style={{ marginTop:6 }}
            >
              Add selected rows to plan
            </button>
          </div>
        )}

        {/* ---- existing crate list ---- */}
        <h2 style={{ marginTop: 24 }}>Crates</h2>
        {crates.map(c=>{
          const availableBases = crates.filter(
            b=>b.id!==c.id && !occupiedBaseIds.includes(b.id) && !b.stackTargetId
          );
          return (
            <fieldset key={c.id} style={{marginBottom:16}}>
              <legend>{c.label}</legend>
              <label>Label <input value={c.label} onChange={e=>updCrate(c.id,{label:e.target.value})}/></label>
              {dimOrder.map(dim=>(
                <p key={dim}>{dimLabels[dim as 'height'|'length'|'width']}: {' '}
                  <input type="number" style={{width:60}} value={c[dim as keyof CrateInput] as number}
                         onChange={e=>updCrate(c.id,{[dim]:Number(e.target.value)} as any)}/>{' '}
                  <select value={c[`${dim}Unit` as const] as Unit}
                          onChange={e=>updCrate(c.id,{[`${dim}Unit`]:e.target.value as Unit} as any)}>
                    <option value="m">m</option><option value="cm">cm</option>
                  </select>
                </p>
              ))}
              <p>Weight <input type="number" style={{width:70}} value={c.weight}
                               onChange={e=>updCrate(c.id,{weight:Number(e.target.value)})}/> kg</p>
              <p>Colour <input type="color" value={c.colour}
                               onChange={e=>updCrate(c.id,{colour:e.target.value})}/></p>
              <p>Stackable <input type="checkbox" checked={c.stackable}
                                  onChange={e=>updCrate(c.id,{stackable:e.target.checked})}/></p>
              {c.stackable && (
                <p>On top of <select value={c.stackTargetId??''}
                    onChange={e=>updCrate(c.id,{stackTargetId:e.target.value?Number(e.target.value):undefined})}>
                    <option value="">— choose —</option>
                    {availableBases.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}
                  </select></p>
              )}
              <button style={{marginTop:4}} onClick={()=>deleteCrate(c.id)}>🗑 Delete</button>
            </fieldset>
          );
        })}

        {/* ---- buttons ---- */}
        <button onClick={()=>{snapshot(); addCrateFromData({label:`Crate ${crates.length+1}`,length:1,width:1,height:1,weight:50});}}
                disabled={capacityReached}>
          + Add blank crate
        </button>
        <button onClick={undo} disabled={!history.length} style={{marginLeft:8}}>
          Undo last change
        </button>
        <p style={{fontSize:12,color:'#666'}}>Scene updates instantly.</p>
      </div>

      {/* ========= right column = 3‑D view ========= */}
      <div style={{ flex: 1 }}>
        <Canvas camera={{ position: [truckLen, truckHei*1.3, truckWid*1.4] }}>
          <ambientLight intensity={0.5}/>
          <directionalLight position={[5,10,5]} intensity={0.8} castShadow/>
          <mesh position={[0.025, truckHei/2, truckWid/2]} receiveShadow>
            <boxGeometry args={[0.05, truckHei, truckWid]}/>
            <meshStandardMaterial color="#777" transparent opacity={0.35}/>
          </mesh>
          <mesh rotation={[-Math.PI/2,0,0]} position={[truckLen/2,0,truckWid/2]} receiveShadow>
            <planeGeometry args={[truckLen, truckWid]}/>
            <meshStandardMaterial color="#d0d0d0"/>
          </mesh>

          {placed.map(c=>{
            const l = toMeters(c.length,c.lengthUnit);
            const w = toMeters(c.width ,c.widthUnit);
            const h = toMeters(c.height,c.heightUnit);
            return (
              <group key={c.id} position={c.position}>
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[l,h,w]}/>
                  <meshStandardMaterial color={c.colour}/>
                  <Edges scale={1.02} threshold={15} color="black"/>
                </mesh>
                <Text position={[0,h/2+0.02,0]} rotation={[-Math.PI/2,0,0]}
                      fontSize={Math.min(l,w)*0.18} color="black"
                      anchorX="center" anchorY="middle">{c.label}</Text>
              </group>
            );
          })}

          <OrbitControls makeDefault/>
        </Canvas>
      </div>
    </div>
  );
}
