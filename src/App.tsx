/*  App.tsx  */
import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';

/* ---------- helpers ---------- */
type Unit = 'm' | 'cm';
const toMeters = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);
const randomColor = () =>
  `hsl(${Math.floor(Math.random() * 360)}, 60%, 60%)`; // pleasant pastel

/* ---------- data models ---------- */
interface Truck {
  length: number;
  width: number;
  height: number;
  unit: Unit;
}

interface CrateInput {
  id: number;
  label: string;
  length: number;
  lengthUnit: Unit;
  width: number;
  widthUnit: Unit;
  height: number;
  heightUnit: Unit;
  weight: number;
  colour: string;
  stackable: boolean;
  stackTargetId?: number;
}

interface CratePlaced extends CrateInput {
  position: [number, number, number]; // x y z (m)
}

/* ---------- dual-lane packing ---------- */
function packCrates(truck: Truck, crates: CrateInput[]): CratePlaced[] {
  const placed: CratePlaced[] = [];

  const queue = [...crates.filter(c => !c.stackTargetId)].sort(
    (a, b) => b.weight - a.weight
  );

  let cursorL = 0;
  let cursorR = 0;

  const truckLen = toMeters(truck.length, truck.unit);
  const truckWid = toMeters(truck.width, truck.unit);

  for (const crate of queue) {
    const l = toMeters(crate.length, crate.lengthUnit);
    const w = toMeters(crate.width, crate.widthUnit);
    const h = toMeters(crate.height, crate.heightUnit);

    const lane = cursorL <= cursorR ? 'L' : 'R';

    const xFront = lane === 'L' ? cursorL : cursorR;
    if (xFront + l > truckLen) break; // overflow

    const zCentre = lane === 'L' ? w / 2 : truckWid - w / 2;

    placed.push({
      ...crate,
      position: [xFront + l / 2, h / 2, zCentre],
    });

    if (lane === 'L') cursorL += l;
    else cursorR += l;
  }

  /* stacked crates */
  crates
    .filter(c => c.stackTargetId)
    .forEach(c => {
      const base = placed.find(p => p.id === c.stackTargetId);
      if (!base) return;

      const l = toMeters(c.length, c.lengthUnit);
      const w = toMeters(c.width, c.widthUnit);
      const h = toMeters(c.height, c.heightUnit);
      const baseH = toMeters(base.height, base.heightUnit);

      placed.push({
        ...c,
        position: [base.position[0], base.position[1] + baseH / 2 + h / 2, base.position[2]],
      });
    });

  return placed;
}

