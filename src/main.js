const { app, BrowserWindow, screen, Tray, Menu, ipcMain, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Two characters, each in its own fullscreen overlay window: the cat and
// the cat girl. Either can be shown or hidden from the tray.
const windows = { cat: null, girl: null };
let tray = null;

const OUTFITS = [
  ['miku', 'Miku'],
  ['sailor', 'Sailor uniform'],
  ['maid', 'Maid dress'],
  ['hoodie', 'Comfy hoodie'],
  ['sundress', 'Sundress'],
  ['pajamas', 'Pajamas'],
];

// Without this, launching the app while an old instance is still running
// (e.g. a previous dev run that didn't exit cleanly) silently piles up a
// second overlapping cat instead of replacing it.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---------------------------------------------------------------------------
// Settings (which characters are shown, the girl's outfit and size).

const settings = { cat: true, girl: true, outfit: 'miku', autoOutfit: true, size: 'medium' };
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    Object.assign(settings, JSON.parse(fs.readFileSync(settingsFile(), 'utf8')));
  } catch (_) {
    /* first run: defaults */
  }
}

function saveSettings() {
  fs.writeFile(settingsFile(), JSON.stringify(settings, null, 2), () => {});
}

function createWindow(kind) {
  const display = screen.getPrimaryDisplay();
  // Cover the FULL monitor, including the taskbar/panel strip, not just the
  // work area -- otherwise the overlay window physically ends before the
  // taskbar and the characters can never reach it.
  const { x, y, width } = display.bounds;
  // On Windows a topmost window covering the whole monitor is treated as a
  // fullscreen app (taskbar drops behind it, notifications are suppressed).
  // One pixel short avoids that; the taskbar's top edge is still inside.
  const height = display.bounds.height - 1;

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  windows[kind] = win;

  // Float above normal windows but stay below nothing critical; 'screen-saver'
  // level keeps it on top across virtual desktops without stealing focus.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Whole overlay starts click-through; renderer flips this on/off based on
  // whether the pointer is currently over the character's hit region.
  win.setIgnoreMouseEvents(true, { forward: true });

  win.webContents.on('did-finish-load', () => {
    if (!windows[kind]) return;
    win.webContents.send('set-enabled', settings[kind]);
  });

  win.loadFile(path.join(__dirname, 'renderer', kind === 'cat' ? 'index.html' : 'girl.html'));

  // Surface renderer errors in the terminal that launched the app.
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 3) console.error(`[${kind}] ${message} (${sourceId}:${line})`);
  });

  win.on('closed', () => {
    windows[kind] = null;
  });
}

// Renderer tells us when the pointer enters/leaves the cat's hit region so we
// can toggle click-through for the whole transparent overlay accordingly.
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setIgnoreMouseEvents(ignore, options);
});

// Right-clicking the cat pops up this menu at the cursor.
ipcMain.on('show-cat-menu', () => {
  const win = windows.cat;
  if (!win) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Pet', click: () => win.webContents.send('pet') },
    { type: 'separator' },
    { label: 'Hide Cat', click: () => setEnabled('cat', false) },
    { label: 'Quit Desk Cat', click: () => app.quit() },
  ]);
  menu.popup({ window: win });
});

// Right-clicking the cat girl.
ipcMain.on('show-girl-menu', (_event, state = {}) => {
  const win = windows.girl;
  if (!win) return;
  const send = (cmd) => () => win.webContents.send('girl-command', cmd);
  const current = state.outfit || settings.outfit;
  const menu = Menu.buildFromTemplate([
    { label: 'Head pat', click: send('pet') },
    { label: 'Wave', click: send('wave') },
    { label: 'Dance', click: send('dance') },
    { label: 'Take a walk', click: send('walk') },
    { label: 'Sit down', click: send('sit') },
    { label: 'Nap', click: send('nap') },
    { type: 'separator' },
    {
      label: 'Outfit',
      submenu: [
        ...OUTFITS.map(([id, label]) => ({
          label, type: 'radio', checked: id === current, click: send('outfit:' + id),
        })),
        { type: 'separator' },
        {
          label: 'Change outfits on her own',
          type: 'checkbox',
          checked: settings.autoOutfit,
          click: (item) => {
            settings.autoOutfit = item.checked;
            saveSettings();
            win.webContents.send('girl-settings', settings);
          },
        },
      ],
    },
    {
      label: 'Size',
      submenu: ['small', 'medium', 'large'].map((size) => ({
        label: size[0].toUpperCase() + size.slice(1),
        type: 'radio',
        checked: settings.size === size,
        click: () => {
          if (settings.size === size) return;
          settings.size = size;
          saveSettings();
          win.reload();
        },
      })),
    },
    { type: 'separator' },
    { label: 'Hide Cat Girl', click: () => setEnabled('girl', false) },
    { label: 'Quit Desk Cat', click: () => app.quit() },
  ]);
  menu.popup({ window: win });
});

ipcMain.handle('get-girl-settings', () => settings);

ipcMain.on('girl-outfit-changed', (_event, name) => {
  if (OUTFITS.some(([id]) => id === name) && settings.outfit !== name) {
    settings.outfit = name;
    saveSettings();
  }
});

// ---------------------------------------------------------------------------
// Cursor position and screen metrics.

ipcMain.handle('get-cursor-point', () => screen.getCursorScreenPoint());

ipcMain.handle('get-screen-metrics', () => {
  const display = screen.getPrimaryDisplay();
  return { bounds: display.bounds, workArea: display.workArea };
});

