import { useMemo } from "react";
import { Box, Text } from "@react-three/drei";
import type { Triplet } from "@react-three/cannon";
import type { Crate, Truck } from "../types";

/* ─── reusable floor ─────────────────────────────────────────────────── */
export const Floor: React.FC<{ truck: Truck }> = ({ truck }) => {
  const { length, width } = truck;
  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[length / 2, 0, width / 2]}>
      <planeGeometry args={[length, width]} />
      <meshStandardMaterial color="#222" />
    </mesh>
  );
};

/* ─── grey plate that marks the front of the truck ───────────────────── */
export const FrontPlate: React.FC<{ truck: Truck }> = ({ truck }) => {
  const { width } = truck;
  return (
    <mesh
      position={[0, 1.3, width / 2]}
      rotation={[0, 0, 0]}
      castShadow
      receiveShadow
    >
      <planeGeometry args={[width, 2.6]} />
      <meshStandardMaterial color="#555" />
    </mesh>
  );
};

/* ─── crate mesh with label───────────────────────────────────────────── */
export const CrateMesh: React.FC<{ crate: Crate }> = ({ crate }) => {
  const { x, y, z, length, height, width, color, opacity, label } = crate;

  // center geometry about its origin
  const args = useMemo<Triplet>(() => [length, height, width], [length, height, width]);

  return (
    <group position={[x + length / 2, y + height / 2, z + width / 2]}>
      <Box args={args} castShadow receiveShadow>
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </Box>

      {/* optional label shown on top face */}
      {label && (
        <Text
          position={[0, height / 2 + 0.01, 0]}
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
