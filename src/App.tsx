/* ────────────────────────────────────────────────────────────────────────────────
   App.tsx  – 3-D truck-loading planner
   ───────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stats } from "@react-three/drei";

import Scene      from "./components/Scene";
import CrateForm  from "./components/CrateForm";
import ViewCube   from "./components/ViewCube";

import useUndo from "./hooks/useUndo";
import "./styles.css";

/* ─────────────────────────── types ─────────────────────────── */
export type Unit = "m" | "cm";

export interface Crate {
  id: number;
  l: number;
  w: number;
  h: number;
  weight: number;
  color: string;
  opacity: number;     // 0 – 1
  label: string;
  stack: "floor" | number;   // “floor” or id of crate it sits on
  pos: [number, number, number]; // set by algorithm (x, y, z)
}

interface Truck {
  h: number;
  l: number;
  w: number;
  maxLoad: number;
  unit: Unit;
}

/* ───────────────────────── constants ───────────────────────── */
const DEFAULT_TRUCK: Truck = {
  h: 2.6,
  l: 10,
  w: 2.5,
  maxLoad: 1_000,
  unit: "m",
};

let idCounter = 0;

/* ───────────────────────── component ───────────────────────── */
const App: React.FC = () => {
  /* state + undo stack */
  const [truck] = React.useState<Truck>(DEFAULT_TRUCK);
  const [crates, setCrates, { undo, canUndo, push }] = useUndo<Crate[]>([]);

  /* helpers */
  const totalWeight = useMemo(
    () => crates.reduce((s, c) => s + c.weight, 0),
    [crates]
  );

  const addCrate = () => {
    push(crates);
    setCrates([
      ...crates,
      {
        id: ++idCounter,
        l: 1,
        w: 1,
        h: 1,
        weight: 50,
        color: "#1565c0",
        opacity: 0.8,
        label: "",
        stack: "floor",
        pos: [0, 0, 0],
      },
    ]);
  };

  const updateCrate = (id: number, patch: Partial<Crate>) => {
    push(crates);
    setCrates(crates.map(c => (c.id === id ? { ...c, ...patch } : c)));
  };

  const deleteCrate = (id: number) => {
    push(crates);
    setCrates(crates.filter(c => c.id !== id));
  };

  /* ─ placement algorithm ─────────────────────────────────────
     - Alternates left/right with heaviest crates closest to the cab
     - Keeps running whenever crate list changes                            */
  useEffect(() => {
    if (crates.length === 0) return;

    const sorted = [...crates].sort((a, b) => b.weight - a.weight);
    const gap = 0.05;          // 5 cm gap between crates

    let leftEdge  = 0;
    let rightEdge = 0;

    const placed: Crate[] = [];

    sorted.forEach((crate, i) => {
      const isLeft = i % 2 === 0;

      const x = isLeft
        ? -crate.w / 2 - leftEdge - gap
        :  crate.w / 2 + rightEdge + gap;

      // heavier crates get lower z (closer to cab)
      const z = -(placed.reduce((s, p) => Math.max(s, -p.pos[2] + p.l), 0));

      placed.push({ ...crate, pos: [x, 0, z] });

      if (isLeft)  leftEdge  += crate.w + gap;
      else         rightEdge += crate.w + gap;
    });

    // write positions back matching original order
    setCrates(prev =>
      prev.map(c => placed.find(p => p.id === c.id) ?? c)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crates.length]);

  /* ───────────────────────── render ───────────────────────── */
  return (
    <div className="app">
      {/* sidebar */}
      <aside className="sidebar">
        <button className="undo-btn" onClick={undo} disabled={!canUndo}>
          ↶ Undo
        </button>

        {crates.map(c => (
          <CrateForm
            key={c.id}
            crate={c}
            onChange={patch => updateCrate(c.id, patch)}
            onDelete={() => deleteCrate(c.id)}
          />
        ))}

        <button className="add-btn" onClick={addCrate}>＋ Add crate</button>

        <hr />
        <p className="total">
          Total weight {totalWeight} kg / {truck.maxLoad} kg
        </p>
      </aside>

      {/* 3-D viewport */}
      <Canvas shadows camera={{ position: [8, 6, 10], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />

        <Scene truck={truck} crates={crates} />
        <ViewCube />

        <OrbitControls makeDefault enablePan enableRotate enableZoom />
        <Stats />
      </Canvas>
    </div>
  );
};

export default App;
