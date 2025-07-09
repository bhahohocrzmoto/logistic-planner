import React, { Suspense, memo } from "react";
import type { Crate, Truck } from "../App";
import { CrateMesh, Floor, FrontPlate } from "./helpers";

interface Props {
  truck: Truck;
  crates: Crate[];
}

/*  NOTE:
    - **No** <Canvas> here any longer.  App.tsx already creates one.
    - Pure scene contents only (meshes, lights, helpers, …)           */
const Scene: React.FC<Props> = ({ truck, crates }) => (
  <Suspense fallback={null}>
    {/* lights that require to live inside the Canvas */}
    <hemisphereLight intensity={0.4} />
    <directionalLight position={[5, 10, 7]} intensity={0.8} castShadow />

    {/* floor & front reference plate */}
    <Floor truck={truck} />
    <FrontPlate truck={truck} />

    {/* crates */}
    {crates.map(c => (
      <CrateMesh key={c.id} crate={c} />
    ))}
  </Suspense>
);

export default memo(Scene);
