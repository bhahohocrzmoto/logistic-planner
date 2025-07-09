import React from "react";
import { Html } from "@react-three/drei";

const faces: { label: string; rot: [number, number, number] }[] = [
  { label: "TOP",    rot: [-Math.PI / 2, 0, 0] },
  { label: "FRONT",  rot: [0, 0, 0] },
  { label: "LEFT",   rot: [0, Math.PI / 2, 0] },
  { label: "RIGHT",  rot: [0, -Math.PI / 2, 0] },
  { label: "BACK",   rot: [0, Math.PI, 0] },
  { label: "BOTTOM", rot: [ Math.PI / 2, 0, 0] },
];

export default function ViewCube() {
  return (
    <group position={[0, 0, 0]}>
      {/* render faces as clickable HTML overlays */}
      {faces.map((f, i) => (
        <Html
          key={i}
          position={[
            1.1 * Math.sign(f.rot[1] || f.rot[2]), // spread a bit from origin
            1.1 * Math.sign(f.rot[0]),
            1.1 * (f.rot[1] === 0 && f.rot[2] === 0 ? -1 : 1),
          ]}
          transform
          occlude="blending"
          style={{
            width: 32,
            height: 32,
            background: "#fff",
            border: "1px solid #999",
            borderRadius: 4,
            fontSize: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            userSelect: "none",
          }}
          onClick={() =>
            // When clicked, align the default camera to the cube face
            document
              .querySelector("canvas")!
              .dispatchEvent(
                new CustomEvent("viewcube-click", { detail: f.rot })
              )
          }
        >
          {f.label}
        </Html>
      ))}
    </group>
  );
}
