import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';

/* ---------- helpers ---------- */
type Unit = 'm' | 'cm';
const toMeters = (v: number, u: Unit) => (u === 'cm' ? v / 100 : v);

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

/* ---------- packing algorithm (dual-lane) ---------- */
function packCrates(truck: Truck, crates: CrateInput[]): CratePlaced[] {
  const placed: CratePlaced[] = [];

  /** sort heavy → light so heavy boxes go to the very front **/
  const queue = [...crates.filter(c => !c.stackTargetId)].sort(
    (a, b) => b.weight - a.weight
  );

  // two independent cursors that crawl down the truck’s length
  let cursorL = 0; // left lane front-to-back progress (m)
  let cursorR = 0; // right lane front-to-back progress (m)
  const laneZ = { L: 0, R: toMeters(truck.width, truck.unit) }; // z positions of the two lanes

  const truckLen = toMeters(truck.length, truck.unit);

  for (const crate of queue) {
    const l = toMeters(crate.length, crate.lengthUnit);
    const w = toMeters(crate.width, crate.widthUnit);
    const h = toMeters(crate.height, crate.heightUnit);

    /* choose whichever lane has the smaller cursor (keeps lanes even) */
    const lane = cursorL <= cursorR ? 'L' : 'R';
    const x = lane === 'L' ? cursorL : cursorR; // distance from front wall
    const z = lane === 'L' ? w / 2 : laneZ.R - w / 2; // centre of crate

    // stop if we’d overflow the truck
    if (x + l > truckLen) break;

    placed.push({
      ...crate,
      position: [x + l / 2, h / 2, z],
    });

    // advance the chosen lane’s cursor
    if (lane === 'L') cursorL += l;
    else cursorR += l;
  }

  /* ---------- stacked crates (centred on their target) ---------- */
  crates
    .filter(c => c.stackTargetId)
    .forEach(c => {
      const base = placed.find(p => p.id === c.stackTargetId);
      if (!base) return;

      const l = toMeters(c.length, c.lengthUnit);
      const w = toMeters(c.width, c.widthUnit);
      const h = toMeters(c.height, c.heightUnit);

      const [bx, by, bz] = base.position;
      const baseH = toMeters(base.height, base.heightUnit);

      placed.push({
        ...c,
        position: [bx, by + baseH / 2 + h / 2, bz], // centred on top
      });
    });

  return placed;
}

/* ---------- React component ---------- */
export default function App() {
  /* basic truck */
  const [truck, setTruck] = useState<Truck>({
    length: 10,
    width: 2.5,
    height: 2.6,
    unit: 'm',
  });

  /* one starter crate */
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
      colour: '#f28e1c',
      stackable: false,
    },
  ]);

  /* UI helpers */
  const updTruck = (f: keyof Truck, v: any) =>
    setTruck(prev => ({ ...prev, [f]: v }));
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
        colour: '#8bc34a',
        stackable: false,
      },
    ]);

  const placed = packCrates(truck, crates);

  /* ---------- render ---------- */
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ---------- left: form UI ---------- */}
      <div style={{ width: 340, padding: 16, overflowY: 'auto', borderRight: '1px solid #ddd' }}>
        <h2>Truck</h2>
        {(['length', 'width', 'height'] as const).map(dim => (
          <p key={dim}>
            {dim[0].toUpperCase() + dim.slice(1)}&nbsp;
            <input
              type="number"
              value={truck[dim]}
              style={{ width: 70 }}
              onChange={e => updTruck(dim, Number(e.target.value))}
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
            <p>
              Label&nbsp;
              <input value={c.label} onChange={e => updCrate(c.id, { label: e.target.value })} />
            </p>

            {(['length', 'width', 'height'] as const).map(dim => (
              <p key={dim}>
                {dim[0].toUpperCase() + dim.slice(1)}&nbsp;
                <input
                  type="number"
                  value={c[dim]}
                  style={{ width: 60 }}
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
              Weight&nbsp;
              <input
                type="number"
                value={c.weight}
                style={{ width: 70 }}
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
                    .filter(other => other.id !== c.id)
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
        <p style={{ fontSize: 12, color: '#666' }}>Scene updates live as you edit.</p>
      </div>

      {/* ---------- right: 3-D view ---------- */}
      <div style={{ flex: 1 }}>
        <Canvas camera={{ position: [truck.length, truck.height * 1.2, truck.width * 1.5] }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />

          {/* FRONT WALL (grey) */}
          <mesh position={[0, toMeters(truck.height, truck.unit) / 2, 0]} receiveShadow>
            <boxGeometry
              args={[
                0.05,
                toMeters(truck.height, truck.unit),
                toMeters(truck.width, truck.unit),
              ]}
            />
            <meshStandardMaterial color="#777" transparent opacity={0.3} />
          </mesh>

          {/* FLOOR */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry
              args={[toMeters(truck.length, truck.unit), toMeters(truck.width, truck.unit)]}
            />
            <meshStandardMaterial color="#dddddd" />
          </mesh>

          {/* CRATES */}
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

                {/* Label on top face */}
                <Text
                  position={[0, h / 2 + 0.02, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  fontSize={w * 0.15}
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
