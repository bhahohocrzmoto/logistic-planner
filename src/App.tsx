import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stats } from "@react-three/drei";
import Scene from "./components/Scene";
import CrateForm from "./components/CrateForm";
import ViewCube from "./components/ViewCube";
import useUndo from "./hooks/useUndo";
import "./styles.css";

/**
 * ────────────────────────────────────────────────────────────────────────────────
 *  TYPES
 * ────────────────────────────────────────────────────────────────────────────────
 */
export type Unit = "m" | "cm";
export interface Crate {
  id: number;
  l: number;
  w: number;
  h: number;
  weight: number;
  color: string;
  opacity: number; // 0–1
  label: string;
  stack: "floor" | number; // "floor" or id of crate it sits on
  /**
   * Calculated 3‑D position – set by the placement algorithm and **not** edited
   * directly in the form.
   */
  pos: [number, number, number];
}

interface Truck {
  h: number;
  l: number;
  w: number;
  maxLoad: number;
  unit: Unit;
}

/**
 * ────────────────────────────────────────────────────────────────────────────────
 *  CONSTANTS
 * ────────────────────────────────────────────────────────────────────────────────
 */
const DEFAULT_TRUCK: Truck = {
  h: 2.6,
  l: 10,
  w: 2.5,
  maxLoad: 1_000,
  unit: "m",
};

let idCounter = 0;

/**
 * ────────────────────────────────────────────────────────────────────────────────
 *  COMPONENT
 * ────────────────────────────────────────────────────────────────────────────────
 */
const App: React.FC = () => {
  /**
   * STATE & UNDO STACK
   */
  const [truck, setTruck] = useState<Truck>(DEFAULT_TRUCK);
  const [crates, setCrates, { undo, canUndo, push }] = useUndo<Crate[]>([]);

  /**
   * ─── helpers ──────────────────────────────────────────────────────────────
   */
  const totalWeight = useMemo(() => crates.reduce((s, c) => s + c.weight, 0), [crates]);

  const addCrate = () => {
    const newCrate: Crate = {
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
    };
    push(crates); // save previous state for undo
    setCrates([...crates, newCrate]);
  };

  const updateCrate = (id: number, patch: Partial<Crate>) => {
    push(crates);
    setCrates(crates.map(c => (c.id === id ? { ...c, ...patch } : c)));
  };

  const deleteCrate = (id: number) => {
    push(crates);
    setCrates(crates.filter(c => c.id !== id));
  };

  /**
   * PLACEMENT ALGORITHM  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░■
   * Weighted alternating left/right & heaviest‑to‑front strategy.
   * Runs whenever crates or truck dims change.
   */
  useEffect(() => {
    const sorted = [...crates].sort((a, b) => b.weight - a.weight);

    let leftX = 0;
    let rightX = 0;
    const spacing = 0.05; // 5 cm gap between crates

    const placed: Crate[] = [];

    sorted.forEach((crate, idx) => {
      const isLeft = idx % 2 === 0;
      const xOffset = isLeft ? -crate.w / 2 - spacing + leftX : crate.w / 2 + spacing + rightX;
      const yOffset = 0; // on floor for now – stacking logic handled via stack prop
      const zOffset = idx * (crate.l + spacing);

      placed.push({ ...crate, pos: [xOffset, yOffset, -zOffset] });

      if (isLeft) {
        leftX -= crate.w + spacing;
      } else {
        rightX += crate.w + spacing;
      }
    });

    // Preserve form order but keep new positions
    setCrates(prev => prev.map(c => placed.find(p => p.id === c.id) ?? c));
  }, [crates.length, truck]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * ─── render ───────────────────────────────────────────────────────────────
   */
  return (
    <div className="app">
      {/* Sidebar */}
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

        <button className="add-btn" onClick={addCrate}>+ Add crate</button>

        <hr />
        <p className="total">Total weight: {totalWeight} kg / {truck.maxLoad} kg</p>
      </aside>

      {/* 3‑D viewport */}
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