// ---------------------------------------------------------------------------
// Window tops the characters can stand on. A long-lived PowerShell helper compiles a little C#
// (EnumWindows + DWM frame bounds, no extra installs) and streams the visible
// top-level windows, bottom -> top, whenever they change. Rects arrive in
// physical pixels and are converted to Electron's DIPs here.

const WIN_SURFACES_HELPER = `
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class DeskCatSurfaces {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr c);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int n);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int n);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  const int GWL_EXSTYLE = -20, WS_EX_TOOLWINDOW = 0x80, WS_EX_APPWINDOW = 0x40000;
  const uint GW_OWNER = 4;
  static readonly HashSet<string> Skip = new HashSet<string> {
    "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd" };
  public static void Run(uint ownPid) {
    SetProcessDpiAwarenessContext(new IntPtr(-4)); // per-monitor v2: physical px
    string last = null;
    while (true) {
      var rows = new List<string>();
      EnumWindows((h, l) => {
        if (!IsWindowVisible(h) || IsIconic(h) || GetWindowTextLength(h) == 0) return true;
        int ex = GetWindowLong(h, GWL_EXSTYLE);
        if ((ex & WS_EX_TOOLWINDOW) != 0) return true;
        if (GetWindow(h, GW_OWNER) != IntPtr.Zero && (ex & WS_EX_APPWINDOW) == 0) return true;
        uint pid; GetWindowThreadProcessId(h, out pid);
        if (pid == ownPid) return true;
        int cloaked; // other virtual desktops, suspended UWP apps
        if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
        var cls = new StringBuilder(64); GetClassName(h, cls, 64);
        if (Skip.Contains(cls.ToString())) return true;
        RECT r; // visible frame, without the invisible resize borders
        if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) return true;
        rows.Add(h.ToInt64() + " " + r.L + " " + r.T + " " + (r.R - r.L) + " " + (r.B - r.T));
        return true;
      }, IntPtr.Zero);
      rows.Reverse(); // EnumWindows is top -> bottom
      string line = string.Join(";", rows);
      if (line != last) {
        Console.Out.WriteLine(line);
        Console.Out.Flush(); // throws once Electron is gone, ending the loop
        last = line;
      }
      Thread.Sleep(200);
    }
  }
}
'@
[DeskCatSurfaces]::Run(${process.pid})
`;

let winSurfaces = [];
let winSurfacesHelper = null;
let winSurfacesRestarts = 0;

function startWinSurfacesHelper() {
  const encoded = Buffer.from(WIN_SURFACES_HELPER, 'utf16le').toString('base64');
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
  );
  winSurfacesHelper = child;
  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    if (!lines.length) return;
    const last = lines[lines.length - 1];
    winSurfaces = last
      ? last.split(';').map((row) => {
          const [id, x, y, w, h] = row.split(' ').map(Number);
          return { id, x, y, w, h };
        })
      : [];
  });
  child.on('error', () => {});
  child.on('exit', () => {
    if (winSurfacesHelper !== child) return;
    winSurfacesHelper = null;
    winSurfaces = [];
    if (winSurfacesRestarts++ < 5) setTimeout(startWinSurfacesHelper, 2000);
  });
}

function getWinSurfaces() {
  const result = [];
  for (const s of winSurfaces) {
    const r = screen.screenToDipRect(null, { x: s.x, y: s.y, width: s.w, height: s.h });
    if (r.width > 80 && r.height > 40) result.push({ id: s.id, x: r.x, y: r.y, w: r.width, h: r.height });
  }
  return result;
}

app.on('will-quit', () => {
  if (winSurfacesHelper) {
    const child = winSurfacesHelper;
    winSurfacesHelper = null;
    child.kill();
  }
});

ipcMain.handle('get-surfaces', () => getWinSurfaces());

function setEnabled(kind, value) {
  settings[kind] = value;
  saveSettings();
  const win = windows[kind];
  if (win) win.webContents.send('set-enabled', value);
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Cat', type: 'checkbox', checked: settings.cat, click: (item) => setEnabled('cat', item.checked) },
    { label: 'Cat Girl', type: 'checkbox', checked: settings.girl, click: (item) => setEnabled('girl', item.checked) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  const shown = [settings.cat && 'cat', settings.girl && 'cat girl'].filter(Boolean);
  tray.setToolTip(shown.length ? `Desk Cat (${shown.join(' + ')})` : 'Desk Cat (hidden)');
}

function buildTrayIconBuffer() {
  // Raw 16x16 RGBA bitmap: an orange filled circle on transparent
  // background, generated at runtime so no icon asset file is needed.
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const r = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) {
        buf[i] = 230; // R
        buf[i + 1] = 140; // G
        buf[i + 2] = 40; // B
        buf[i + 3] = 255; // A
      } else {
        buf[i + 3] = 0;
      }
    }
  }
  return buf;
}

function createTray() {
  const icon = nativeImage.createFromBuffer(buildTrayIconBuffer(), {
    width: 16,
    height: 16,
  });
  tray = new Tray(icon);
  updateTrayMenu();
  // Clicking the icon hides everyone, or brings everyone back.
  tray.on('click', () => {
    const show = !(settings.cat || settings.girl);
    setEnabled('cat', show);
    setEnabled('girl', show);
  });
}

app.whenReady().then(() => {
  loadSettings();
  startWinSurfacesHelper();
  createWindow('cat');
  createWindow('girl');
  createTray();
});

app.on('window-all-closed', () => {
  app.quit();
});
