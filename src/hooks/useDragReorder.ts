import { useCallback, useEffect, useRef, useState } from "react";

// Pointer-Events drag reordering for a vertical list.
//
// Hand-rolled rather than pulling in a DnD library: this project ships six
// runtime dependencies on purpose, and a single-axis list reorder is the one
// drag case that stays small. HTML5 drag-and-drop is deliberately NOT used —
// it does nothing on touch without a polyfill, and every control on the staff
// dashboards is sized for fingers.
//
// The consumer owns persistence; this only reports "move item `from` to `to`".
// Callers must ALSO keep a keyboard path (the up/down buttons in OfferCMS) —
// dragging is mouse/touch only.

const EDGE_SCROLL_PX = 60;
const EDGE_SCROLL_SPEED = 12;
// Ignore micro-movements so a sloppy tap on the handle doesn't register as a
// zero-distance drag and fire a pointless reorder round-trip.
const DRAG_THRESHOLD_PX = 4;

interface DragState {
  from: number;
  pointerY: number;
  startY: number;
  /** Row midpoints at drag start, in document space. */
  midpoints: number[];
  moved: boolean;
}

export interface DragReorderResult {
  /** Index being dragged, or null. */
  dragIndex: number | null;
  /**
   * Gap the drop indicator should be drawn at, 0..itemCount, or null when the
   * drag is a no-op (the row would land back where it started).
   */
  insertionIndex: number | null;
  /** Pixels to translate the dragged row by, for the lifted-row transform. */
  dragOffset: number;
  /** Spread onto the grab handle. Sets touch-action so the page can't scroll instead. */
  getHandleProps: (index: number) => {
    onPointerDown: (e: React.PointerEvent) => void;
    style: { touchAction: "none" };
  };
  /** Register each row element so midpoints can be measured at drag start. */
  registerItem: (index: number, el: HTMLElement | null) => void;
}

export function useDragReorder({
  itemCount,
  onReorder,
  disabled = false,
}: {
  itemCount: number;
  onReorder: (from: number, to: number) => void;
  disabled?: boolean;
}): DragReorderResult {
  const [drag, setDrag] = useState<DragState | null>(null);
  const itemsRef = useRef<(HTMLElement | null)[]>([]);
  // Held in a ref so the drag listeners aren't rebound on every pointermove —
  // consumers typically pass a fresh closure each render.
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  // Mirrors `drag` for the window listeners, which are bound once per drag and
  // would otherwise close over a stale value.
  const dragRef = useRef<DragState | null>(null);
  const scrollRef = useRef<number | null>(null);

  const registerItem = useCallback((index: number, el: HTMLElement | null) => {
    itemsRef.current[index] = el;
  }, []);

  const stopEdgeScroll = () => {
    if (scrollRef.current !== null) {
      cancelAnimationFrame(scrollRef.current);
      scrollRef.current = null;
    }
  };

  const getHandleProps = useCallback(
    (index: number) => ({
      style: { touchAction: "none" as const },
      onPointerDown: (e: React.PointerEvent) => {
        if (disabled || e.button !== 0) return;
        e.preventDefault();

        // Measured once, at drag start: the rows don't move during the drag
        // (only the lifted one is transformed), so these stay valid.
        const midpoints = itemsRef.current.slice(0, itemCount).map((el) => {
          if (!el) return Number.POSITIVE_INFINITY;
          const r = el.getBoundingClientRect();
          return r.top + window.scrollY + r.height / 2;
        });

        const next: DragState = {
          from: index,
          startY: e.clientY + window.scrollY,
          pointerY: e.clientY + window.scrollY,
          midpoints,
          moved: false,
        };
        dragRef.current = next;
        setDrag(next);
      },
    }),
    [disabled, itemCount],
  );

  const isDragging = drag !== null;

  useEffect(() => {
    if (!isDragging) return;

    const update = (clientY: number) => {
      const current = dragRef.current;
      if (!current) return;
      const pointerY = clientY + window.scrollY;
      const next = {
        ...current,
        pointerY,
        moved: current.moved || Math.abs(pointerY - current.startY) > DRAG_THRESHOLD_PX,
      };
      dragRef.current = next;
      setDrag(next);
    };

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      update(e.clientY);

      // Auto-scroll while the pointer sits near a viewport edge, so a long
      // offer list can be dragged past the fold.
      stopEdgeScroll();
      const fromTop = e.clientY;
      const fromBottom = window.innerHeight - e.clientY;
      const delta =
        fromTop < EDGE_SCROLL_PX
          ? -EDGE_SCROLL_SPEED
          : fromBottom < EDGE_SCROLL_PX
            ? EDGE_SCROLL_SPEED
            : 0;
      if (delta !== 0) {
        const step = () => {
          window.scrollBy(0, delta);
          update(e.clientY);
          scrollRef.current = requestAnimationFrame(step);
        };
        scrollRef.current = requestAnimationFrame(step);
      }
    };

    const finish = (commit: boolean) => {
      stopEdgeScroll();
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!current || !commit || !current.moved) return;
      const to = resolveTarget(current, itemCount);
      if (to !== current.from) onReorderRef.current(current.from, to);
    };

    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      stopEdgeScroll();
    };
    // Bound once per drag session, not per pointermove: the live drag state is
    // read through dragRef and the callback through its own ref, so only the
    // start/end transition belongs in the deps.
  }, [isDragging, itemCount]);

  // Suppressed when the row would land back where it started, so a jiggle in
  // place doesn't flash an indicator promising a move that won't happen.
  const isNoop = drag ? resolveTarget(drag, itemCount) === drag.from : true;

  return {
    dragIndex: drag?.from ?? null,
    insertionIndex: drag && drag.moved && !isNoop ? resolveInsertion(drag, itemCount) : null,
    dragOffset: drag ? drag.pointerY - drag.startY : 0,
    getHandleProps,
    registerItem,
  };
}

/**
 * Which gap the pointer sits in, 0..itemCount — 0 means above the first row,
 * itemCount means below the last. Measured against the ORIGINAL layout, so this
 * is what the drop indicator should draw against.
 */
function resolveInsertion(drag: DragState, itemCount: number): number {
  let count = 0;
  for (let i = 0; i < itemCount; i++) {
    if (drag.pointerY > drag.midpoints[i]) count = i + 1;
  }
  return count;
}

/**
 * The array index to splice the dragged row back in at.
 *
 * Not the same as the insertion gap: the row is removed before being
 * re-inserted, so every gap below its old position shifts up by one. Without
 * this adjustment a downward drag lands one slot short of where it was dropped.
 */
function resolveTarget(drag: DragState, itemCount: number): number {
  const insertion = resolveInsertion(drag, itemCount);
  const target = drag.from < insertion ? insertion - 1 : insertion;
  return Math.min(Math.max(target, 0), itemCount - 1);
}
