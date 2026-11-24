/* ── Theme ───────────────────────────────────────────── */
// Same rule as MakerLens Assets: html[data-theme] is an explicit choice,
// otherwise the OS preference (prefers-color-scheme) decides.
const DARK_MQ = window.matchMedia('(prefers-color-scheme: dark)');
const systemTheme  = () => DARK_MQ.matches ? 'dark' : 'light';
const currentTheme = () => document.documentElement.dataset.theme || systemTheme();

// Design tokens from css/tokens.css (the shared MakerLens palette), so the
// canvas uses the same colours and font as the rest of the page.
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ── Graph libraries (loaded after the app, so the folder picker is not kept waiting) ── */
const GRAPH_LIBS = ['vendor/cytoscape/cytoscape.min.js', 'vendor/dagre/dagre.min.js', 'vendor/cytoscape-dagre/cytoscape-dagre.js'];
let graphLibs = 0;          // 0 not started, 1 loading, 2 ready
let afterGraphLibs = null;  // the render asked for while they were loading

function loadGraphLibs() {
  if (graphLibs) return;
  graphLibs = 1;
  const next = i => {
    if (i === GRAPH_LIBS.length) {
      graphLibs = 2;
      hideLayoutNotice();
      if (!cy && EL.graphView.classList.contains('visible')) initCy();
      const run = afterGraphLibs; afterGraphLibs = null;
      if (run) run();
      return;
    }
    const s = document.createElement('script');
    s.src = GRAPH_LIBS[i];
    s.onload = () => next(i + 1);
    s.onerror = () => { graphLibs = 0; hideLayoutNotice(); setStatus('err', 'Could not load the graph library (' + GRAPH_LIBS[i] + ').'); if (typeof Preboot !== 'undefined') Preboot.scriptFailed(); };
    document.head.appendChild(s);
  };
  next(0);
}

// True when the graph can be drawn; otherwise runs `again` as soon as the libraries are in.
function graphReady(again) {
  if (graphLibs === 2) return true;
  afterGraphLibs = again;
  showLayoutNotice('Loading the graph…');
  loadGraphLibs();
  return false;
}

/* ── Cytoscape instance ──────────────────────────────── */
let cy = null;

// The MakerLens look (html[data-lens], js/lens-gate.js): node colours come from the --c-* tokens
// that css/lens-events.css sets for both themes, on the card surface of the page.
const isLens = () => document.documentElement.hasAttribute('data-lens');

function activeNodeColors() {
  if (isLens()) {
    const bg = token('--s1'), text = token('--t');
    const one = name => ({ bg, border: token(name), text });
    return { dialogue: one('--c-dlg'), choice: one('--c-choice'), condition: one('--c-cond'), label: one('--c-label'), jump: one('--c-jump') };
  }
  return currentTheme() === 'light' ? NODE_COLORS_LIGHT : NODE_COLORS;
}

function initCy() {
  if (graphLibs !== 2) return;   // graphReady() draws once the libraries are in
  if (cy) { cy.destroy(); cy = null; }
  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: [],
    style: cyStyle(),
    layout: { name: 'preset' },
    minZoom: 0.1,
    maxZoom: 3,
    wheelSensitivity: 0.3,
    autoungrabify: true,   // read-only: nodes cannot be dragged
  });
  watchGraphSize(document.getElementById('cy'));
  cy.on('tap', 'node', e => showDetail(e.target.data('nodeData')));
  cy.on('tap', e => { if (e.target === cy) clearDetail(); });
}

