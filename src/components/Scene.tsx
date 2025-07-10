/* src/components/Scene.tsx */
import React, { Suspense, memo } from "react";
import type { Crate, Truck } from "../types";

import { CrateMesh, Floor, FrontPlate } from "./helpers";

type Props = {
  truck: Truck;
  crates: Crate[];
};

/*  NOTE:
    - <Canvas> is created in App.tsx, so Scene only returns scene contents.
*/
const Scene: React.FC<Props> = ({ truck, crates }) => (
  <Suspense fallback={null}>
    {/* lighting */}
    <hemisphereLight intensity={0.4} />
    <directionalLight position={[5, 10, 7]} intensity={0.8} castShadow />

    {/* ground plane & reference plate */}
    <Floor truck={truck} />
    <FrontPlate truck={truck} />

    {/* all crates */}
    {crates.map(crate => (
      <CrateMesh key={crate.id} crate={crate} />
    ))}
  </Suspense>
);

export default memo(Scene);
