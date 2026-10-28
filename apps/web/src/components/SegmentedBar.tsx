import type { PartView } from "../lib/accounts";

const PALETTE = ["#2dd4bf", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#34d399"];
const FALLBACK = "#2dd4bf";

export function SegmentedBar({
  parts,
  height = 10,
  animated = false,
}: {
  parts: PartView[];
  height?: number;
  animated?: boolean;
}) {
  const total = parts.reduce((sum, part) => sum + part.percentageBp, 0);
  const label = parts.map((part) => `${part.name} ${part.percentageBp / 100}%`).join(", ");

  return (
    <div
      className={`seg-bar ${animated ? "seg-bar-animated" : ""}`.trim()}
      style={{ height }}
      role="img"
      aria-label={label || "No parts"}
    >
      {parts.map((part, index) => (
        <span
          key={part.id}
          className="seg"
          style={{
            width: total > 0 ? `${(part.percentageBp / total) * 100}%` : "0%",
            background: PALETTE[index % PALETTE.length] ?? FALLBACK,
          }}
        />
      ))}
    </div>
  );
}
