import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';

/* ---------- types ---------- */

type Unit = 'm' | 'cm';

interface TruckSize {
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
  stackable: boolean;
  stackTargetId?: number; // id of the crate it sits on
}

interface CratePlaced extends CrateInput {
  position: [number, number, number]; // x, y, z (metres)
}

/* ---------- helpers ---------- */

const toMeters = (value: number, unit: Unit) => (unit === 'cm' ? value / 100 : value);

/* Naive bin-packing – good enough to visualise the idea                           *
 * 1. place all “base” crates (those without stackTarget) on the floor             *
 * 2. then place stacked crates centred on top of their target                     */
function computeLayout(truck: TruckSize, crates: CrateInput[]): CratePlaced[] {
  /* --- step 1 : floor crates ------------------------------------------------- */
  const placed: CratePlaced[] = [];
  const baseCrates = crates
    .filter(c => !c.stackTargetId)
    .sort((a, b) => b.weight - a.weight); // heavy first

  let cursorX = 0;
  let cursorZ = 0;
  let rowHeight = 0;

  const truckLen = toMeters(truck.length, truck.unit);
  const truckWid = toMeters(truck.width, truck.unit);

  for (const c of baseCrates) {
    const w = toMeters(c.width, c.widthUnit);
    const l = toMeters(c.length, c.lengthUnit);
    const h = toMeters(c.height, c.heightUnit);

    // new row if the crate would overflow the length
    if (cursorX + l > truckLen) {
      cursorX = 0;
      cursorZ += rowHeight;
      rowHeight = 0;
    }

    // very naive overflow check – just stop if truck is “full”
    if (cursorZ + w > truckWid) break;

    placed.push({
      ...c,
      position: [cursorX + l / 2, h / 2, cursorZ + w / 2],
    });

    cursorX += l;
    rowHeight = Math.max(rowHeight, w);
  }

  /* --- step 2 : stacked crates ---------------------------------------------- */
  const stacked = crates.filter(c => c.stackTargetId);
  for (const c of stacked) {
    const base = placed.find(p => p.id === c.stackTargetId);
    if (!base) continue; // invalid target

    const w = toMeters(c.width, c.widthUnit);
    const l = toMeters(c.length, c.lengthUnit);
    const h = toMeters(c.height, c.heightUnit);

    placed.push({
      ...c,
      position: [
        base.position[0],                                   // same x centre
        base.position[1] + toMeters(base.height, base.heightUnit) / 2 + h / 2, // on top
        base.position[2],                                   // same z centre
      ],
    });
  }

  return placed;
}

/* ---------- React UI ---------------------------------------------------------- */

