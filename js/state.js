/* ── Global state ─────────────────────────────────────── */
const S = {
  maps:             new Map(),  // mapId → { mapId, mapName, events } (read, with events)
  mapFiles:         new Map(),  // mapId → Map###.json not read yet (loader.js)
  bgDone:           null,       // Promise: background map reading finished
  commonEvents:     [],
  mapInfos:         {},         // mapId → {name, parentId, order, expanded}
  selectedMapId:    null,
  selectedEvId:     null,
  selectedPage:     0,
  detailOpen:       false,
  actors:           [],         // index → actor name
  actorStart:       [],         // index → { name, classId, equips } at the start (Actors.json)
  party:            [],         // actor ids in the starting party (System.json)
  variables:        [],         // index → variable name
  switches:         [],         // index → switch name
  currentNodes:     [],
  currentPage:      null,       // current page object {list} (read-only)
  collapsedFolders: new Set(),  // mapIds the user has manually collapsed
  scenesExpanded:   false,      // sidebar lists every scene, not the first few
  search:           '',         // sidebar search box (search.js); results replace the tree
  searchExpanded:   { scenes: false, events: false },   // every result, not the first few
  folderHandle:     null,       // directory handle of the open folder, for the switch to Assets (memory only; js/handoff.js)
  sceneEntry:       null,       // the page on screen as a scene: what the Play buttons play (app.js, player.js)
  loc:              null,       // plugin text keys → text, from the game's loc/ files (loc.js)
  save:             null,       // an open save file (save.js): switches, variables, self switches, actors, party (memory only)
};
