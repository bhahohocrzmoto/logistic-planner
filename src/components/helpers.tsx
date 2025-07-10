/* src/components/helpers.tsx */
import { useMemo } from "react";
import { Box, Text } from "@react-three/drei";
import type { Crate, Truck } from "../types";

/* ───────────────────────── floor (truck deck) ───────────────────────── */
export const Floor: React.FC<{ truck: Truck }> = ({ truck }) => {
  const { l: length, w: width } = truck;                // ← use same keys as Truck
  return (
    <mesh
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
      // shift so (0,0,0) is rear-left corner in Scene
      position={[length / 2, 0, width / 2]}
    >
      <planeGeometry args={[length, width]} />
      <meshStandardMaterial color="#222" />
    </mesh>
  );
};

/* ─────────────── grey plate that marks the truck’s front ────────────── */
export const FrontPlate: React.FC<{ truck: Truck }> = ({ truck }) => {
  const { h: height, w: width } = truck;
  // front wall sits at x = 0 (rear-left coordinate frame), spanning full width
  return (
    <mesh
      position={[0, height / 2, width / 2]}
      rotation={[0, 0, 0]}
      castShadow
      receiveShadow
    >
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial color="#555" />
    </mesh>
  );
};

/* ───────────────────────── single crate mesh ────────────────────────── */
export const CrateMesh: React.FC<{ crate: Crate }> = ({ crate }) => {
  const { l, w, h, color, opacity, label, pos } = crate;
  const [x, y, z] = pos;                                // pos is crate’s back-left-bottom corner

  // size of the box
  const args = useMemo<[number, number, number]>(() => [l, h, w], [l, h, w]);

  return (
    <group position={[x + l / 2, y + h / 2, z + w / 2]}>
      <Box args={args} castShadow receiveShadow>
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </Box>

      {/* optional label on top face */}
      {label && (
        <Text
          position={[0, h / 2 + 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.25}
          anchorX="center"
          anchorY="middle"
        >
          {label}
        </Text>
      )}
    </group>
  );
};
