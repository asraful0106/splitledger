import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SegmentedBar } from "./SegmentedBar";

const parts = [
  { id: "p1", name: "Spending", percentageBp: 6000, sortOrder: 0, balanceMinor: "0", lowBalanceThresholdMinor: null },
  { id: "p2", name: "Savings", percentageBp: 2500, sortOrder: 1, balanceMinor: "0", lowBalanceThresholdMinor: null },
  { id: "p3", name: "Tax", percentageBp: 1500, sortOrder: 2, balanceMinor: "0", lowBalanceThresholdMinor: null },
];

describe("SegmentedBar", () => {
  it("describes the split for assistive tech", () => {
    render(<SegmentedBar parts={parts} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Spending 60%, Savings 25%, Tax 15%",
    );
  });

  it("renders one segment per part", () => {
    const { container } = render(<SegmentedBar parts={parts} />);
    expect(container.querySelectorAll(".seg")).toHaveLength(3);
  });

  it("handles an empty account", () => {
    render(<SegmentedBar parts={[]} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("No parts");
  });
});