export default function App() {
  /* ---- state -------------------------------------------------------------- */
  const [truck, setTruck] = useState<TruckSize>({
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
      stackable: false,
    },
  ]);

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
        stackable: false,
      },
    ]);

  /* ---- derived data ------------------------------------------------------- */
  const placedCrates = computeLayout(truck, crates);

  /* ---- helpers to update forms ------------------------------------------- */
  const updateTruckField = (field: keyof TruckSize, value: number | Unit) =>
    setTruck(prev => ({ ...prev, [field]: value }));

  const updateCrate = (id: number, patch: Partial<CrateInput>) =>
    setCrates(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));

  /* ---- render ------------------------------------------------------------- */
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ------------ left column : UI ------------------------------------ */}
      <div style={{ width: 320, overflowY: 'auto', padding: 16, boxSizing: 'border-box', borderRight: '1px solid #ddd' }}>
        <h2>Truck Size</h2>
        <label>
          Length&nbsp;
          <input
            type="number"
            value={truck.length}
            onChange={e => updateTruckField('length', Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>
        <select value={truck.unit} onChange={e => updateTruckField('unit', e.target.value as Unit)}>
          <option value="m">m</option>
          <option value="cm">cm</option>
        </select>
        <br />
        <label>
          Width&nbsp;&nbsp;
          <input
            type="number"
            value={truck.width}
            onChange={e => updateTruckField('width', Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>
        <select value={truck.unit} onChange={e => updateTruckField('unit', e.target.value as Unit)}>
          <option value="m">m</option>
          <option value="cm">cm</option>
        </select>
        <br />
        <label>
          Height&nbsp;
          <input
            type="number"
            value={truck.height}
            onChange={e => updateTruckField('height', Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>
        <select value={truck.unit} onChange={e => updateTruckField('unit', e.target.value as Unit)}>
          <option value="m">m</option>
          <option value="cm">cm</option>
        </select>

        <h2 style={{ marginTop: 24 }}>Crates</h2>

        {crates.map(crate => (
          <fieldset key={crate.id} style={{ marginBottom: 16 }}>
            <legend>{crate.label}</legend>

            <label>
              Label&nbsp;
              <input
                value={crate.label}
                onChange={e => updateCrate(crate.id, { label: e.target.value })}
              />
            </label>
            <br />

            {(['length', 'width', 'height'] as const).map(dim => (
              <span key={dim}>
                {dim[0].toUpperCase() + dim.slice(1)}{' '}
                <input
                  type="number"
                  value={crate[dim]}
                  onChange={e => updateCrate(crate.id, { [dim]: Number(e.target.value) } as any)}
                  style={{ width: 60 }}
                />
                <select
                  value={crate[`${dim}Unit` as const]}
                  onChange={e => updateCrate(crate.id, { [`${dim}Unit`]: e.target.value as Unit } as any)}
                >
                  <option value="m">m</option>
                  <option value="cm">cm</option>
                </select>
                <br />
              </span>
            ))}

            <label>
              Weight&nbsp;
              <input
                type="number"
                value={crate.weight}
                onChange={e => updateCrate(crate.id, { weight: Number(e.target.value) })}
                style={{ width: 70 }}
              />
              &nbsp;kg
            </label>
            <br />

            <label>
              Stackable&nbsp;
              <input
                type="checkbox"
                checked={crate.stackable}
                onChange={e => updateCrate(crate.id, { stackable: e.target.checked })}
              />
            </label>
            <br />

            {crate.stackable && (
              <label>
                On top of&nbsp;
                <select
                  value={crate.stackTargetId ?? ''}
                  onChange={e =>
                    updateCrate(crate.id, { stackTargetId: e.target.value ? Number(e.target.value) : undefined })
                  }
                >
                  <option value="">— Choose —</option>
                  {crates
                    .filter(c => c.id !== crate.id)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </fieldset>
        ))}

        <button onClick={addCrate}>+ Add Crate</button>
        <p style={{ fontSize: 12, color: '#666' }}>
          Changes are rendered live – no “Run” button needed.
        </p>
      </div>

      {/* ------------ right column : 3-D view ----------------------------- */}
      <div style={{ flex: 1 }}>
        <Canvas camera={{ position: [truck.length, truck.height, truck.width] }} shadows>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />

          {/* Truck floor (simple plane) */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry
              args={[toMeters(truck.length, truck.unit), toMeters(truck.width, truck.unit)]}
            />
            <meshStandardMaterial color="#dddddd" />
          </mesh>

          {/* Crates */}
          {placedCrates.map(c => {
            const l = toMeters(c.length, c.lengthUnit);
            const w = toMeters(c.width, c.widthUnit);
            const h = toMeters(c.height, c.heightUnit);

            return (
              <mesh
                key={c.id}
                position={c.position}
                castShadow
                receiveShadow
                userData={{ label: c.label }}
              >
                <boxGeometry args={[l, h, w]} />
                <meshStandardMaterial color="orange" />
                <Edges scale={1.02} threshold={15} color="black" />
              </mesh>
            );
          })}

          <OrbitControls makeDefault />
        </Canvas>
      </div>
    </div>
  );
}
