/*  App.tsx  */
import React, { useState, useMemo, ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';                 // <- NEW

/* ---------- helpers ---------- */
type Unit = 'm' | 'cm';
const toMeters = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const randomColour = () =>
  '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

/* ---------- data models ---------- */
interface Truck { length: number; width: number; height: number; unit: Unit; }
interface CrateInput {
  id: number;
  label: string;
  length: number;  lengthUnit: Unit;
  width: number;   widthUnit: Unit;
  height: number;  heightUnit: Unit;
  weight: number;
  colour: string;
  stackable: boolean;
  stackTargetId?: number;
}
interface ParsedRow {            // <- rows read from Excel
  label: string;
  length: number;
  width: number;
  height: number;
  weight: number;
}
interface CratePlaced extends CrateInput { position: [number, number, number]; }

/* ---------- packer (unchanged) ---------- */
/* ---------- dual-lane packer, returns placed + overflow list ---------- */
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

/* … keep the same packCrates function here … */

/* ======================================================================= */
export default function App() {
  /* ---------------- state -------------------------------------------- */
  const [truck, setTruck] = useState<Truck>({ length: 10, width: 2.5, height: 2.6, unit: 'm' });

  const [crates, setCrates] = useState<CrateInput[]>([{
    id: 1, label: 'Crate 1', length: 1, lengthUnit: 'm',
    width: 1,  widthUnit: 'm', height: 1, heightUnit: 'm',
    weight: 100, colour: randomColour(), stackable: false,
  }]);

  /* one-step undo (same as previous message) */
  const [history, setHistory] = useState<CrateInput[][]>([]);

  /* NEW – rows parsed from an uploaded sheet */
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [rowSelection, setRowSelection] = useState<Set<number>>(new Set());

  /* ---------------- derived layout ---------------------------------- */
  const { placed, overflowIds } = useMemo(() => packCrates(truck, crates), [truck, crates]);

  /* ---------------- helpers ----------------------------------------- */
  const updTruck = (k: keyof Truck, v: any) => setTruck(p => ({ ...p, [k]: v }));
  const updCrate = (id: number, patch: Partial<CrateInput>) =>
    setCrates(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));

  /* ---------- add + undo ---------- */
  const snapshot = () => setHistory([JSON.parse(JSON.stringify(crates))]);
  const addCrateFromData = (data: ParsedRow) => {
    setCrates(prev => [
      ...prev,
      {
        id: prev.length + 1,
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
      e.target.value = '';          // allow re-upload same file if needed
    };
    reader.readAsArrayBuffer(file);
  };

  const addSelectedRows = () => {
    snapshot();
    parsedRows.forEach((row, i) => rowSelection.has(i) && addCrateFromData(row));
    // clear preview
    setParsedRows([]);
    setRowSelection(new Set());
  };

  /* ---------------- render ------------------------------------------ */
  const truckLen = toMeters(truck.length, truck.unit);
  const truckWid = toMeters(truck.width,  truck.unit);
  const truckHei = toMeters(truck.height, truck.unit);
  const occupiedBaseIds = crates.filter(c => c.stackTargetId).map(c => c.stackTargetId!) as number[];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ========= warning banner / nav cheat-sheet (unchanged) ========= */}
      {overflowIds.length > 0 && (
        <div style={{ position:'absolute',top:0,left:0,right:0,padding:'6px 12px',
          background:'#c62828',color:'#fff',fontWeight:600,zIndex:50,textAlign:'center'}}>
          ⚠️ Truck capacity exceeded by&nbsp;
          {overflowIds.map(id => crates.find(c => c.id === id)!.label).join(', ')}
        </div>
      )}
      <img src="/nav-help.png" alt="Mouse controls"
           style={{ position:'absolute',right:10,bottom:10,width:130,opacity:.9,pointerEvents:'none',zIndex:40}}/>

      {/* ========= left column ========= */}
      <div style={{ width: 360, padding: 16, overflowY: 'auto', borderRight: '1px solid #ddd' }}>
        {/* ---- truck inputs (same) ---- */}
        <h2>Truck</h2>
        {(['length','width','height'] as const).map(d=>(
          <p key={d}>{d}:{' '}
            <input type="number" style={{width:70}} value={truck[d]} onChange={e=>updTruck(d,Number(e.target.value))}/> {truck.unit}
          </p>
        ))}
        <p>Unit <select value={truck.unit} onChange={e=>updTruck('unit',e.target.value as Unit)}>
          <option value="m">m</option><option value="cm">cm</option>
        </select></p>

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
              <thead><tr><th></th><th>Label</th><th>L</th><th>W</th><th>H</th><th>Wt</th></tr></thead>
              <tbody>
              {parsedRows.map((r,i)=>(
                <tr key={i}>
                  <td><input type="checkbox"
                        checked={rowSelection.has(i)}
                        onChange={e=>{
                          const s=new Set(rowSelection);
                          e.target.checked? s.add(i): s.delete(i);
                          setRowSelection(s);
                        }}/></td>
                  <td>{r.label}</td><td>{r.length}</td><td>{r.width}</td><td>{r.height}</td><td>{r.weight}</td>
                </tr>
              ))}
              </tbody>
            </table>
            <button
              onClick={addSelectedRows}
              disabled={rowSelection.size===0}
              style={{ marginTop:6 }}
            >
              Add selected rows to plan
            </button>
          </div>
        )}

        {/* ---- existing crate list (unchanged) ---- */}
        <h2 style={{ marginTop: 24 }}>Crates</h2>
        {crates.map(c=>{
          const availableBases = crates.filter(
            b=>b.id!==c.id && !occupiedBaseIds.includes(b.id) && !b.stackTargetId
          );
          return (
            <fieldset key={c.id} style={{marginBottom:16}}>
              <legend>{c.label}</legend>
              <label>Label <input value={c.label} onChange={e=>updCrate(c.id,{label:e.target.value})}/></label>
              {(['length','width','height'] as const).map(dim=>(
                <p key={dim}>{dim}:{' '}
                  <input type="number" style={{width:60}} value={c[dim]}
                         onChange={e=>updCrate(c.id,{[dim]:Number(e.target.value)} as any)}/>{' '}
                  <select value={c[`${dim}Unit` as const]}
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
            </fieldset>
          );
        })}

        {/* ---- buttons ---- */}
        <button onClick={()=>{snapshot(); addCrateFromData({label:`Crate ${crates.length+1}`,length:1,width:1,height:1,weight:50});}}>
          + Add blank crate
        </button>
        <button onClick={undo} disabled={!history.length} style={{marginLeft:8}}>
          Undo last crate
        </button>
        <p style={{fontSize:12,color:'#666'}}>Scene updates instantly.</p>
      </div>

      {/* ========= right column = 3-D view (unchanged) ========= */}
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
