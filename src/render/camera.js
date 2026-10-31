/**
 * Maps world coordinates to screen (CSS px) and back. The map is scaled to
 * fit the space between the HUD bars. On a portrait screen a landscape map
 * is turned 90° so it fills the phone instead of a thin strip.
 * Pure math, so it can be tested without a browser.
 */
export function createCamera() {
  return { scale: 1, offsetX: 0, offsetY: 0, rotated: false, mapWidth: 1, mapHeight: 1 };
}

export function fitCamera(camera, map, viewWidth, viewHeight, insets) {
  const availW = Math.max(1, viewWidth - insets.left - insets.right);
  const availH = Math.max(1, viewHeight - insets.top - insets.bottom);
  const mapLandscape = map.width >= map.height;
  const viewLandscape = availW >= availH;
  camera.rotated = mapLandscape !== viewLandscape;
  camera.mapWidth = map.width;
  camera.mapHeight = map.height;
  const w = camera.rotated ? map.height : map.width;
  const h = camera.rotated ? map.width : map.height;
  camera.scale = Math.min(availW / w, availH / h);
  camera.offsetX = insets.left + (availW - w * camera.scale) / 2;
  camera.offsetY = insets.top + (availH - h * camera.scale) / 2;
  return camera;
}

export function worldToScreen(camera, x, y) {
  // Rotating 90° clockwise: (x, y) → (mapHeight − y, x).
  const rx = camera.rotated ? camera.mapHeight - y : x;
  const ry = camera.rotated ? x : y;
  return { x: camera.offsetX + rx * camera.scale, y: camera.offsetY + ry * camera.scale };
}

export function screenToWorld(camera, sx, sy) {
  const rx = (sx - camera.offsetX) / camera.scale;
  const ry = (sy - camera.offsetY) / camera.scale;
  return camera.rotated ? { x: ry, y: camera.mapHeight - rx } : { x: rx, y: ry };
}
