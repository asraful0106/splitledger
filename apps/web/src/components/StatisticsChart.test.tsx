import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StatisticsChart } from "./StatisticsChart";

const series = [
  { bucket: "2026-08", inflowMinor: "10000", outflowMinor: "2000", netMinor: "8000" },
  { bucket: "2026-09", inflowMinor: "5000", outflowMinor: "1000", netMinor: "4000" },
];

function stubRect(element: Element): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => ({
      left: 0,
      top: 0,
      width: 360,
      height: 180,
      right: 360,
      bottom: 180,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    configurable: true,
  });
}

describe("StatisticsChart", () => {
  it("renders an area and a line with an accessible summary", () => {
    const { container } = render(
      <StatisticsChart series={series} currency="BDT" granularity="month" />,
    );

    expect(screen.getByRole("img")).toHaveAccessibleName(/Net by month/);
    expect(container.querySelectorAll("path")).toHaveLength(2);
    expect(container.querySelector("linearGradient")).not.toBeNull();
  });

  it("switches the metric", async () => {
    const { container } = render(
      <StatisticsChart series={series} currency="BDT" granularity="month" />,
    );
    const linePath = container.querySelectorAll("path")[1];
    const before = linePath?.getAttribute("d");

    const ui = userEvent.setup();
    await ui.click(screen.getByRole("button", { name: "In" }));

    expect(screen.getByRole("button", { name: "In" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img")).toHaveAccessibleName(/In by month/);
    expect(container.querySelectorAll("path")[1]?.getAttribute("d")).not.toBe(before);
  });

  it("shows a tooltip for the nearest point", () => {
    render(<StatisticsChart series={series} currency="BDT" granularity="month" />);
    const svg = screen.getByRole("img");
    stubRect(svg);

    fireEvent(svg, new MouseEvent("pointermove", { bubbles: true, clientX: 200 }));

    expect(screen.getByText("2026-09")).toBeInTheDocument();
  });

  it("renders an empty state", () => {
    render(<StatisticsChart series={[]} currency="BDT" granularity="month" />);
    expect(screen.getByText("No activity in this period.")).toBeInTheDocument();
  });
});
