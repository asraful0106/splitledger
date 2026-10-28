import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const DISMISS_DISTANCE_RATIO = 0.25;
const DISMISS_VELOCITY = 0.11;
const MIN_DRAG_DISTANCE = 8;
const EXIT_MS = 260;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startY: number; startedAt: number; active: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [isOpen, setIsOpen] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setIsOpen(true);
      return;
    }
    setIsOpen(false);
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, mounted, onClose]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion() || !panelRef.current) {
      return;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a progressive enhancement; dragging still works without it.
    }
    dragRef.current = { startY: event.clientY, startedAt: performance.now(), active: true };
    setDragging(true);
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag?.active || !panel) {
      return;
    }

    const height = panel.offsetHeight || 1;
    let offset = event.clientY - drag.startY;
    if (offset < 0) {
      offset = (offset * height * 0.55) / (height + 0.55 * Math.abs(offset));
    }

    panel.style.transform = `translate3d(0, ${offset}px, 0)`;
    if (scrimRef.current) {
      scrimRef.current.style.opacity = String(Math.max(0, 1 - offset / height));
    }
  }, []);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const panel = panelRef.current;
      if (!drag?.active || !panel) {
        return;
      }
      drag.active = false;
      setDragging(false);

      const offset = event.clientY - drag.startY;
      const elapsed = Math.max(1, performance.now() - drag.startedAt);
      const velocity = offset / elapsed;
      const height = panel.offsetHeight || 1;

      panel.style.transform = "";
      if (scrimRef.current) {
        scrimRef.current.style.opacity = "";
      }

      if (
        offset > height * DISMISS_DISTANCE_RATIO ||
        (offset > MIN_DRAG_DISTANCE && velocity > DISMISS_VELOCITY)
      ) {
        onClose();
      }
    },
    [onClose],
  );

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="sheet-root" data-state={isOpen ? "open" : "closed"}>
      <div ref={scrimRef} className="sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={`sheet-panel ${dragging ? "sheet-panel-dragging" : ""}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div
          className="sheet-handle"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <span className="sheet-handle-bar" />
        </div>
        <h2 id={titleId} className="sheet-title">
          {title}
        </h2>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
