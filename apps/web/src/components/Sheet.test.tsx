import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet";

// jsdom's PointerEvent has no clientY, so drags are simulated with a MouseEvent that
// carries the pointer event type — React dispatches it to the pointer handlers.
function dragPointer(element: Element, type: string, clientY: number): void {
  fireEvent(
    element,
    new MouseEvent(type, { bubbles: true, cancelable: true, clientY, buttons: 1 }),
  );
}

// jsdom lays nothing out, so the panel needs a height for the dismiss threshold to mean anything.
function stubPanelHeight(value: number): void {
  const panel = document.querySelector(".sheet-panel");
  if (!panel) throw new Error("panel missing");
  Object.defineProperty(panel, "offsetHeight", { value, configurable: true });
}

function Harness({ onClose = () => undefined }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        title="Deposit"
      >
        <input aria-label="Amount" />
      </Sheet>
    </div>
  );
}

describe("Sheet", () => {
  it("renders nothing until opened", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens as a dialog and moves focus inside", async () => {
    const ui = userEvent.setup();
    render(<Harness />);

    await ui.click(screen.getByRole("button", { name: "Open sheet" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Deposit")).toBeInTheDocument();

    const amount = screen.getByLabelText("Amount");
    await vi.waitFor(() => expect(amount).toHaveFocus());
  });

  it("closes on Escape and on a scrim click", async () => {
    const onClose = vi.fn();
    const ui = userEvent.setup();
    render(<Harness onClose={onClose} />);

    await ui.click(screen.getByRole("button", { name: "Open sheet" }));
    await ui.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await ui.click(screen.getByRole("button", { name: "Open sheet" }));
    const scrim = document.querySelector(".sheet-scrim");
    if (!scrim) throw new Error("scrim missing");
    await ui.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("dismisses when dragged past the threshold", async () => {
    const onClose = vi.fn();
    const ui = userEvent.setup();
    render(<Harness onClose={onClose} />);

    await ui.click(screen.getByRole("button", { name: "Open sheet" }));
    const handle = document.querySelector(".sheet-handle");
    if (!handle) throw new Error("handle missing");
    stubPanelHeight(400);

    dragPointer(handle, "pointerdown", 0);
    dragPointer(handle, "pointermove", 320);
    dragPointer(handle, "pointerup", 320);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("springs back when the drag is small", async () => {
    const onClose = vi.fn();
    const ui = userEvent.setup();
    render(<Harness onClose={onClose} />);

    await ui.click(screen.getByRole("button", { name: "Open sheet" }));
    const handle = document.querySelector(".sheet-handle");
    if (!handle) throw new Error("handle missing");
    stubPanelHeight(400);

    dragPointer(handle, "pointerdown", 0);
    dragPointer(handle, "pointermove", 4);
    dragPointer(handle, "pointerup", 4);

    expect(onClose).not.toHaveBeenCalled();
  });
});
