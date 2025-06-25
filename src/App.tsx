import React, { useCallback, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, GizmoHelper, GizmoViewport } from "@react-three/drei";
import { nanoid } from "nanoid";

// ────────────────────────────────────────────────────────────────────────────────
//  Types & helpers
// ────────────────────────────────────────────────────────────────────────────────
export type Unit = "m" | "cm";
export interface Crate {
  id: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  color: string;
  opacity: number; // 0 – 1
  label: string;
  stackTarget: "floor" | string; // floor or crate id (unused for now)
}

const newCrate = (): Crate => ({
  id: nanoid(6),
  length: 1,
  width: 1,
  height: 1,
  weight: 50,
  color: "#1565c0",
  opacity: 0.5,
  label: "",
  stackTarget: "floor",
});

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

// ────────────────────────────────────────────────────────────────────────────────
//  Main
// ────────────────────────────────────────────────────────────────────────────────
export default function App() {
  // ─── state ───────────────────────────────────────────────────────────────────
  const [crates, setCrates] = useState<Crate[]>([newCrate()]);
  const [history, setHistory] = useState<Crate[][]>([]);

  const pushHistory = useCallback((prev: Crate[]) => {
    setHistory((h) => [...h.slice(-29), JSON.parse(JSON.stringify(prev))]); // keep last 30
  }, []);

  // ─── CRUD ────────────────────────────────────────────────────────────────────
  const addCrate = () => {
    pushHistory(crates);
    setCrates([...crates, newCrate()]);
  };
  const delCrate = (id: string) => {
    pushHistory(crates);
    setCrates(crates.filter((c) => c.id !== id));
  };
  const updCrate = (id: string, data: Partial<Crate>) => {
    pushHistory(crates);
    setCrates(crates.map((c) => (c.id === id ? { ...c, ...data } : c)));
  };
  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setCrates(prev);
      return h.slice(0, -1);
    });
  };

  // ─── layout logic  (heavy‑first, alternate left/right, advance along length) ──
  const placedCrates = useMemo(() => {
    const sorted = [...crates].sort((a, b) => b.weight - a.weight);
    const placed: (Crate & { x: number; y: number; z: number })[] = [];
    let nextZ = -truck.length / 2 + 0.1; // start at very front (cab) and move backward
    const gap = 0.05;
    sorted.forEach((c, idx) => {
      const sideLeft = idx % 2 === 0; // left, right, left, right …
      const x = (sideLeft ? -1 : 1) * (c.width / 2 + gap / 2);
      const z = nextZ + c.length / 2;
      nextZ += c.length + gap;
      placed.push({ ...c, x, y: c.height / 2, z });
    });
    return placed;
  }, [crates]);

  // ─── truck dims ──────────────────────────────────────────────────────────────
  const truck = { length: 10, width: 2.5, height: 2.6 };

  // ─── UI ──────────────────────────────────────────────────────────────────────
  return (
    // Ensure the root flex container always has height so the Canvas is visible
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      {/* sidebar */}
      <aside style={{ width: 300, padding: 10, fontFamily: "sans-serif", fontSize: 14, overflowY: "auto" }}>
        <button style={{ width: "100%", marginBottom: 6 }} disabled={!history.length} onClick={undo}>
          ⤺ Undo
        </button>
        <h3>Crates</h3>
        {crates.map((c, idx) => (
          <details key={c.id} style={{ marginBottom: 4 }}>
            <summary>
              Crate {idx + 1} ({c.length}×{c.width}×{c.height}m)
            </summary>
            {([
              ["length", "L"],
              ["width", "W"],
              ["height", "H"],
            ] as const).map(([k, lbl]) => (
              <p key={k as string}>
                {lbl}&nbsp;
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={c[k] as number}
                  style={{ width: 60 }}
                  onChange={(e) => updCrate(c.id, { [k]: +e.target.value } as Partial<Crate>)}
                />
                &nbsp;m
              </p>
            ))}
            <p>
              Wt&nbsp;
              <input
                type="number"
                min={1}
                value={c.weight}
                style={{ width: 70 }}
                onChange={(e) => updCrate(c.id, { weight: +e.target.value })}
              />
              &nbsp;kg
            </p>
            <p>
              Label&nbsp;
              <input value={c.label} style={{ width: 120 }} onChange={(e) => updCrate(c.id, { label: e.target.value })} />
            </p>
            <p>
              Colour <input type="color" value={c.color} onChange={(e) => updCrate(c.id, { color: e.target.value })} />
              &nbsp; Opacity &nbsp;
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={c.opacity}
                onChange={(e) => updCrate(c.id, { opacity: +e.target.value })}
              />
            </p>
            <button onClick={() => delCrate(c.id)}>🗑 Delete</button>
          </details>
        ))}
        <button style={{ width: "100%", marginTop: 8 }} onClick={addCrate}>
          + Add crate
        </button>
      </aside>

      {/* 3D canvas */}
      <Canvas style={{ flex: 1 }} camera={{ position: [8, 6, 10], fov: 45 }} shadows>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />

        {/* deck */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[truck.length, truck.width]} />
          <meshStandardMaterial color="#303030" />
        </mesh>

        {/* cab/front panel */}
        <mesh position={[0, truck.height / 2, -truck.length / 2]} rotation={[0, Math.PI, 0]} castShadow>
          <planeGeometry args={[truck.width, truck.height]} />
          <meshStandardMaterial color="#555" opacity={0.7} transparent />
        </mesh>

        {/* crates */}
        {placedCrates.map((c) => (
          <group key={c.id} position={[c.x, c.y, c.z]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[c.width, c.height, c.length]} />
              <meshStandardMaterial color={c.color} transparent opacity={clamp(c.opacity, 0.05, 1)} />
            </mesh>
            {c.label && (
              <Text
                position={[0, c.height / 2 + 0.02, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.25}
                color="#fff"
                anchorX="center"
                anchorY="middle"
              >
                {c.label}
              </Text>
            )}
          </group>
        ))}

        <OrbitControls makeDefault />
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport axisColors={["#ff4d4d", "#4dff4d", "#4d4dff"]} labelColor="#ccc" />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
