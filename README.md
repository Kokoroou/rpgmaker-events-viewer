# MakerLens Events

See how an RPG Maker game's events work: dialogue, choices and conditions as an interactive flow graph, and its cutscenes played like in the game, right in your browser. Supports **MV, MZ, VX Ace, VX, XP, 2000 and 2003**. Read-only, and everything runs on your device: your game files are never uploaded or modified.

**[Try it live →](https://makerlens.kokoroou.workers.dev/events/)**

**Who it's for:** guide and wiki writers, dataminers and speedrunners looking for what unlocks an ending or a hidden route; translators who need to know which branch a line belongs to; developers and writers who want a bird's-eye view of tangled events. Free, no account, no ads. Not an editor: to change events, use the RPG Maker editor. Part of the [MakerLens](https://makerlens.kokoroou.workers.dev/) family: to browse the same game's images and audio, use [MakerLens Assets](https://makerlens.kokoroou.workers.dev/assets/). (Formerly named LoreInsight.)

## Features

- **No install, no build** — works on released games: no project, no editor, no plugin
- **Local-only and read-only** — files are read in your browser; nothing about your game is sent, and nothing is written back
- **Event flow graph** — dialogue, choice branches, conditions (with switch, variable and actor names), labels and jumps; after a branch the flow joins up again. Click a node to read it in full; page tabs switch between event pages
- **Scene player** — events that show pictures with dialogue are listed as scenes; **Preview** plays them with pictures, faces, music and sound, line by line, like in the game
- **Use a save** — optional: start scenes from a save file's switches and variables (read only, kept in the browser)
- **Sidebar** — scenes, the map tree and common events, with search by event or map name (press `/`)
- **Any game folder** — pick or drop it; XP / VX / VX Ace data is also read from the game's archive; **View another way** opens data files one by one or a game link
- **Switch to Assets** — carry the open folder to MakerLens Assets without picking it again (Chrome / Edge)
- **Phones and themes** — the sidebar becomes a drawer on small screens; light/dark theme follows the system

## Getting started

1. Open **[MakerLens Events](https://makerlens.kokoroou.workers.dev/events/)**.
2. Click **Select Game Folder** (or drop the folder anywhere on the page) and pick the game's **main folder: the one with `Game.exe` in it** (`RPG_RT.exe` for 2000/2003). The data is found for you; picking the `data/` folder itself also works.
3. Click a map in the sidebar, then an event card to draw its graph, or press **Preview** on a scene to play it.

**Picked the wrong folder?** If it holds no game data (such as `img/`), the viewer says so, names the folder and tells you to pick the one above it.

Desktop Chrome, Edge, Firefox and Brave work best; phone browsers may not offer folder selection. More help (which folder, reading the graph, scenes, saves): [FAQ](https://makerlens.kokoroou.workers.dev/events/faq.html).

## Supported engines

| Engine | Where the events are read from |
|--------|--------|
| MV / MZ | `data/*.json` (MV: `www/data/`) |
| VX Ace / VX / XP | `Data/*.rvdata2` / `.rvdata` / `.rxdata` (Ruby Marshal, `js/rgss.js`), also from `Game.rgss3a` / `.rgss2a` / `.rgssad` |
| 2000 / 2003 | `RPG_RT.lmt` / `RPG_RT.ldb` / `Map####.lmu` (LCF, `js/lcf.js`); Shift-JIS or Western text detected |

Save files for **Use a save**: `.rpgsave`, `.rmmzsave`, `.rvdata2`, `.rvdata`, `.rxdata` (`js/save.js`). Formats and algorithms are documented in the code comments.

## Privacy and legal

- **Privacy:** your game is processed only in your browser; nothing about it is sent anywhere. The public site counts anonymous page visits and a few actions by name (GoatCounter: how a game was opened, which feature was used, never what) and sends feedback only when you choose to. What is sent, and what never is, is defined on the [privacy page](https://makerlens.kokoroou.workers.dev/assets/privacy.html), the single source of truth. A Content-Security-Policy makes the browser block every other host.
- **Legal:** intended for games you own or have the rights holder's permission to inspect; games are only read, never modified. See [`LEGAL.md`](https://github.com/Kokoroou/rpgmaker-assets-viewer/blob/main/LEGAL.md) in MakerLens Assets for intended use, user responsibility and takedown policy.

## Documentation

| Document | What it covers |
|----------|----------------|
| [`faq.html`](faq.html) | usage questions: opening a game, reading the graph, scenes, saves |
| [`docs/vision.md`](docs/vision.md) | product vision and positioning |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | planned work and non-goals |
| [`CLAUDE.md`](CLAUDE.md) | architecture (parser, scenes, loaders, graph) and contributor rules |
| [`vendor/README.md`](vendor/README.md) | bundled libraries and their licenses |

## Contributing

Pull requests are welcome; for significant changes, open an issue first. To run it locally, serve the folder (`python -m http.server 8080`, then open `http://localhost:8080/`). Before opening a PR, run the CI checks (Node 22+, no install needed):

```bash
node scripts/check-site.mjs && node --test "tests/*.test.mjs"
```

Please do **not** commit real game data, even as test fixtures, without permission from the copyright holder. If you change what the site sends, update the privacy page in MakerLens Assets in the same change.

## Acknowledgments

[Cytoscape.js](https://cytoscape.org/) and [dagre](https://github.com/dagrejs/dagre) draw the graph (MIT, bundled in `vendor/`). The 2000/2003 data layout follows [EasyRPG liblcf](https://github.com/EasyRPG/liblcf); the archive reader is shared with MakerLens Assets, which credits [RPGMakerDecrypter](https://github.com/uuksu/RPGMakerDecrypter).

## License

MIT — see [LICENSE](LICENSE).
