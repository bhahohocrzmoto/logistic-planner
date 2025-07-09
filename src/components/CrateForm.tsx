import { ChangeEvent, memo } from "react";
import type { Crate } from "../App";          // ←   types live in App.tsx

type Props = {
  crate: Crate;
  onChange: (patch: Partial<Crate>) => void;
  onDelete: () => void;
};

const line = { display: "flex", alignItems: "center", gap: ".35rem", margin: ".15rem 0" };

function CrateForm({ crate, onChange, onDelete }: Props) {
  // helper ­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­­►
  const change =
    (k: keyof Crate) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({
        [k]:
          e.target.type === "number"
            ? Number(e.target.value)
            : (e.target.value as any),
      });

  return (
    <details style={{ marginBottom: ".6rem" }}>
      <summary style={{ cursor: "pointer" }}>
        {crate.label || `Crate ${crate.id}`}
      </summary>

      {/* dimensions */}
      <div style={line}>
        L&nbsp;
        <input type="number" value={crate.l} onChange={change("l")} style={{ width: 48 }} />
        W&nbsp;
        <input type="number" value={crate.w} onChange={change("w")} style={{ width: 48 }} />
        H&nbsp;
        <input type="number" value={crate.h} onChange={change("h")} style={{ width: 48 }} />
        m
      </div>

      {/* weight */}
      <div style={line}>
        Wt&nbsp;
        <input type="number" value={crate.weight} onChange={change("weight")} style={{ width: 64 }} />
        kg
      </div>

      {/* label */}
      <div style={line}>
        Label&nbsp;
        <input value={crate.label} onChange={change("label")} style={{ width: 120 }} />
      </div>

      {/* colour & opacity */}
      <div style={line}>
        <input type="color" value={crate.color} onChange={change("color")} />
        Opacity&nbsp;
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={crate.opacity}
          onChange={change("opacity")}
        />
      </div>

      <button onClick={onDelete} style={{ marginTop: ".25rem" }}>
        🗑 Delete
      </button>
    </details>
  );
}

export default memo(CrateForm);
