# Desk Cat

Two desktop companions: a 3D cat and a chibi cat girl. Each can be shown or hidden from the tray icon.

A 3D desktop companion cat that lives on your taskbar, styled like a clay sculpture: smooth periwinkle-blue with raised swirling "carved" fur (a big spiral on each haunch, flowing curls along its flanks, chevrons down its chest), big yellow eyes, tall ears and a long tail it wraps around its paws when it sits. It walks, sits, grooms, dozes off when nobody plays with it, bats at your mouse cursor, and can be picked up by the scruff and dropped somewhere else (including on top of other windows). No AI: every behavior is timers, weighted random picks, distance checks and closed-form animation.

## Run

You need [Node.js](https://nodejs.org/) (which includes npm). `start.cmd` installs everything else the first time it runs, then starts the app in the background, so you can close the terminal afterwards.

### Windows

- **Easiest:** open the project folder in File Explorer and double-click `start.cmd`.
- **PowerShell** (including the VS Code terminal):

  ```powershell
  .\start.cmd
  ```

  PowerShell only runs scripts from the current folder when they start with `.\`, so plain `start.cmd` gives a "not recognized" error there.
- **Command Prompt (cmd):**

  ```cmd
  start.cmd
  ```

### Foreground

To see log output in the terminal, run it in the foreground instead:

```
npm install
npm start
```

To quit, right-click the cat or the cat girl and choose **Quit Desk Cat**, or use **Quit** in the tray icon's menu.

## What it does

- **Walks along the taskbar**, sits and looks around (at you, at your cursor, at random spots), grooms its paw and face, loafs, stretches, flicks its ears and blinks.
- **Plays with the mouse** when the cursor moves near it:
  - *stalks*: crouches low with a butt wiggle, then **pounces** at a cursor moving along the ground;
  - *bats*: swats at the cursor with alternating front paws when it's within reach;
  - *rears up* on its hind legs to swipe at a cursor hovering just above it;
  - *chases*: trots after a cursor that moves off along its level, or walks under one hovering above.
  - It loses interest if the cursor sits still for a while.
- **Gets sleepy when ignored**: drowsiness builds after ~45s without interaction, so it loafs with heavy eyelids and eventually curls up to sleep (with floating "z"s). Moving the cursor close for a moment, or clicking it, wakes it up with a stretch.
- **Pet it**: a quick left-click makes it squint happily and say "meow" (spelled out letter by letter, mouth opening). Pet it again within a few seconds and it **purrs**: kneads with its front paws, slow-blinks and floats hearts and "prr~".
- **Moods**:
  - *Annoyed*: poke it five times in a few seconds (or hold it up for more than ~6 seconds) and it **hisses** like a Halloween cat (back arched, fur puffed, ears flat, mouth open, "hss!"), then **sulks** with its back to you, tail lashing, for a while. Petting a sulking cat makes it hiss again.
  - *Startled*: whip the cursor right past it and it jumps with fur on end ("!"), then cowers for a moment. A hard landing after a long drop scares it too.
  - *Curious*: hold the cursor still near it and it tilts its head side to side with ears and whiskers forward ("?").
  - *Chattering*: wave the cursor around above it, out of reach, and it chatters at it like at a bird ("ek ek").
  - *Zoomies*: now and then it dashes madly back and forth.
  - *Lonely*: ignored for about half a minute (before it gets sleepy), it stands up with its tail high and meows at you.
  - *Happy*: after being petted it walks with its tail straight up and hooked at the tip. When sleepy it yawns.
- **Right-click it** for a small menu: **Pet**, **Hide Cat**, or **Quit Desk Cat**.
- **Pick it up and put it somewhere else**: click-and-drag grabs it by the scruff. It dangles and swings with your hand movement. Let go and it stays where you put it, pottering about that spot. If you drop it just above a window's top edge it lands on the window, rides along when you move the window, and falls to whatever is below if the window is closed, minimised or covered. Dropping it low over the taskbar puts it back on the taskbar.
- **Toggle on/off** from the tray icon (orange dot): tick **Cat** / **Cat Girl** to show or hide each one. Clicking the icon hides both, or brings both back.

## The cat girl

A glossy chibi-figure-style cat girl styled after Hatsune Miku: a big chibi head, thick flared teal twin tails with square hair ties, teal eyes, a headset with a mic, plus teal cat ears, a tail and an ahoge. Like the cat, she's built procedurally with no model files, and her behaviour is timers and weighted random picks, not AI.

- **Sits on the taskbar like a chair**: she perches on its top edge with her legs dangling over it, swinging her feet, humming (♪), leaning back on her hands, or kicking happily. She does the same on window tops.
- **Does her own thing**: grooms her paws like a cat, stretches and yawns, waves at you, dances, stands around looking about, and walks off to another spot. Now and then she strolls all the way across the screen. If ignored for a few minutes she dozes off sitting up (with z's).
- **Outfits**: Miku (grey top with a teal tie, black detached sleeves, a pleated skirt and thigh-high boots with teal trim; the default), sailor uniform, maid dress, comfy hoodie (with sweater paws and striped thigh-highs), sundress and pajamas. Change them from her right-click menu. Unless you turn off **Outfit → Change outfits on her own**, she also changes by herself every so often (at most once every 8 minutes), with a twirl and a sparkle poof. Her outfit is remembered.
- **Interacting with her**:
  - *Head pats*: rub the cursor back and forth over her head, or click her head. She closes her eyes happily, blushes, flattens her ears, wags her tail and floats hearts ("nya~♡", "purr~").
  - *Pokes*: click her body. Poke her four times in a few seconds and she pouts ("hmph!").
  - *Play*: wiggle the cursor near her and she paws at it. She reaches and hops for it if it's above her head, and runs after it if it scoots off along the taskbar.
  - *Pick her up*: click and drag. She dangles and kicks while you hold her. Drop her and she falls to whatever is below: a window top or the taskbar.
  - *Right-click* for a menu: Head pat, Wave, Dance, Take a walk, Sit down, Nap, Outfit, Size (small/medium/large), Hide Cat Girl, Quit.
- She follows the cursor with her eyes and head, blinks, flicks her ears, and her hair and ahoge sway.

Settings are saved in Electron's user-data folder as `settings.json`, in `%APPDATA%\desk-cat\settings.json`.

## Make it your own

The characters are yours to change. Keep the cat and the cat girl exactly as they are, tweak them a little, or replace them with characters of your own. It's entirely up to you.

Everything is built in code, with no model or image files, so a change is usually a few numbers or colours:

| To change | Look in |
|---|---|
| The cat's colours, shape, eyes, ears and carved swirls | `src/renderer/catModel.js` (the `CLAY` palette at the top sets its colours) |
| The cat's poses and moods | `src/renderer/poses.js` and `src/renderer/brain.js` |
| The cat girl's hair, head size and body | `src/renderer/girl/girlModel.js` (`HAIR` colours and `HEAD_SCALE` near the top) |
| The cat girl's face and eyes | `src/renderer/girl/face.js` |
| The cat girl's outfits, or adding a new one | `src/renderer/girl/outfits.js` |
| Lighting | `src/renderer/lighting.js` (cat), `setupGirlLighting` in `girlModel.js` (cat girl) |
| How big they are on screen | `CAT_SCALE` in `src/renderer/main.js`, `SIZES` in `src/renderer/girlMain.js` |

Save your changes and restart the app to see them. If you only want one character, hide the other from the tray menu.

## How it works

- **Window** (`src/main.js`): a fullscreen, frameless, transparent, always-on-top overlay that is click-through everywhere except a hit box around the cat. The cursor position comes from Electron. The window tops the characters can stand on come from a hidden PowerShell helper that compiles a little C# (`EnumWindows` + DWM frame bounds) and streams visible top-level windows in stacking order; minimised windows and windows on other virtual desktops are skipped. If the helper can't run, the characters just stick to the taskbar.
- **Model** (`src/renderer/catModel.js`): a procedurally sculpted cat with no model files, styled after a clay sculpture. The body parts are smooth lathe/ellipsoid surfaces in a matte clay material; the carved fur is low, flat relief strokes swept along curves on the surfaces and sunk into them (merged into the torso so they follow its morph targets). The torso has two morph targets, an arched back and puffed-up fur, used for hissing and startles. The eyes have a yellow iris, a pupil that goes from slit to round, a glossy cornea, a catchlight, a dark liner and eyelids. A hinged jaw (with fangs and tongue) opens for meows, hisses, yawns and chattering, and the whiskers sweep forward or pin back. Legs are driven by 2-bone IK (hind legs add a hock), so a pose is just "hip position, spine pitch, four paw targets, head, tail, eyes, ears".
- **Poses** (`src/renderer/poses.js`): key poses (stand, walk, sit, loaf, sleep, crouch, rear, pounce, fall, hang...) as flat number bags that can be blended.
- **Behavior** (`src/renderer/brain.js`): a mode machine. Each mode produces a target pose every frame (gaits are computed foot trajectories), and switching modes cross-fades from a snapshot of the last pose, so any behavior can interrupt any other without popping.
- **Cat girl** (`src/renderer/girl/`, entry `src/renderer/girlMain.js`, runs in her own overlay window):
  - `girlModel.js`: the rig, rendered like a glossy PVC figure (smooth PBR materials, clear-coated hair, a generated studio reflection environment, no outlines). Parts are lathes, ellipsoids and swept hair strands with vertex-colour painting. Arms and legs are placed by 3D two-bone IK. The skirt is rebuilt every frame so it drapes over raised thighs and rests on the ledge when she sits.
  - `face.js`: her face is drawn on a canvas projected onto the front of the head. Eyes, mouth, blush and brows change per expression, and it's only redrawn when the expression or gaze changes.
  - `outfits.js`: each outfit as paint functions plus skirt/accessory settings.
  - `girlPoses.js` / `girlBrain.js`: key poses and her mode machine.
  - `effects.js`: hearts, notes, sparkles and speech words.
- **Shared** (`src/renderer/world.js`): the taskbar/window-top "floors" both characters use.
- **Rendering** (`src/renderer/main.js`): Three.js with an orthographic camera. The canvas is only a 480×440 viewport that follows the cat (the overlay window stays fullscreen), and the frame rate drops to 30/15 fps while the cat is sitting or asleep, to keep CPU use down.

## Notes

- Made for Windows 10/11. Only the primary monitor is used.
- `ELECTRON_RUN_AS_NODE` in your shell environment will make `electron .` run as plain Node instead of launching the app. Unset it first if `npm start` seems to do nothing (in PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE; npm start`). `start.cmd` does this for you.
- `node_modules` isn't part of the repository; `start.cmd` (or `npm install`) installs it on first run.
