/* App.tsx – fully closed, compile‑ready */
import React, { useState, useMemo, ChangeEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';
import * as XLSX from 'xlsx';

// helpers
type Unit = 'm' | 'cm';
const toM = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const rand = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

type Dim = 'height' | 'length' | 'width';
const LABEL: Record<Dim, string> = { height: 'H', length: 'L', width: 'W' };
type UnitKey = 'heightUnit' | 'lengthUnit' | 'widthUnit';

interface Truck { length: number; width: number; height: number; unit: Unit; maxLoad?: number; }
interface Crate { id: number; label: string; length: number; lengthUnit: Unit; width: number; widthUnit: Unit; height: number; heightUnit: Unit; weight: number; colour: string; stackable: boolean; stackTargetId?: number; }
interface Parsed { label: string; length: number; width: number; height: number; weight: number; }
interface Placed extends Crate { position: [number, number, number]; }

const Banner: React.FC<{ c: string; y?: number; msg: string }> = ({ c, y = 0, msg }) => (
  <div style={{ position: 'absolute', top: y, left: 0, right: 0, padding: 6, background: c, color: '#fff', fontWeight: 600, textAlign: 'center', zIndex: 50 }}>{msg}</div>
);

function pack(truck: Truck, crates: Crate[]): { placed: Placed[]; ov: number[] } {
  const placed: Placed[] = [], ov: number[] = [];
  const L = toM(truck.length, truck.unit), W = toM(truck.width, truck.unit), H = toM(truck.height, truck.unit);
  let l1 = 0, l2 = 0;
  crates.filter(c=>!c.stackTargetId).sort((a,b)=>b.weight-a.weight).forEach(c=>{
    const l=toM(c.length,c.lengthUnit),w=toM(c.width,c.widthUnit),h=toM(c.height,c.heightUnit),lane=l1<=l2?1:2,x=lane===1?l1:l2;
    if(h>H||x+l>L||w>W){ov.push(c.id);return;}
    placed.push({...c,position:[x+l/2,h/2,lane===1?w/2:W-w/2]});
    lane===1?l1+=l:l2+=l;
  });
  crates.filter(c=>c.stackTargetId).forEach(c=>{
    const base=placed.find(b=>b.id===c.stackTargetId);if(!base){ov.push(c.id);return;}
    const y=base.position[1]+toM(base.height,base.heightUnit)/2+toM(c.height,c.heightUnit)/2;
    if(y+toM(c.height,c.heightUnit)/2>H){ov.push(c.id);return;}
    placed.push({...c,position:[base.position[0],y,base.position[2]]});
  });
  return { placed, ov };
}

export default function App(){
  const [truck,setTruck]=useState<Truck>({length:10,width:2.5,height:2.6,unit:'m',maxLoad:1000});
  const [cr,setCr]=useState<Crate[]>([{id:1,label:'Crate 1',length:1,lengthUnit:'m',width:1,widthUnit:'m',height:1,heightUnit:'m',weight:100,colour:rand(),stackable:false}]);
  const [rows,setRows]=useState<Parsed[]>([]);
  const [sel,setSel]=useState<Set<number>>(new Set());

  const {placed,ov}=useMemo(()=>pack(truck,cr),[truck,cr]);
  const weight=cr.reduce((s,c)=>s+c.weight,0);
  const cap=truck.maxLoad!==undefined&&weight>=truck.maxLoad;
  const overlaps=useMemo(()=>{
    const arr:string[]=[];
    for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
      const a=placed[i],b=placed[j];if(a.id===b.stackTargetId||b.id===a.stackTargetId)continue;
      const ax=toM(a.length,a.lengthUnit)/2,ay=toM(a.height,a.heightUnit)/2,az=toM(a.width,a.widthUnit)/2;
      const bx=toM(b.length,b.lengthUnit)/2,by=toM(b.height,b.heightUnit)/2,bz=toM(b.width,b.widthUnit)/2;
      if(Math.abs(a.position[0]-b.position[0])<ax+bx&&Math.abs(a.position[1]-b.position[1])<ay+by&&Math.abs(a.position[2]-b.position[2])<az+bz)arr.push(`${a.label}&${b.label}`);
    }
    return arr;
  },[placed]);

  const add=(r?:Parsed)=>setCr([...cr,{id:cr.length?Math.max(...cr.map(c=>c.id))+1:1,label:r?.label??`Crate ${cr.length+1}`,length:r?.length??1,lengthUnit:'m',width:r?.width??1,widthUnit:'m',height:r?.height??1,heightUnit:'m',weight:r?.weight??50,colour:rand(),stackable:false}]);
  const upd=(id:number,p:Partial<Crate>)=>setCr(cr.map(c=>c.id===id?{...c,...p}:c));
  const del=(id:number)=>setCr(cr.filter(c=>c.id!==id&&c.stackTargetId!==id));

  const onFile=(e:ChangeEvent<HTMLInputElement>)=>{if(!e.target.files?.length)return;const rd=new FileReader();rd.onload=ev=>{const wb=XLSX.read(ev.target!.result as ArrayBuffer);const ws=wb.Sheets[wb.SheetNames[0]];const js=XLSX.utils.sheet_to_json(ws,{defval:''}) as any[];setRows(js.map(o=>({label:o.label||o.Label,length:+o.length||+o.Length,width:+o.width||+o.Width,height:+o.height||+o.Height,weight:+o.weight||+o.Weight})));};rd.readAsArrayBuffer(e.target.files[0]);};

  const TL=toM(truck.length,truck.unit),TW=toM(truck.width,truck.unit),TH=toM(truck.height,truck.unit);

  return(
    <div style={{display:'flex',height:'100vh'}}>
      {ov.length>0&&<Banner c="#c62828" msg={`Overflow: ${ov.map(id=>cr.find(c=>c.id===id)!.label).join(',')}`} />}
      {cap&&<Banner c="#f57c00" y={32} msg={`Max load ${weight}/${truck.maxLoad}kg`} />}
      {overlaps.length>0&&<Banner c="#b71c1c" y={64} msg={`Overlap: ${overlaps.join(',')}`} />}

      <aside style={{width:380,padding:12,overflowY:'auto',borderRight:'1px solid #ccc'}}>
        <h3>Truck</h3>
        {(['height','length','width'] as Dim[]).map(d=><p key={d}>{LABEL[d]} <input type="number" style={{width:60}} value={truck[d]} onChange={e=>setTruck({...truck,[d]:+e.target.value})}/> {truck.unit}</p>)}
        <p>Unit <select value={truck.unit} onChange={e=>setTruck({...truck,unit:e.target.value as Unit})}><option value="m">m</option><option value="cm">cm</option></select></p>
        <p>Max load <input type="number" style={{width:70}} value={truck.maxLoad??''} onChange={e=>setTruck({...truck,maxLoad:e.target.value?+e.target.value:undefined})}/> kg</p>

        <h3>Import</h3>
        <input type="file" accept=".xls,.xlsx" onChange={onFile}/>
        {rows.length>0&&<div>{rows.map((r,i)=><p key={i}><input type="checkbox" checked={sel.has(i)} onChange={e=>{const s=new Set(sel);e.target.checked?s.add(i):s.delete(i);setSel(s);}}/> {r.label}</p>)}<button disabled={sel.size===0||cap} onClick={()=>{sel.forEach(i=>add(rows[i]));setRows([]);setSel(new Set());}}>Add selected</button></div>}

        <h3>Crates</h3>
        {cr.map(c=>(
          <details key={c.id} style={{marginBottom:6}}>
            <summary>{c.label}</summary>
            {(['height','length','width'] as Dim[]).map(dim=>{const u=(dim+'Unit') as UnitKey;return <p key={dim}>{LABEL[dim]} <input type="number" style={{width:60}} value={c[dim]} onChange={e=>upd(c.id,{[dim]:+e.target.value} as any)}/> <select value={c[u]} onChange={e=>upd(c.id,{[u]:e.target.value as Unit} as any)}><option value="m">m</option><option value="cm">cm</option></select></p>;})}
            <p>Weight <input type="number" style={{width:70}} value={c.weight} onChange={e=>upd(c.id,{weight:+e.target.value})}/> kg</p>
            <button onClick={()=>del(c.id)}>🗑 Delete</button>
          </details>
        ))}
        <button disabled={cap} onClick={()=>add()}>+ Crate</button>
      </aside>

      <Canvas shadows style={{flex:1}} camera={{position:[TL,TH*1.2,TW*1.4]}}>
        <ambientLight intensity={0.5}/>
        <directionalLight position={[5,10,5]} intensity={0.8} castShadow/>
        <mesh rotation={[-Math.PI/2,0,0]} position={[TL/2,0,TW/2]}><planeGeometry args={[TL,TW]}/><meshStandardMaterial color="#ddd"/></mesh>
        {placed.map(c=>{const l=toM(c.length,c.lengthUnit),w=toM(c.width,c.widthUnit),h=toM(c.height,c.heightUnit);return <group key={c.id} position={c.position}><mesh castShadow><boxGeometry args={[l,h,w]}/><meshStandardMaterial color={c.colour}/><Edges/></mesh><Text rotation={[-Math.PI/2,0,0]} position={[0,h/2+0.02,0]} fontSize={Math.min(l,w)*0.18}>{c.label}</Text></group>;})}
        <OrbitControls/>
      </Canvas>
    </div>
  );
}