/* ---------- React component ---------- */
export default function App() {
  const [truck, setTruck] = useState<Truck>({
    length: 10,
    width: 2.5,
    height: 2.6,
    unit: 'm',
  });

  const [crates, setCrates] = useState<CrateInput[]>([
    {
      id: 1,
      label: 'Crate 1',
      length: 1,
      lengthUnit: 'm',
      width: 1,
      widthUnit: 'm',
      height: 1,
      heightUnit: 'm',
      weight: 100,
      colour: randomColor(),
      stackable: false,
    },
  ]);

  /* ----- UI helpers ----- */
  const updTruck = (k: keyof Truck, v: any) => setTruck(p => ({ ...p, [k]: v }));
  const updCrate = (id: number, patch: Partial<CrateInput>) =>
    setCrates(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));

  const addCrate = () =>
    setCrates(prev => [
      ...prev,
      {
        id: prev.length + 1,
        label: `Crate ${prev.length + 1}`,
        length: 1,
        lengthUnit: 'm',
        width: 1,
        widthUnit: 'm',
        height: 1,
        heightUnit: 'm',
        weight: 50,
        colour: randomColor(),
        stackable: false,
      },
    ]);

  const placed = packCrates(truck, crates);

  /* ---------- render ---------- */
  const truckLen = toMeters(truck.length, truck.unit);
  const truckWid = toMeters(truck.width, truck.unit);
  const truckHei = toMeters(truck.height, truck.unit);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ---------- form column ---------- */}
      <div style={{ width: 340, padding: 16, overflowY: 'auto', borderRight: '1px solid #ddd' }}>
        <h2>Truck</h2>
        {(['length', 'width', 'height'] as const).map(d => (
          <p key={d}>
            {d}:&nbsp;
            <input
              type="number"
              style={{ width: 70 }}
              value={truck[d]}
              onChange={e => updTruck(d, Number(e.target.value))}
            />{' '}
            {truck.unit}
          </p>
        ))}
        <p>
          Unit&nbsp;
          <select value={truck.unit} onChange={e => updTruck('unit', e.target.value as Unit)}>
            <option value="m">m</option>
            <option value="cm">cm</option>
          </select>
        </p>

        <h2 style={{ marginTop: 24 }}>Crates</h2>
        {crates.map(c => (
          <fieldset key={c.id} style={{ marginBottom: 16 }}>
            <legend>{c.label}</legend>

            <label>
              Label&nbsp;
              <input value={c.label} onChange={e => updCrate(c.id, { label: e.target.value })} />
            </label>

            {(['length', 'width', 'height'] as const).map(dim => (
              <p key={dim}>
                {dim}:{' '}
                <input
                  type="number"
                  style={{ width: 60 }}
                  value={c[dim]}
                  onChange={e => updCrate(c.id, { [dim]: Number(e.target.value) } as any)}
                />{' '}
                <select
                  value={c[`${dim}Unit` as const]}
                  onChange={e =>
                    updCrate(c.id, { [`${dim}Unit`]: e.target.value as Unit } as any)
                  }
                >
                  <option value="m">m</option>
                  <option value="cm">cm</option>
                </select>
              </p>
            ))}

            <p>
              Weight:{' '}
              <input
                type="number"
                style={{ width: 70 }}
                value={c.weight}
                onChange={e => updCrate(c.id, { weight: Number(e.target.value) })}
              />{' '}
              kg
            </p>

            <p>
              Colour&nbsp;
              <input
                type="color"
                value={c.colour}
                onChange={e => updCrate(c.id, { colour: e.target.value })}
              />
            </p>

            <p>
              Stackable&nbsp;
              <input
                type="checkbox"
                checked={c.stackable}
                onChange={e => updCrate(c.id, { stackable: e.target.checked })}
              />
            </p>

            {c.stackable && (
              <p>
                On top of&nbsp;
                <select
                  value={c.stackTargetId ?? ''}
                  onChange={e =>
                    updCrate(c.id, {
                      stackTargetId: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                >
                  <option value="">— choose —</option>
                  {crates
                    .filter(o => o.id !== c.id)
                    .map(o => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                </select>
              </p>
            )}
          </fieldset>
        ))}
        <button onClick={addCrate}>+ Add Crate</button>
        <p style={{ fontSize: 12, color: '#666' }}>Scene updates instantly.</p>
      </div>

      {/* ---------- 3-D column ---------- */}
      <div style={{ flex: 1 }}>
        <Canvas camera={{ position: [truckLen, truckHei * 1.3, truckWid * 1.4] }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />

          {/* front wall */}
          <mesh
            position={[0.025, truckHei / 2, truckWid / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.05, truckHei, truckWid]} />
            <meshStandardMaterial color="#777" transparent opacity={0.35} />
          </mesh>

          {/* floor – starts at X=0 and goes backwards only */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[truckLen / 2, 0, truckWid / 2]}
            receiveShadow
          >
            <planeGeometry args={[truckLen, truckWid]} />
            <meshStandardMaterial color="#d0d0d0" />
          </mesh>

          {/* crates */}
          {placed.map(c => {
            const l = toMeters(c.length, c.lengthUnit);
            const w = toMeters(c.width, c.widthUnit);
            const h = toMeters(c.height, c.heightUnit);

            return (
              <group key={c.id} position={c.position}>
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[l, h, w]} />
                  <meshStandardMaterial color={c.colour} />
                  <Edges scale={1.02} threshold={15} color="black" />
                </mesh>
                <Text
                  position={[0, h / 2 + 0.02, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  fontSize={Math.min(l, w) * 0.18}
                  color="black"
                  anchorX="center"
                  anchorY="middle"
                >
                  {c.label}
                </Text>
              </group>
            );
          })}

          <OrbitControls makeDefault />
        </Canvas>
      </div>
    </div>
  );
}