function cyStyle() {
  const bgBase = token('--bg');
  const line   = token('--bd2');
  const muted  = token('--t2');
  const font   = token('--font');
  const jump   = token('--c-jump');
  const accent = token('--a');
  const lens   = isLens();
  const mono   = token('--mono');
  const box    = lens ? 'round-rectangle' : null;   // the lens look draws every node as a card; its border style tells the types apart
  return [
    {
      selector: 'node',
      style: {
        'shape': 'round-rectangle',
        'background-color': NODE_COLORS.dialogue.bg,
        'border-color':     NODE_COLORS.dialogue.border,
        'border-width': 1.5,
        'color': NODE_COLORS.dialogue.text,
        'label': 'data(label)',
        'text-wrap': 'wrap',
        'text-max-width': lens ? 220 : 200,
        'font-size': 13,   // never under 12px on screen: see fitGraph() for the zoom floor on phones
        'font-family': font,
        'padding': lens ? 14 : 12,
        'line-height': lens ? 1.4 : 1,
        'width': 'label',
        'height': 'label',
        'text-valign': 'center',
        'text-halign': 'center',
        'min-width': 120,
        'min-height': 36,
      }
    },
    nodeTypeStyle('dialogue',  activeNodeColors().dialogue,  'round-rectangle'),
    nodeTypeStyle('choice',    activeNodeColors().choice,    box || 'diamond'),
    nodeTypeStyle('condition', activeNodeColors().condition, box || 'diamond'),
    nodeTypeStyle('label',     activeNodeColors().label,     box || 'ellipse'),
    nodeTypeStyle('jump',      activeNodeColors().jump,      box || 'ellipse'),
    ...(lens ? [
      { selector: 'node[nodeType="dialogue"]',  style: { 'border-width': 1.5 } },
      { selector: 'node[nodeType="choice"]',    style: { 'border-width': 2 } },
      { selector: 'node[nodeType="condition"]', style: { 'border-style': 'dashed' } },
      { selector: 'node[nodeType="jump"]',      style: { 'border-style': 'dotted', 'border-width': 2 } },
    ] : []),
    ...Object.entries(activeNodeColors()).map(([type, colors]) => ({
      selector: `node[nodeType="${type}"]:selected`,
      style: {
        'border-width': 3,
        'border-color': lens ? accent : colors.border,
        'underlay-color': lens ? accent : colors.border,
        'underlay-opacity': lens ? 0.16 : 0.4,
        'underlay-padding': lens ? 6 : 9,
      },
    })),
    {
      selector: 'edge',
      style: {
        'width': 1.5,
        'line-color': lens ? muted : line,
        'target-arrow-color': lens ? muted : line,
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': 12,
        'font-family': lens ? mono : font,
        'color': lens ? accent : muted,
        'text-background-color': bgBase,
        'text-background-opacity': 0.85,
        'text-background-padding': '3px',
        'text-rotation': 'autorotate',
      }
    },
    {
      selector: 'edge[?isJump]',
      style: {
        'line-style': 'dashed',
        'line-color': jump,
        'target-arrow-color': jump,
        'line-dash-pattern': [6, 3],
      }
    },
    {
      selector: 'edge:selected',
      style: { 'line-color': accent, 'target-arrow-color': accent, 'width': 2 }
    },
  ];
}

function nodeTypeStyle(type, colors, shape) {
  return {
    selector: `node[nodeType="${type}"]`,
    style: {
      'background-color': colors.bg,
      'border-color':     colors.border,
      'color':            colors.text,
      'shape':            shape,
    }
  };
}

/* ── Render graph ────────────────────────────────────── */
let renderSeq = 0;   // a newer render (or cancelRender) makes a pending one stop

function showLayoutNotice(text) {
  const el = document.getElementById('layout-notice');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
}
function hideLayoutNotice() {
  const el = document.getElementById('layout-notice');
  if (el) el.hidden = true;
}

// Drops a render that is still waiting for its layout (the page went empty or changed).
function cancelRender() {
  renderSeq++;
  hideLayoutNotice();
}

function renderGraph(nodes, edges) {
  if (!graphReady(() => renderGraph(nodes, edges))) return;
  if (!cy) initCy();
  const seq = ++renderSeq;
  hideLayoutNotice();   // a notice left by an older, superseded render
  S.currentNodes = nodes;

  const emptyNotice = document.getElementById('empty-page-notice');
  if (emptyNotice) emptyNotice.hidden = true;

  const plan = layoutPlan(nodes.length);
  cy.elements().remove();
  if (!plan.defer) { drawGraph(nodes, edges, plan); return; }

  // Big page: show the notice, let the browser paint it, then lay out.
  showLayoutNotice(`Laying out ${nodes.length} nodes…`);
  requestAnimationFrame(() => setTimeout(() => {
    if (seq !== renderSeq) return;   // the user already moved on
    drawGraph(nodes, edges, plan);
    hideLayoutNotice();
  }, 0));
}

