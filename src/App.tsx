// src/App.tsx
import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';   // ⬅️ add Edges

function Cube() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="orange" />

      {/* 👇 Draws thin black lines around every edge */}
      <Edges
        // lift the lines ever-so-slightly off the faces to avoid z-fighting
        scale={1.01}
        // lower threshold = show more edges; 15 is a nice default
        threshold={15}
        color="black"
      />
    </mesh>
  );
}

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <Cube />
        <OrbitControls />
      </Canvas>
    </div>
  );
}
