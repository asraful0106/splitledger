import { useState } from "react";
import { PARTS_TOTAL_BP } from "shared";
import type { AccountPartPayload, PartView } from "../lib/accounts";
import { Button } from "./Button";

interface Row {
  key: string;
  id: string | null;
  name: string;
  percentageBp: number;
}

function toRows(parts: PartView[]): Row[] {
  return parts.map((part) => ({
    key: part.id,
    id: part.id,
    name: part.name,
    percentageBp: part.percentageBp,
  }));
}

export function PartEditor({
  initialParts,
  onSubmit,
  saving,
}: {
  initialParts: PartView[];
  onSubmit: (parts: AccountPartPayload[]) => Promise<void>;
  saving: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(initialParts));

  const totalBp = rows.reduce((sum, row) => sum + row.percentageBp, 0);
  const remaining = PARTS_TOTAL_BP - totalBp;
  const namesValid = rows.every((row) => row.name.trim().length > 0);
  const canSave = rows.length > 0 && namesValid && remaining === 0 && !saving;

  const update = (key: string, patch: Partial<Row>): void => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addRow = (): void => {
    setRows((current) => [
      ...current,
      { key: crypto.randomUUID(), id: null, name: "", percentageBp: 0 },
    ]);
  };

  const removeRow = (key: string): void => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  const save = (): void => {
    const payload: AccountPartPayload[] = rows.map((row, index) => {
      const part: AccountPartPayload = {
        name: row.name.trim(),
        percentageBp: row.percentageBp,
        sortOrder: index,
      };
      if (row.id) {
        part.id = row.id;
      }
      return part;
    });
    void onSubmit(payload);
  };

  const status =
    remaining === 0
      ? "Parts total 100%"
      : remaining > 0
        ? `${remaining / 100}% left to assign`
        : `${Math.abs(remaining) / 100}% over 100%`;

  return (
    <div className="stack" style={{ gap: "0.75rem" }}>
      <div className="stack" style={{ gap: "0.5rem" }}>
        {rows.map((row, index) => (
          <div key={row.key} className="part-row">
            <input
              className="field-input"
              aria-label={`Part ${index + 1} name`}
              placeholder="Name"
              value={row.name}
              onChange={(event) => update(row.key, { name: event.target.value })}
            />
            <input
              className="field-input part-percent"
              aria-label={`Part ${index + 1} percentage`}
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.01}
              value={row.percentageBp / 100}
              onChange={(event) => {
                const percent = Number(event.target.value);
                const bp = Number.isFinite(percent) ? Math.round(percent * 100) : 0;
                update(row.key, { percentageBp: Math.max(0, Math.min(PARTS_TOTAL_BP, bp)) });
              }}
            />
            <button
              type="button"
              className="part-remove"
              aria-label={`Remove part ${index + 1}`}
              onClick={() => removeRow(row.key)}
              disabled={rows.length === 1}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div
        className={`part-total ${remaining === 0 ? "part-total-ok" : "part-total-bad"}`}
        role="status"
      >
        {status}
      </div>

      <div className="row" style={{ gap: "0.5rem" }}>
        <Button variant="ghost" type="button" onClick={addRow}>
          Add part
        </Button>
        <Button type="button" onClick={save} disabled={!canSave} loading={saving}>
          Save split
        </Button>
      </div>
    </div>
  );
}