function drawGraph(nodes, edges, plan) {
  const elements = [];
  for (const n of nodes) {
    elements.push({ data: {
      id: n.id,
      label: nodeLabel(n),
      nodeType: n.type,
      nodeData: n,
      glowColor: activeNodeColors()[n.type]?.border || '#f59e0b',
    }});
  }
  for (const e of edges) {
    const eid = `e_${e.source}_${e.target}_${Math.random().toString(36).slice(2,6)}`;
    elements.push({ data: { id: eid, source: e.source, target: e.target, label: e.label || '', isJump: e.isJump || false } });
  }

  cy.batch(() => { cy.add(elements); });
  cy.style(cyStyle());

  cy.layout({
    name: 'dagre',
    rankDir: 'TB',
    nodeSep: 40,
    rankSep: 60,
    edgeSep: 10,
    padding: 32,
    ranker: plan.ranker,
    animate: false,
  }).run();

  const seq = renderSeq;
  setTimeout(() => { if (seq === renderSeq) fitGraph(); }, 50);
}

// Fit the page on screen, but never blow a small page up past life size (one node filling the view).
// On a phone it also never shrinks it below graphZoom()'s floor: a whole page squeezed into 390px
// has node text of about 8px, so the page is shown at a readable size from its first node and the
// viewer pans (touch drag) or pinches; the Fit button does the same.
function fitGraph() {
  if (!cy) return;
  cy.fit(undefined, 32);
  const phone = typeof isPhone === 'function' && isPhone();
  const z = graphZoom(cy.zoom(), phone);
  if (z === cy.zoom()) return;
  cy.zoom(z);
  const w = cy.width(), bb = cy.elements().boundingBox();
  if ((bb.x2 - bb.x1) * z <= w - 32) { cy.center(); return; }   // still fits across: centred
  const first = cy.nodes()[0];
  if (!first) { cy.center(); return; }
  cy.pan({ x: w / 2 - first.position('x') * z, y: 24 - (first.position('y') - first.height() / 2) * z });
}

// The canvas changes size when the inspector opens or closes, or the window does: keep the
// drawing in place and the tapped node on screen.
function watchGraphSize(container) {
  if (watchGraphSize.on || typeof ResizeObserver !== 'function') return;
  watchGraphSize.on = true;
  new ResizeObserver(() => {
    if (!cy) return;
    cy.resize();
    const sel = cy.$('node:selected');
    if (!sel.length) return;
    const bb = sel.renderedBoundingBox(), w = cy.width(), h = cy.height();
    const m = 64;   // clear of the zoom buttons at the edge
    if (bb.x1 < m || bb.y1 < m || bb.x2 > w - m || bb.y2 > h - m) cy.center(sel);
  }).observe(container);
}

function nodeLabel(n) {
  switch (n.type) {
    case 'dialogue': {
      const spk = n.speaker ? n.speaker + '\n' : '';
      const full = n.lines.map(l => formatText(l)).join('\n');
      const txt = full.length > 120 ? full.slice(0, 120) + '…' : full;
      return (spk + txt).trim() || '(empty text)';
    }
    case 'choice': {
      const full = n.choices.map((c, i) => `${i+1}. ${formatText(c)}`).join('\n');
      return full.length > 120 ? full.slice(0, 120) + '…' : full;
    }
    case 'condition': return n.label;
    // lens look: plain words, since the arrow glyphs come from a fallback font whose width the canvas mis-measures (the text got clipped)
    case 'label':     return isLens() ? `label ${n.name}` : `▸ ${n.name}`;
    case 'jump':      return isLens() ? `jump to ${n.target}` : `↩ ${n.target}`;
    default:          return n.type;
  }
}

function formatText(str) {
  const resolved = resolveTextCodes(str || '');
  return resolved.replace(/\\[A-Za-z]\[\d+\]/g, '').replace(/\\\./g, '').replace(/\\!/g, '').trim();
}

function stripCodes(str) { return formatText(str); }
