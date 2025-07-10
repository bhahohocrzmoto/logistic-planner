/* ──────────────────────────────────────────────────────────
   src/components/helpers.tsx   – updated
─────────────────────────────────────────────────────────── */
import { useMemo } from "react";
import { Box, Text } from "@react-three/drei";
import type { Crate, Truck } from "../types";

/* ─ floor (truck bed) ─────────────────────────────── */
export const Floor: React.FC<{ truck: Truck }> = ({ truck }) => {
  const { l, w } = truck;                     // length, width
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[l / 2, 0, w / 2]} receiveShadow>
      <planeGeometry args={[l, w]} />
      <meshStandardMaterial color="#222" />
    </mesh>
  );
};

/* ─ grey plate that marks the front (cab) ─────────── */
export const FrontPlate: React.FC<{ truck: Truck }> = ({ truck }) => {
  const { w } = truck;
  return (
    <mesh
      position={[0, 1.3, w / 2]}        /* centred, 1.3 m up */
      castShadow
      receiveShadow
    >
      <planeGeometry args={[w, 2.6]} /> /* same height as truck */
      <meshStandardMaterial color="#555" side={2 /* DoubleSide */} />
    </mesh>
  );
};

/* ─ individual crate mesh with optional label ─────── */
export const CrateMesh: React.FC<{ crate: Crate }> = ({ crate }) => {
  const { l, w, h, color, opacity, pos, label } = crate;

  /* mutable size array to satisfy drei’s <Box>  */
  const size = useMemo<[number, number, number]>(() => [l, h, w], [l, h, w]);

  return (
    <group position={[pos[0] + l / 2, pos[1] + h / 2, pos[2] + w / 2]}>
      <Box args={size} castShadow receiveShadow>
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </Box>

      {label && (
        <Text
          position={[0, h / 2 + 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.25}
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.85}
        >
          {label}
        </Text>
      )}
    </group>
  );
};
