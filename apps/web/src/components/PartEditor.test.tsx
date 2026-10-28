import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PartEditor } from "./PartEditor";

describe("PartEditor", () => {
  it("allows saving when parts total 100%", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PartEditor
        initialParts={[{ id: "p1", name: "General", percentageBp: 10000, sortOrder: 0, balanceMinor: "0", lowBalanceThresholdMinor: null }]}
        onSubmit={onSubmit}
        saving={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Save split" })).toBeEnabled();
    expect(screen.getByText("Parts total 100%")).toBeInTheDocument();
  });

  it("blocks saving and shows the shortfall when parts do not total 100%", async () => {
    const ui = userEvent.setup();
    render(
      <PartEditor
        initialParts={[{ id: "p1", name: "General", percentageBp: 10000, sortOrder: 0, balanceMinor: "0", lowBalanceThresholdMinor: null }]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        saving={false}
      />,
    );

    const percentage = screen.getByLabelText("Part 1 percentage");
    await ui.clear(percentage);
    await ui.type(percentage, "90");

    expect(await screen.findByText("10% left to assign")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save split" })).toBeDisabled();
  });

  it("submits the split with ids preserved", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const ui = userEvent.setup();
    render(
      <PartEditor
        initialParts={[{ id: "a1", name: "Spending", percentageBp: 6000, sortOrder: 0, balanceMinor: "0", lowBalanceThresholdMinor: null }]}
        onSubmit={onSubmit}
        saving={false}
      />,
    );

    const percentage = screen.getByLabelText("Part 1 percentage");
    await ui.clear(percentage);
    await ui.type(percentage, "100");
    await ui.click(screen.getByRole("button", { name: "Save split" }));

    expect(onSubmit).toHaveBeenCalledWith([
      { id: "a1", name: "Spending", percentageBp: 10000, sortOrder: 0 },
    ]);
  });
});
