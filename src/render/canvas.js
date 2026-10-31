/**
 * Keeps a canvas sized to its container at the device's pixel ratio, so
 * lines stay crisp on high-DPI screens. Drawing code works in CSS pixels:
 * the context transform is set so 1 unit = 1 CSS pixel.
 */
export function setupCanvas(canvas, onResize) {
  const ctx = canvas.getContext("2d");
  const view = { ctx, width: 0, height: 0, dpr: 1 };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width === view.width && height === view.height && dpr === view.dpr) return;
    view.width = width;
    view.height = height;
    view.dpr = dpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onResize?.(view);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener("resize", resize);
  // Moving the window to a screen with a different pixel ratio.
  let mql = null;
  const watchDpr = () => {
    mql?.removeEventListener("change", onDpr);
    mql = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mql.addEventListener("change", onDpr);
  };
  function onDpr() {
    resize();
    watchDpr();
  }
  watchDpr();
  resize();
  return view;
}
