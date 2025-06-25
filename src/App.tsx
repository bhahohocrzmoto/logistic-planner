import React, { useState, useCallback, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Text,
  GizmoHelper,
  GizmoViewport,
} from "@react-three/drei";
import { nanoid } from "nanoid";

// ────────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────────

export type Unit = "m" | "cm";
export interface Crate {
  id: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  color: string;
  opacity: number; // 0‑1
  label: string;
  stackTarget: "floor" | string; // floor or id of crate it sits on
}

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

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
// Main component
// ────────────────────────────────────────────────────────────────────────────────

export default function App() {
  // ─── state ───────────────────────────────────────────────────────────────────
  const [crates, setCrates] = useState<Crate[]>([newCrate()]);
  const [history, setHistory] = useState<Crate[][]>([]);

  const pushHistory = useCallback((prev: Crate[]) => {
    // keep max 30 steps
    setHistory((h) => [...h.slice(-29), JSON.parse(JSON.stringify(prev))]);
  }, []);

  // ─── CRUD helpers ────────────────────────────────────────────────────────────
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

  // ─── simple heavy‑first + alternating floor placement ────────────────────────
  const placedCrates = useMemo(() => {
    // sort heavy→light but preserve original if same weight
    const sorted = [...crates].sort((a, b) => b.weight - a.weight);
    const placed: (Crate & { x: number; y: number; z: number })[] = [];
    let nextXLeft = 0;
    let nextXRight = 0;
    const gap = 0.05; // small visual gap
    sorted.forEach((c, i) => {
      const side = i % 2 === 0 ? "left" : "right";
      const x = side === "left" ? -nextXLeft - c.width / 2 : nextXRight + c.width / 2;
      if (side === "left") nextXLeft += c.width + gap; else nextXRight += c.width + gap;
      placed.push({ ...c, x, y: c.height / 2, z: 0 });
    });
    return placed;
  }, [crates]);

  // truck dimensions (simple constants for demo)
  const truck = { length: 10, width: 2.5, height: 2.6 };

  // ─── scene ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex" }}>
      {/* sidebar */}
      <aside style={{ width: 300, padding: 10, fontFamily: "sans-serif", fontSize: 14 }}>
        <button style={{ width: "100%", marginBottom: 6 }} disabled={!history.length} onClick={undo}>
          ⤺ Undo
        </button>
        <h3>Crates</h3>
        {crates.map((c, idx) => (
          <details key={c.id} style={{ marginBottom: 4 }}>
            <summary>
              Crate {idx + 1} ({c.length}×{c.width}×{c.height}m)
            </summary>
            <p>
              L <input type="number" min={0.1} step={0.1} value={c.length} style={{ width: 60 }}
                onChange={(e) => updCrate(c.id, { length: +e.target.value })} /> m
            </p>
            <p>
              W <input type="number" min={0.1} step={0.1} value={c.width} style={{ width: 60 }}
                onChange={(e) => updCrate(c.id, { width: +e.target.value })} /> m
            </p>
            <p>
              H <input type="number" min={0.1} step={0.1} value={c.height} style={{ width: 60 }}
                onChange={(e) => updCrate(c.id, { height: +e.target.value })} /> m
            </p>
            <p>
              Wt <input type="number" min={1} value={c.weight} style={{ width: 70 }}
                onChange={(e) => updCrate(c.id, { weight: +e.target.value })} /> kg
            </p>
            <p>
              Label <input value={c.label} style={{ width: 120 }}
                onChange={(e) => updCrate(c.id, { label: e.target.value })} />
            </p>
            <p>
              Colour <input type="color" value={c.color} onChange={(e) => updCrate(c.id, { color: e.target.value })} />
              &nbsp; Opacity <input type="range" min={0.05} max={1} step={0.05} value={c.opacity}
                onChange={(e) => updCrate(c.id, { opacity: +e.target.value })} />
            </p>
            <button onClick={() => delCrate(c.id)}>🗑 Delete</button>
          </details>
        ))}
        <button style={{ width: "100%", marginTop: 8 }} onClick={addCrate}>+ Add crate</button>
      </aside>

      {/* 3D canvas */}
      <Canvas camera={{ position: [8, 6, 8], fov: 50 }} shadows>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={0.7} castShadow />

        {/* truck deck */}
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[truck.length, truck.width]} />
          <meshStandardMaterial color="#333" />
        </mesh>

        {/* front panel */}
        <mesh position={[0, truck.height / 2, 0]} rotation={[0, 0, 0]}>
          <planeGeometry args={[truck.width, truck.height]} />
          <meshStandardMaterial color="#555" opacity={0.7} transparent />
        </mesh>

        {/* crates */}
        {placedCrates.map((c) => (
          <group key={c.id} position={[c.x, c.y, c.z]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[c.length, c.height, c.width]} />
              <meshStandardMaterial color={c.color} transparent opacity={clamp(c.opacity, 0.05, 1)} />
            </mesh>
            {c.label && (
              <Text
                position={[0, c.height / 2 + 0.01, 0]}
                fontSize={0.25}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                {c.label}
              </Text>
            )}
          </group>
        ))}

        {/* orbit controls */}
        <OrbitControls makeDefault />

        {/* view cube / gizmo */}
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport axisColors={["#ff4d4d", "#4dff4d", "#4d4dff"]} labelColor="#bbbbbb" />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
