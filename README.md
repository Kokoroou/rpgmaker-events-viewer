# MakerLens Events

An RPG Maker event viewer: see the dialogue, choices and conditions of an RPG Maker game (MV, MZ, VX Ace, VX, XP, 2000, 2003) as an interactive flow graph, and play its cutscenes, right in your browser.

Open the game's folder. MakerLens Events reads the event commands and draws each event page as a graph: dialogue, choice branches, conditional branches with switch and variable names, labels and jumps, laid out automatically. It works on released games: no project, no editor, no plugin.

**Private and read-only.** Your game files are read in your browser, never uploaded and never modified.

**Try it:** <https://makerlens.kokoroou.workers.dev/events/> · [FAQ](https://makerlens.kokoroou.workers.dev/events/faq.html)

**Who it's for:** guide and wiki writers, dataminers and speedrunners looking for what unlocks an ending or a hidden route; translators who need to know which branch a line belongs to; developers and writers who want a bird's-eye view of tangled events. Free, no account, no ads. Not an editor: to change events, use the RPG Maker editor.

Part of the **[MakerLens](https://makerlens.kokoroou.workers.dev/)** family: use [MakerLens Assets](https://makerlens.kokoroou.workers.dev/assets/) to browse the same game's images and audio.

> Formerly named LoreInsight. Renamed so the event viewer and the asset viewer share one brand and one audience.

## How to use

1. Open **<https://makerlens.kokoroou.workers.dev/events/>**.
2. Click **Select Game Folder** (or drop the folder anywhere on the page) and pick the game's **main folder: the one with `Game.exe` in it** (`RPG_RT.exe` for 2000/2003). The viewer finds the data itself, whether it is in `www/data/` (MV), `data/` (MZ), `Data/` or a `Game.rgss3a` / `.rgss2a` / `.rgssad` archive (VX Ace, VX, XP), or `RPG_RT.ldb` (2000/2003). Picking the `data/` folder itself works too. If you pick a folder with no game data (such as `img/`), it says so and tells you to pick the folder above.
3. The sidebar lists **Scenes**, **Maps** and **Common events**. Click a map to see its events as cards, then click a card to draw that event's graph. Each map event is an NPC, door or trigger on that map; a common event is shared code the game calls from anywhere.
4. Click a node to read its full text in the inspector (the panel on the right; at the bottom on phones). Follow the arrows to read a conversation in order. If the event has several pages (versions that take over under different conditions, such as a switch being on), switch between them with the page tabs.
5. **Find an event by name:** type in the search box at the top of the sidebar (press **/** to jump there). It matches event and map names, not the dialogue text.

**Scenes (cutscenes).** An event that shows pictures together with dialogue is listed under Scenes and marked on its card. Press **Preview** (on the card, or in the toolbar once its graph is open) to play it like in the game, with its pictures, faces, music and sounds, line by line.

**Use a save (optional).** Scenes that depend on switches and variables play as the game would at a point in your playthrough if you load a save with **Use a save** in the toolbar (`.rpgsave`, `.rmmzsave`, `.rvdata2`, `.rvdata`, `.rxdata`). The save is only read, in your browser.

**Other ways in** (the **View another way** button): pick the data files one by one, or open a link made in a game published with rpgmaker-web-toolkit.

**Phones:** the viewer adapts to small screens (the sidebar opens from the menu button), but phone browsers may not let you pick a folder. A desktop browser works best: Chrome, Edge, Firefox or Brave.

**What is sent.** Nothing about your game. The public site counts anonymous page visits (GoatCounter) and sends feedback only when you choose to; see [Privacy](https://makerlens.kokoroou.workers.dev/assets/privacy.html).

## Features

- Opens an RPG Maker game folder by picker or drag-and-drop (MV, MZ, VX Ace, VX, XP, 2000, 2003), also from the game's archive
- Draws each event page as an interactive Cytoscape.js graph; after a choice or condition the flow joins up again
- Dialogue, choices, conditions (with switch, variable and actor names), labels, and jumps drawn as dashed back-edges
- Inspector with the full text of any node; page tabs for multi-page events
- Sidebar with scenes, the map tree and common events, plus search by event or map name
- Scene player: pictures, faces, music and sound, typed-out messages, auto play
- Optional save file, so scenes start from your switches and variables
- Light and dark theme follow the system (a manual choice is saved locally); same look as MakerLens Assets
- Read-only: nothing is ever written back to the game files

## Supported Engines

| Engine | Where the events are read from |
|--------|--------|
| RPG Maker MV / MZ | `data/*.json` (MV: `www/data/`) |
| RPG Maker VX Ace / VX / XP | `Data/*.rvdata2` / `.rvdata` / `.rxdata` (Ruby Marshal, `js/rgss.js`), also from `Game.rgss3a` / `.rgss2a` / `.rgssad` |
| RPG Maker 2000 / 2003 | `RPG_RT.lmt` / `RPG_RT.ldb` / `Map####.lmu` (LCF, `js/lcf.js`); Japanese (Shift-JIS) or Western text detected |

Save files (`.rpgsave`, `.rmmzsave`, `.rvdata2`, `.rvdata`, `.rxdata`) are read by **Use a save** (`js/save.js`).

## Node Types

| Node | Color | Description |
|------|-------|-------------|
| Dialogue | Amber | A block of Show Text commands (101/401) |
| Choice | Blue | A Show Choices branch point (102/402) |
| Condition | Purple | A Conditional Branch (111/411) |
| Label | Green | A named waypoint (118) |
| Jump | Orange | A Jump to Label command (119), rendered as a dashed edge |

## Project Structure

```
rpgmaker-events-viewer/  # formerly lore-insight; product name is MakerLens Events
  index.html             # App shell (CSP: self only)
  faq.html               # Static FAQ; its FAQPage JSON-LD must match the visible Q&A (check-site.mjs)
  css/                   # Styles split by area; tokens.css = shared MakerLens design tokens (copy of Assets)
  js/
    theme-init.js        # Applies the saved theme before first paint
    preboot.js           # Folder button, drops and View another way work before the rest loads
    constants.js         # RPG Maker command codes, node colours, layout plan
    parser.js            # Event command parser → graph nodes and edges
    state.js             # Global state S
    graph.js             # Cytoscape setup, style, render and fit
    detail.js            # Node inspector
    scenes.js            # Finds scenes (pictures + dialogue) by content
    scene-script.js      # Runs a scene's commands into steps for the player
    player.js            # Scene player (pictures, messages, sound)
    media.js             # Reads and decrypts pictures and audio on demand
    remote.js            # Game links (rpgmaker-web-toolkit)
    handoff.js           # Hands the open folder to MakerLens Assets
    decrypt-rgssad.js    # RGSSAD archives (same file as MakerLens Assets)
    rgss.js              # VX Ace / VX / XP data (Ruby Marshal)
    lcf.js               # 2000 / 2003 data (LCF)
    xyz.js               # 2000 / 2003 .xyz pictures (same file as MakerLens Assets)
    save.js              # Save files for Use a save
    search.js            # Sidebar search
    sidebar.js           # Scenes, map tree and common events
    loadui.js            # Loading overlay
    loader.js            # Finding the data, reading it, background map reading
    feedback.js          # Optional rating and bug/idea form
    analytics.js         # Anonymous page-view count (public site only)
    app.js               # DOM refs, selection, UI wiring
  vendor/                # Cytoscape, dagre, cytoscape-dagre (MIT)
  docs/
    vision.md            # Product vision and positioning
    ROADMAP.md           # Repositioning as MakerLens Events: phases, gates, stop rule
  tests/                 # node --test on synthetic data (parser, loader, scenes, saves, RGSS, LCF…)
  scripts/
    check-site.mjs       # static checks (JS syntax, CSP, local files)
    assemble-site.sh     # copies the public files for the MakerLens deploy
```

## Technical Notes

**Parser architecture:** The parser uses a recursive descent approach, using the `indent` field on each command to determine nesting depth. Choice branches and conditional branches are handled by recursing one indent level deeper. Labels and jumps are resolved in a post-processing pass.

**File loading:** Uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) (`showDirectoryPicker`) when available, with a `<input webkitdirectory>` fallback for broader compatibility. Drag-and-drop is also supported via the DataTransfer API.

**Graph rendering:** [Cytoscape.js](https://cytoscape.org/) with [cytoscape-dagre](https://github.com/cytoscape/cytoscape.js-dagre) for automatic top-down layout. The libraries are vendored in `vendor/` (MIT, see `vendor/README.md`), so the app works fully offline and the Content-Security-Policy allows only the site itself.

## Browser Compatibility

Requires a modern browser with ES2020+ support. Chrome 86+ or Edge 86+ recommended for the best experience (full File System Access API support). Firefox works via the `<input>` fallback.

## Checks

No install needed (Node 22+):

```bash
node scripts/check-site.mjs && node --test "tests/*.test.mjs"
```

CI runs both on every pull request. Tests use small synthetic event lists built in the test files; please never commit real game data.

## License

MIT — see [LICENSE](LICENSE).
