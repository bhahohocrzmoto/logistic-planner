import { ChangeEvent } from "react";
import type { Crate } from "../types";

type Props = {
  crate: Crate;
  update: (id: string, partial: Partial<Crate>) => void;
  remove: (id: string) => void;
};

const line = { display: "flex", alignItems: "center", gap: ".25rem" };

export default function CrateForm({ crate, update, remove }: Props) {
  const on = (k: keyof Crate) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    update(crate.id, { [k]: e.target.type === "number" ? +e.target.value : e.target.value } as any);

  return (
    <details style={{ marginBottom: ".5rem" }}>
      <summary>{crate.label || `Crate ${crate.id}`}</summary>

      {/* geometry ------------------------------------------------------ */}
      <div style={line}>
        L <input type="number" value={crate.length} onChange={on("length")} style={{ width: 48 }} />
        W <input type="number" value={crate.width} onChange={on("width")} style={{ width: 48 }} />
        H <input type="number" value={crate.height} onChange={on("height")} style={{ width: 48 }} />
        unit m
      </div>

      {/* weight -------------------------------------------------------- */}
      <div style={line}>
        Wt <input type="number" value={crate.weight} onChange={on("weight")} style={{ width: 64 }} /> kg
      </div>

      {/* label --------------------------------------------------------- */}
      <div style={line}>
        Label <input value={crate.label ?? ""} onChange={on("label")} style={{ width: 120 }} />
      </div>

      {/* colour / opacity --------------------------------------------- */}
      <div style={line}>
        <input type="color" value={crate.color} onChange={on("color")} />
        Opacity&nbsp;
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={crate.opacity}
          onChange={on("opacity")}
        />
      </div>

      <button onClick={() => remove(crate.id)}>🗑 Delete</button>
    </details>
  );
}
