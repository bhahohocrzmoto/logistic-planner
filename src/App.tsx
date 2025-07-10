/* ────────────────────────────────────────────────────────────
   src/App.tsx
   ─ single-file drop-in replacement
────────────────────────────────────────────────────────────── */
import React, { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stats } from "@react-three/drei";

import Scene      from "./components/Scene";
import CrateForm  from "./components/CrateForm";
import ViewCube   from "./components/ViewCube";

import useUndo    from "./hooks/useUndo";
import "./styles.css";

import type { Crate, Truck } from "./types";

/* ───── default truck ───── */
const DEFAULT_TRUCK: Truck = {
  h: 2.6,
  l: 10,
  w: 2.5,
  maxLoad: 1_000,
  unit: "m",
};

let idCounter = 0;

/* ───────────────── component ───────────────── */
const App: React.FC = () => {
  /* state + undo */
  const [truck, setTruck] = useState<Truck>(DEFAULT_TRUCK);
  const [crates, setCrates, { undo, canUndo, push }] = useUndo<Crate[]>([]);

  /* derived total weight */
  const totalWeight = useMemo(
    () => crates.reduce((s, c) => s + c.weight, 0),
    [crates]
  );

  /* CRUD helpers */
  const addCrate = () => {
    push(crates);
    setCrates([
      ...crates,
      {
        id: ++idCounter,
        l: 1, w: 1, h: 1,
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

  /* ─── placement algorithm ───────────────────────────────────
     • sort heaviest → front
     • alternate left / right lanes, centred about z-axis
     • maintain a small gap (5 cm) between crates               */
  useEffect(() => {
    if (!crates.length) return;

    const sorted = [...crates].sort((a, b) => b.weight - a.weight);
    const gap   = 0.05;                 // 5 cm
    let nextZ   = 0;
    let left    = true;                 // alternate lanes

    const placed = sorted.map(crate => {
      const laneX = (truck.w - crate.w) / 2 * (left ? -1 : 1);
      const pos: Crate["pos"] = [laneX, 0, -nextZ];
      left = !left;
      nextZ += crate.l + gap;
      return { ...crate, pos };
    });

    setCrates(prev => prev.map(c => placed.find(p => p.id === c.id) ?? c));
  }, [crates.length, truck.w, truck.l]);   // recalc on size or count change

  /* ─── render ──────────────────────────────────────────────── */
  return (
    <div className="app">
      {/* side-panel */}
      <aside className="sidebar">
        <button className="undo-btn" onClick={undo} disabled={!canUndo}>
          ~ Undo
        </button>

        {crates.map(c => (
          <CrateForm
            key={c.id}
            crate={c}
            onChange={patch => updateCrate(c.id, patch)}
            onDelete={() => deleteCrate(c.id)}
          />
        ))}

        <button className="add-btn" onClick={addCrate}>+ Add crate</button>

        <hr />
        <p className="total">
          Total weight: {totalWeight} kg / {truck.maxLoad} kg
        </p>
      </aside>

      {/* 3-D viewport */}
      <Canvas shadows camera={{ position: [8, 6, 10], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={0.9} castShadow />
        <Scene truck={truck} crates={crates} />
        <ViewCube />
        <OrbitControls makeDefault enablePan enableZoom enableRotate />
        {/* ⚠ remove <Stats /> in prod if you don’t want FPS panel */}
        {/* <Stats /> */}
      </Canvas>
    </div>
  );
};

export default App;
