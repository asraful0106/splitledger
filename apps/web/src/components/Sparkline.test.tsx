import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sparkline } from "./Sparkline";

const points = [
  { bucket: "2026-08", inflowMinor: "10000", outflowMinor: "2000", netMinor: "8000" },
  { bucket: "2026-09", inflowMinor: "5000", outflowMinor: "1000", netMinor: "4000" },
  { bucket: "2026-10", inflowMinor: "2000", outflowMinor: "1000", netMinor: "1000" },
];

describe("Sparkline", () => {
  it("renders a decorative line for a series", () => {
    const { container } = render(<Sparkline points={points} />);
    const svg = container.querySelector(".sparkline");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });

  it("needs at least two points", () => {
    const { container } = render(<Sparkline points={points.slice(0, 1)} />);
    expect(container.querySelector(".sparkline")).toBeNull();
  });
});
