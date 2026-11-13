/**
 * The network's history, one frame per day plus one at the end, for the
 * timelapse on the game-over card. Frames are plain data and only ever
 * read by the UI, so they're left out of snapshots.
 */

/** Add a frame for the network as it is now. */
export function recordFrame(world) {
  world.history.push({
    day: world.day,
    sites: world.sites.map((s) => ({ x: s.x, y: s.y, type: s.type, grown: s.grown })),
    links: world.links.map((l) => ({ line: l.line, backbone: l.backbone, path: l.path.map((p) => ({ x: p.x, y: p.y })) })),
  });
}
