import { useMemo } from "react";
import { Box, Text } from "@react-three/drei";
import type { Crate, Truck } from "../types";

/* ── reusable floor ───────────────────────────────────────────────────────── */
export const Floor: React.FC<{ truck: Truck }> = ({ truck }) => {
  const { l, w } = truck;                       // ← use same keys as Truck
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[l / 2, 0, 0]}                  // centred at x-mid & z = 0
      receiveShadow
    >
      <planeGeometry args={[l, w]} />
      <meshStandardMaterial color="#222" />
    </mesh>
  );
};

/* ── front-reference plate (grey) ─────────────────────────────────────────── */
export const FrontPlate: React.FC<{ truck: Truck }> = ({ truck }) => {
  const { w, h } = truck;
  return (
    <mesh
      position={[0, h / 2, 0]}                  // at front (x = 0), centred
      rotation={[0, Math.PI / 2, 0]}            // plate faces backward
      castShadow
      receiveShadow
    >
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color="#555" />
    </mesh>
  );
};

/* ── crate mesh with optional label ───────────────────────────────────────── */
export const CrateMesh: React.FC<{ crate: Crate }> = ({ crate }) => {
  const { l, h, w, color, opacity, label, pos } = crate;
  const size = useMemo(() => [l, h, w] as const, [l, h, w]);

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
