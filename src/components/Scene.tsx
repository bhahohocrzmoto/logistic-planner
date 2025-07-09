import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stats } from "@react-three/drei";
import { Suspense, memo } from "react";
import type { Crate, Truck } from "../types";
import { CrateMesh, Floor, FrontPlate } from "./helpers";

interface Props {
  truck: Truck;
  crates: Crate[];
}

const Scene: React.FC<Props> = ({ truck, crates }) => (
  <Canvas camera={{ position: [8, 7, 8], fov: 40 }}>
    {/* let Drei suspend while textures/geometries load */}
    <Suspense fallback={null}>
      {/* lights */}
      <hemisphereLight intensity={0.4} />
      <directionalLight position={[5, 10, 7]} intensity={0.8} castShadow />

      {/* floor & reference plates */}
      <Floor truck={truck} />
      <FrontPlate truck={truck} />

      {/* crates */}
      {crates.map(c => (
        <CrateMesh key={c.id} crate={c} />
      ))}
    </Suspense>

    {/* helpers */}
    <OrbitControls makeDefault enableDamping />
    <Stats />
  </Canvas>
);

export default memo(Scene);
