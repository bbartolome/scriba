// PROTOTYPE, throwaway. Pointer-based external drag: works for mouse AND touch.
// HTML5 drag-and-drop never fires on touch, so the spike does not use it.
export function startEntityDrag(ev: PointerEvent, onDrop: (x: number, y: number) => void) {
  ev.preventDefault();
  const up = (e: PointerEvent) => {
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    onDrop(e.clientX, e.clientY);
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// Resolves the port element under a point. Works for SVG and HTML because it walks up with closest().
export function portAt(x: number, y: number): string | undefined {
  const el = document.elementFromPoint(x, y);
  return (el?.closest('[data-port]') as HTMLElement | null)?.dataset['port'];
}
