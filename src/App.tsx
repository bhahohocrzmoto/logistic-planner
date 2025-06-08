/*  App.tsx  */
import React, { useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Text } from '@react-three/drei';

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

    if (xFront + l > truckLen) {
      overflow.push(crate.id);
      continue;
    }
    if (w > truckWid) {
      overflow.push(crate.id);
      continue;
    }

    const zCentre = lane === 'L' ? w / 2 : truckWid - w / 2;

    placed.push({
      ...crate,
      position: [xFront + l / 2, h / 2, zCentre],
    });

    if (lane === 'L') cursorL += l;
    else cursorR += l;
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

      const l = toMeters(c.length, c.lengthUnit);
      const w = toMeters(c.width, c.widthUnit);
      const h = toMeters(c.height, c.heightUnit);
      const baseH = toMeters(base.height, base.heightUnit);

      const y = base.position[1] + baseH / 2 + h / 2;
      if (y + h / 2 > truckHei) {
        overflow.push(c.id);
        return;
      }

      placed.push({
        ...c,
        position: [base.position[0], y, base.position[2]],
      });
    });

  return { placed, overflowIds: overflow };
}

/* ---------- React component ---------- */
export default function App() {
  /* ----- state ---------------------------------------------------------- */
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
      colour: randomColour(),
      stackable: false,
    },
  ]);

  /* ----- derived layout ------------------------------------------------- */
  const { placed, overflowIds } = useMemo(
    () => packCrates(truck, crates),
    [truck, crates]
  );

  /* ----- helpers -------------------------------------------------------- */
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
        colour: randomColour(),
        stackable: false,
      },
    ]);

  /* ---------- UI -------------------------------------------------------- */

  const truckLen = toMeters(truck.length, truck.unit);
  const truckWid = toMeters(truck.width, truck.unit);
  const truckHei = toMeters(truck.height, truck.unit);

  /* crates that already HAVE something on top → cannot appear in “On top of” list */
  const occupiedBaseIds = crates
    .filter(c => c.stackTargetId)
    .map(c => c.stackTargetId!) as number[];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ===== warning banner ========================================= */}
      {overflowIds.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            padding: '6px 12px',
            background: '#c62828',
            color: 'white',
            fontWeight: 600,
            zIndex: 50,
            textAlign: 'center',
          }}
        >
          ⚠️ Truck capacity exceeded by:{' '}
          {overflowIds
            .map(id => crates.find(c => c.id === id)!.label)
            .join(', ')}
        </div>
      )}

      {/* ===== navigation cheat-sheet ================================ */}
      <img
        src="/nav-help.png"
        alt="Mouse controls: rotate, pan, zoom"
        style={{
          position: 'absolute',
          right: 10,
          bottom: 10,
          width: 130,
          opacity: 0.9,
          pointerEvents: 'none',
          zIndex: 40,
        }}
      />

      {/* ===== form column ========================================== */}
      <div
        style={{
          width: 340,
          padding: 16,
          overflowY: 'auto',
          borderRight: '1px solid #ddd',
        }}
      >
        <h2>Truck</h2>
        {(['length', 'width', 'height'] as const).map(d => (
          <p key={d}>
            {d}:{' '}
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
          Unit{' '}
          <select value={truck.unit} onChange={e => updTruck('unit', e.target.value as Unit)}>
            <option value="m">m</option>
            <option value="cm">cm</option>
          </select>
        </p>

        <h2 style={{ marginTop: 24 }}>Crates</h2>
        {crates.map(c => {
          const availableBases = crates.filter(
            b =>
              b.id !== c.id && // not itself
              !occupiedBaseIds.includes(b.id) && // nobody already on top
              !b.stackTargetId // a base crate shouldn't itself be stacked
          );
          return (
            <fieldset key={c.id} style={{ marginBottom: 16 }}>
              <legend>{c.label}</legend>

              <label>
                Label{' '}
                <input
                  value={c.label}
                  onChange={e => updCrate(c.id, { label: e.target.value })}
                />
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
                Weight{' '}
                <input
                  type="number"
                  style={{ width: 70 }}
                  value={c.weight}
                  onChange={e => updCrate(c.id, { weight: Number(e.target.value) })}
                />{' '}
                kg
              </p>

              <p>
                Colour <input type="color" value={c.colour} onChange={e => updCrate(c.id, { colour: e.target.value })} />
              </p>

              <p>
                Stackable{' '}
                <input
                  type="checkbox"
                  checked={c.stackable}
                  onChange={e => updCrate(c.id, { stackable: e.target.checked })}
                />
              </p>

              {c.stackable && (
                <p>
                  On top of{' '}
                  <select
                    value={c.stackTargetId ?? ''}
                    onChange={e =>
                      updCrate(c.id, {
                        stackTargetId: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  >
                    <option value="">— choose —</option>
                    {availableBases.map(base => (
                      <option key={base.id} value={base.id}>
                        {base.label}
                      </option>
                    ))}
                  </select>
                </p>
              )}
            </fieldset>
          );
        })}

        <button onClick={addCrate}>+ Add Crate</button>
        <p style={{ fontSize: 12, color: '#666' }}>Scene updates instantly.</p>
      </div>

      {/* ===== 3-D view column ====================================== */}
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

          {/* floor */}
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
