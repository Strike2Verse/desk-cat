// Where a character can stand: the taskbar, plus the tops of other
// windows. Shared by the cat and the cat girl overlays. `getSize` returns
// the overlay's current { width, height } in px.

export function createWorld(getSize) {
  let origin = { x: 0, y: 0 }; // top-left of our window in screen coords
  let taskbar = { id: null, y: getSize().height - 2, x0: 0, x1: getSize().width };
  let surfaces = []; // window rects, bottom -> top of the stacking order

  async function refreshMetrics() {
    try {
      const { bounds, workArea } = await window.deskCat.getScreenMetrics();
      origin = { x: bounds.x, y: bounds.y };
      const bottom = workArea.y + workArea.height - bounds.y;
      taskbar = {
        id: null,
        y: Math.min(bottom, getSize().height - 2),
        x0: workArea.x - bounds.x,
        x1: workArea.x - bounds.x + workArea.width,
      };
    } catch (_) {
      /* keep defaults */
    }
  }

  async function refreshSurfaces() {
    try {
      const list = await window.deskCat.getSurfaces();
      surfaces = list.map((w) => ({ ...w, x: w.x - origin.x, y: w.y - origin.y }));
    } catch (_) {
      surfaces = [];
    }
  }

  // A window top is only usable where no window above it in the stacking
  // order covers that spot.
  function covered(idx, x, y) {
    for (let j = idx + 1; j < surfaces.length; j++) {
      const o = surfaces[j];
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return true;
    }
    return false;
  }
  function surfaceAt(idx, x) {
    const w = surfaces[idx];
    const margin = 12;
    if (x < w.x + margin || x > w.x + w.w - margin) return null;
    if (w.y < 70 || w.y >= taskbar.y - 10) return null;
    if (covered(idx, x, w.y - 2)) return null;
    return { id: w.id, y: w.y, x0: w.x, x1: w.x + w.w };
  }

  const world = {
    get width() { return getSize().width; },
    get taskbar() { return taskbar; },
    findFloor(x, y) {
      let best = { ...taskbar };
      for (let i = 0; i < surfaces.length; i++) {
        if (surfaces[i].y < y - 2) continue;
        const s = surfaceAt(i, x);
        if (s && s.y < best.y) best = s;
      }
      return best;
    },
    surface(id, x) {
      const i = surfaces.findIndex((w) => w.id === id);
      return i < 0 ? null : surfaceAt(i, x);
    },
  };

  return {
    world,
    refreshMetrics,
    refreshSurfaces,
    get origin() { return origin; },
    get taskbar() { return taskbar; },
  };
}
