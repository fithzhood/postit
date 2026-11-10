// Post-it sul telefono: stessi post-it del PC, via Firebase Realtime Database.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  getDatabase, ref, onValue, update, remove, serverTimestamp, connectDatabaseEmulator,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";

const CONFIG = {
  apiKey: "AIzaSyCaOaYlhfRXdAzPDZX-iXnO5CcSusI42Y4",
  authDomain: "postit-6aea7.firebaseapp.com",
  databaseURL: "https://postit-6aea7-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "postit-6aea7",
  storageBucket: "postit-6aea7.firebasestorage.app",
  messagingSenderId: "1081066216928",
  appId: "1:1081066216928:web:3ade5ffec717b58d355f85",
};

// Collaudo in locale contro gli emulatori Firebase: postit.html?emu sul localhost
const EMU = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("emu");
const fb = initializeApp(EMU ? { ...CONFIG, projectId: "demo-postit", databaseURL: "http://127.0.0.1:9000?ns=demo-postit" } : CONFIG);
const auth = getAuth(fb);
const db = getDatabase(fb);
if (EMU) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
}

// Stessi colori e inchiostri del PC (postit.pyw). L'indice è quello salvato.
const PAPERS = [
  ["Canarino", "#FFF27A", "#EDDB4A"], ["Rosa", "#FFC2D4", "#F2A2BA"], ["Lime", "#D4EE9F", "#B9DA77"],
  ["Cielo", "#B5E2F5", "#8DCBE6"], ["Albicocca", "#FFCF8F", "#F5B263"], ["Lavanda", "#DCCFF5", "#C4B2EA"],
  ["Menta", "#B9EEDC", "#92DCC3"], ["Bianco", "#F7F7F2", "#E3E3DA"], // tic-ok: V07 carta bianca del PC
];
const PAPER_ORDER = [0, 4, 1, 5, 3, 6, 2, 7];
const PAD_COLORS = [0, 4, 1, 5, 3, 2];
const INKS = [["Grafite", "#3B3423"], ["Rosso", "#C0392B"], ["Blu", "#1F5FAD"], ["Verde", "#2E7D32"],
              ["Prugna", "#7B2D6E"], ["Arancio", "#D35400"]];
const STYLE_ORDER = ["i", "nb", "nbi", "u", "s", "ink1", "ink2", "ink3", "ink4", "ink5"];
const DEFAULT_STYLE = { b: true, i: false, u: false, s: false, k: 0 };

const $ = (id) => document.getElementById(id);
const S = {
  uid: null, email: "", notes: {}, themes: {}, loaded: false, connected: false,
  filter: loadFilter(), ed: null, unsub: [],
};

function loadFilter() {
  try { const v = localStorage.getItem("postit-filtro"); return v === null || v === "" ? null : Number(v); }
  catch { return null; }
}
function saveFilter() {
  try { localStorage.setItem("postit-filtro", S.filter === null ? "" : String(S.filter)); } catch { /* niente */ }
}

// ---------------------------------------------------------------------------
// Indici del PC ("riga.colonna", come Tk) <-> posizioni nel testo
function lineStarts(text) {
  const s = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") s.push(i + 1);
  return s;
}
function idxToOff(idx, starts, len) {
  const [l, c] = String(idx).split(".").map(Number);
  if (!(l >= 1)) return 0;
  if (l > starts.length) return len;
  return Math.min(starts[l - 1] + (c || 0), len);
}
function offToIdx(off, starts) {
  let l = 0;
  while (l + 1 < starts.length && starts[l + 1] <= off) l++;
  return `${l + 1}.${off - starts[l]}`;
}
function stylesFrom(text, tags) {
  const n = text.length;
  const st = Array.from({ length: n }, () => ({ ...DEFAULT_STYLE }));
  const starts = lineStarts(text);
  for (const t of Array.isArray(tags) ? tags : []) {
    if (!Array.isArray(t) || t.length < 3) continue;
    const [name] = t;
    const a = idxToOff(t[1], starts, n), b = Math.min(idxToOff(t[2], starts, n), n);
    for (let x = a; x < b; x++) {
      const s = st[x];
      if (name === "i") s.i = true;
      else if (name === "nb") s.b = false;
      else if (name === "nbi") { s.b = false; s.i = true; }
      else if (name === "u") s.u = true;
      else if (name === "s") s.s = true;
      else if (name.startsWith("ink")) s.k = Number(name.slice(3)) || 0;
    }
  }
  return st;
}
function tagNames(s) {
  const out = [];
  if (s.b && s.i) out.push("i");
  else if (!s.b) out.push(s.i ? "nbi" : "nb");
  if (s.u) out.push("u");
  if (s.s) out.push("s");
  if (s.k) out.push("ink" + s.k);
  return out;
}
function tagsFrom(text, st) {
  const starts = lineStarts(text);
  const open = {}, tags = [];
  for (let x = 0; x <= text.length; x++) {
    const cur = new Set(x < text.length ? tagNames(st[x]) : []);
    for (const name of Object.keys(open)) {
      if (!cur.has(name)) { tags.push([name, open[name], x]); delete open[name]; }
    }
    for (const name of cur) if (!(name in open)) open[name] = x;
  }
  tags.sort((p, q) => STYLE_ORDER.indexOf(p[0]) - STYLE_ORDER.indexOf(q[0]) || p[1] - q[1]);
  return tags.map(([name, a, b]) => [name, offToIdx(a, starts), offToIdx(b, starts)]);
}
const styleKey = (s) => `${+s.b}${+s.i}${+s.u}${+s.s}${s.k}`;
const parseKey = (k) => ({ b: k[0] === "1", i: k[1] === "1", u: k[2] === "1", s: k[3] === "1", k: Number(k.slice(4)) || 0 });

/** Testo formattato come sequenza di <span class="r"> (lista ed editor). */
function renderRuns(container, text, st) {
  container.textContent = "";
  let x = 0;
  while (x < text.length) {
    const key = styleKey(st[x]);
    let y = x + 1;
    while (y < text.length && styleKey(st[y]) === key) y++;
    const s = st[x];
    const span = document.createElement("span");
    span.className = "r" + (s.b ? "" : " nb") + (s.i ? " it" : "") + (s.u ? " u" : "") + (s.s ? " s" : "");
    if (s.k) span.style.color = INKS[s.k]?.[1] || "";
    span.dataset.k = key;
    span.textContent = text.slice(x, y);
    container.appendChild(span);
    x = y;
  }
}

// ---------------------------------------------------------------------------
// Accesso
const AUTH_ERRORS = {
  "auth/invalid-credential": "Email o password non corrette.",
  "auth/invalid-login-credentials": "Email o password non corrette.",
  "auth/wrong-password": "Email o password non corrette.",
  "auth/user-not-found": "Email o password non corrette.",
  "auth/invalid-email": "Questa email non è scritta bene.",
  "auth/too-many-requests": "Troppi tentativi: riprova tra qualche minuto.",
  "auth/network-request-failed": "Connessione non disponibile: controlla la rete e riprova.",
  "auth/user-disabled": "Questo account è disattivato nella console Firebase.",
};

$("formAccesso").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("btnAccedi");
  btn.disabled = true;
  $("erroreAccesso").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch (err) {
    $("erroreAccesso").textContent = AUTH_ERRORS[err.code] || `Accesso non riuscito (${err.code || err.message}).`;
  } finally {
    btn.disabled = false;
  }
});

onAuthStateChanged(auth, (user) => {
  S.unsub.forEach((f) => f());
  S.unsub = [];
  if (!user) {
    S.uid = null;
    delete window.__postitApri;
    widget()?.clear().catch(() => {});
    show("accesso");
    return;
  }
  S.uid = user.uid;
  S.email = user.email || "";
  $("password").value = "";
  loadCache();
  show("lista");
  renderList();
  pushWidget();
  window.__postitApri = openFromWidget;
  S.unsub.push(onValue(ref(db, `users/${S.uid}`), (snap) => {
    const v = snap.val() || {};
    S.notes = v.notes && typeof v.notes === "object" ? v.notes : {};
    S.themes = {};
    for (const [k, t] of Object.entries(v.themes || {})) if (/^c\d+$/.test(k) && t) S.themes[Number(k.slice(1))] = t;
    S.loaded = true;
    saveCache();
    renderList();
    remoteIntoEditor();
  }));
  S.unsub.push(onValue(ref(db, ".info/connected"), (snap) => {
    S.connected = !!snap.val();
    const p = $("pallino");
    p.classList.toggle("in-linea", S.connected);
    p.classList.toggle("offline", !S.connected);
    p.title = S.connected ? "In linea: sincronizzato con il PC" : "Offline: le modifiche partono quando torna la rete";
  }));
});

function cacheKey() { return `postit-copia-${S.uid}`; }
function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey()) || "null");
    if (c) { S.notes = c.notes || {}; S.themes = c.themes || {}; S.loaded = true; }
  } catch { /* copia illeggibile: si aspetta la rete */ }
}
function saveCache() {
  try { localStorage.setItem(cacheKey(), JSON.stringify({ notes: S.notes, themes: S.themes })); } catch { /* pieno */ }
  pushWidget();
}

// ---------------------------------------------------------------------------
// Widget della schermata Home (solo nell'APK)
const widget = () => window.Capacitor?.Plugins?.PostitWidget;
let widgetTimer = null;
function pushWidget() {
  if (!widget() || !S.uid) return;
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(() => {
    const notes = sortedNotes().slice(0, 25).map((n) => ({
      id: n.id, text: typeof n.text === "string" ? n.text : "", color: n.color, updated: Number(n.updated) || 0,
    }));
    widget().update({
      notes: JSON.stringify(notes),
      themes: JSON.stringify(S.themes),
      uid: S.uid,
      refreshToken: auth.currentUser?.refreshToken || "",
    }).catch(() => { /* il widget non è essenziale */ });
  }, 300);
}

/** Tocchi sul widget: aprire un post-it, o scriverne uno nuovo. */
function openFromWidget(req) {
  if (!S.uid || !req) return;
  if (S.ed) { saveEditor(); S.ed = null; }
  closeSheets();
  if (req.nuovo) {
    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^a-z0-9]/gi, "");
    openEditor(id, S.filter ?? 0);
  } else if (req.nota && S.notes[req.nota]) {
    openEditor(req.nota);
  } else {
    show("lista");
    renderList();
  }
}

function show(id) {
  for (const s of ["accesso", "lista", "editorSchermo"]) $(s).hidden = s !== id;
}

// ---------------------------------------------------------------------------
// Lista
const colorName = (c) => S.themes[c] || PAPERS[c][0];
const paperVars = (el, c) => {
  el.style.setProperty("--carta", PAPERS[c][1]);
  el.style.setProperty("--striscia", PAPERS[c][2]);
};
function tilt(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 13) - 6) / 10; // tra -0,6° e +0,6°
}
function sortedNotes() {
  return Object.entries(S.notes)
    .filter(([, n]) => n && typeof n === "object")
    .map(([id, n]) => ({ id, ...n, color: Number(n.color) || 0 }))
    .sort((a, b) => (Number(b.updated) || 0) - (Number(a.updated) || 0));
}

function renderFilters(all) {
  const nav = $("filtri");
  nav.textContent = "";
  const used = new Set(all.map((n) => n.color));
  const colors = PAPER_ORDER.filter((c) => PAD_COLORS.includes(c) || used.has(c));
  const mk = (label, c) => {
    const b = document.createElement("button");
    b.className = "filtro" + (c === null ? " tutti" : "");
    b.setAttribute("aria-pressed", String(S.filter === c));
    if (c !== null) {
      const dot = document.createElement("span");
      dot.className = "punto";
      paperVars(dot, c);
      b.appendChild(dot);
    }
    b.appendChild(document.createTextNode(label));
    b.addEventListener("click", () => { S.filter = S.filter === c && c !== null ? null : c; saveFilter(); renderList(); });
    nav.appendChild(b);
  };
  mk("Tutti", null);
  for (const c of colors) mk(colorName(c), c);
}

function renderList() {
  if (!S.uid) return;
  const all = sortedNotes();
  renderFilters(all);
  const list = S.filter === null ? all : all.filter((n) => n.color === S.filter);
  const grid = $("griglia");
  grid.textContent = "";
  for (const n of list) {
    const card = document.createElement("article");
    card.className = "nota";
    paperVars(card, n.color);
    card.style.setProperty("--storto", tilt(n.id) + "deg");
    const strip = document.createElement("div");
    strip.className = "striscia";
    strip.textContent = S.themes[n.color] || "";
    const body = document.createElement("div");
    body.className = "testo";
    const text = typeof n.text === "string" ? n.text : "";
    renderRuns(body, text, stylesFrom(text, n.tags));
    if (text.split("\n").length > 11 || text.length > 260) body.classList.add("lungo");
    card.append(strip, body);
    card.addEventListener("click", () => openEditor(n.id));
    grid.appendChild(card);
  }
  const empty = $("vuoto");
  if (!S.loaded) {
    empty.textContent = "Caricamento dei post-it…";
  } else if (!all.length) {
    empty.textContent = "Ancora nessun post-it. Tocca + per scriverne uno: comparirà anche sul PC.";
  } else if (!list.length) {
    empty.textContent = `Nessun post-it «${colorName(S.filter)}». Tocca + per scriverne uno.`;
  }
  empty.hidden = !!list.length && S.loaded;
  const fab = $("btnNuovo");
  const c = S.filter ?? 0;
  fab.style.setProperty("--carta-fab", PAPERS[c][1]);
  fab.style.setProperty("--striscia-fab", PAPERS[c][2]);
  fab.setAttribute("aria-label", `Nuovo post-it ${colorName(c)}`);
}

$("btnNuovo").addEventListener("click", () => {
  const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^a-z0-9]/gi, "");
  openEditor(id, S.filter ?? 0);
});

// ---------------------------------------------------------------------------
// Editor
const editor = $("editor");
let saveTimer = null;

function openEditor(id, newColor) {
  const n = S.notes[id];
  const color = n ? Number(n.color) || 0 : newColor;
  const text = n && typeof n.text === "string" ? n.text : "";
  S.ed = { id, color, isNew: !n, dirty: false };
  paintEditor();
  renderEditor(text, stylesFrom(text, n?.tags));
  $("conferma").hidden = true;
  $("formato").hidden = false;
  show("editorSchermo");
  history.pushState({ editor: id }, "");
  if (!n) setTimeout(() => { editor.focus(); placeCaret(0); }, 60);
  updateFormatState();
}

function paintEditor() {
  const c = S.ed.color;
  paperVars($("editorSchermo"), c);
  $("temaEditor").textContent = S.themes[c] || "";
  document.querySelector('meta[name="theme-color"]').content = PAPERS[c][2];
}

function renderEditor(text, st) {
  renderRuns(editor, text, st);
  if (text.endsWith("\n")) {  // l'ultima riga vuota si deve vedere
    const pad = document.createElement("br");
    pad.dataset.pad = "1";
    editor.appendChild(pad);
  }
}

/** Legge testo e stili dal DOM dell'editor (o da un frammento). */
function readNode(root) {
  let text = "";
  const st = [];
  const walk = (node, style) => {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) {
        const t = ch.nodeValue.replace(/​/g, "");
        for (let i = 0; i < t.length; i++) { text += t[i]; st.push({ ...style }); }
      } else if (ch.nodeName === "BR") {
        if (!ch.dataset?.pad) { text += "\n"; st.push({ ...style }); }
      } else if (ch.nodeType === 1) {
        const s = ch.dataset?.k ? parseKey(ch.dataset.k) : style;
        const block = ch.nodeName === "DIV" || ch.nodeName === "P";
        if (block && text.length && !text.endsWith("\n")) { text += "\n"; st.push({ ...s }); }
        walk(ch, s);
      }
    }
  };
  walk(root, { ...DEFAULT_STYLE });
  return { text, st };
}
const readEditor = () => readNode(editor);

function offsetOf(container, offset) {
  const r = document.createRange();
  r.selectNodeContents(editor);
  r.setEnd(container, offset);
  const div = document.createElement("div");
  div.appendChild(r.cloneContents());
  return readNode(div).text.length;
}
function selOffsets() {
  const sel = getSelection();
  if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!editor.contains(r.startContainer)) return null;
  return [offsetOf(r.startContainer, r.startOffset), offsetOf(r.endContainer, r.endOffset)];
}
function pointAt(off) {
  // stesso conteggio di readNode: testo carattere per carattere, <br> vale un a capo
  const w = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const indexIn = (n) => Array.prototype.indexOf.call(n.parentNode.childNodes, n);
  let left = off, node;
  while ((node = w.nextNode())) {
    if (node.nodeType === 3) {
      const len = node.nodeValue.length;
      if (left <= len) return [node, left];
      left -= len;
    } else if (node.nodeName === "BR" && !node.dataset.pad) {
      if (left === 0) return [node.parentNode, indexIn(node)];
      left -= 1;
      if (left === 0) return [node.parentNode, indexIn(node) + 1];
    }
  }
  return [editor, editor.childNodes.length];
}
function setSel(a, b) {
  const r = document.createRange();
  const [n1, o1] = pointAt(a);
  const [n2, o2] = pointAt(b);
  r.setStart(n1, o1);
  r.setEnd(n2, o2);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}
const placeCaret = (off) => setSel(off, off);

function wordAt(text, off) {
  const isW = (c) => c && /[\p{L}\p{N}'’]/u.test(c);
  let a = off, b = off;
  while (a > 0 && isW(text[a - 1])) a--;
  while (b < text.length && isW(text[b])) b++;
  return [a, b];
}

function styleAtCaret() {
  const o = selOffsets();
  const m = readEditor();
  if (!o || !m.text.length) return { ...DEFAULT_STYLE };
  const [a, b] = o;
  if (a < b) return m.st[a];
  return m.st[Math.max(0, a - 1)] || m.st[a] || { ...DEFAULT_STYLE };
}

function updateFormatState() {
  const s = styleAtCaret();
  for (const btn of document.querySelectorAll("#formato [data-f]")) {
    btn.setAttribute("aria-pressed", String(!!s[btn.dataset.f]));
  }
  for (const btn of document.querySelectorAll(".inchiostro")) {
    btn.setAttribute("aria-pressed", String(Number(btn.dataset.k) === s.k));
  }
}

/** G, C, S, ab e inchiostro: sulla selezione, o sulla parola sotto il cursore. */
function applyFormat(attr, value) {
  const o = selOffsets();
  if (!o) return;
  const m = readEditor();
  let [a, b] = o;
  const collapsed = a === b;
  if (collapsed) [a, b] = wordAt(m.text, a);
  if (a === b) return;
  const val = attr === "k" ? value : !m.st.slice(a, b).every((s) => s[attr]);
  for (let x = a; x < b; x++) m.st[x] = { ...m.st[x], [attr]: val };
  renderEditor(m.text, m.st);
  if (collapsed) placeCaret(o[0]); else setSel(a, b);
  markDirty();
  updateFormatState();
}

function buildToolbar() {
  const box = $("inchiostri");
  INKS.forEach(([name, col], k) => {
    const b = document.createElement("button");
    b.className = "inchiostro";
    b.dataset.k = String(k);
    b.setAttribute("aria-label", `Inchiostro ${name.toLowerCase()}`);
    const dot = document.createElement("span");
    dot.style.setProperty("--ink", col);
    b.appendChild(dot);
    box.appendChild(b);
  });
  // i tasti non devono rubare il fuoco: la selezione resta nel testo
  $("formato").addEventListener("pointerdown", (e) => { if (e.target.closest("button")) e.preventDefault(); });
  $("formato").addEventListener("click", (e) => {
    const f = e.target.closest("[data-f]");
    const ink = e.target.closest(".inchiostro");
    if (f) applyFormat(f.dataset.f);
    else if (ink) applyFormat("k", Number(ink.dataset.k));
  });
}
buildToolbar();

editor.addEventListener("beforeinput", (e) => {
  if (e.inputType === "insertParagraph") {  // a capo come "\n", non come <div>
    e.preventDefault();
    document.execCommand("insertLineBreak");
  }
});
editor.addEventListener("input", markDirty);
document.addEventListener("selectionchange", () => {
  if (!$("editorSchermo").hidden && document.activeElement === editor) updateFormatState();
});

function markDirty() {
  if (!S.ed) return;
  S.ed.dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveEditor, 600);
}

function saveEditor() {
  clearTimeout(saveTimer);
  if (!S.ed || !S.ed.dirty || !S.uid) return;
  const { id } = S.ed;
  const m = readEditor();
  const exists = !!S.notes[id];
  if (!exists && !m.text.trim()) return; // un post-it nuovo vuoto non si crea
  const tags = tagsFrom(m.text, m.st);
  const data = { text: m.text, tags: tags.length ? tags : null, updated: serverTimestamp() };
  if (!exists) data.color = S.ed.color;
  // copia locale subito, così la lista è giusta anche offline
  S.notes[id] = { ...(S.notes[id] || { color: S.ed.color }), text: m.text, tags: tags.length ? tags : undefined, updated: Date.now() };
  S.ed.dirty = false;
  S.ed.isNew = false;
  saveCache();
  update(ref(db, `users/${S.uid}/notes/${id}`), data).catch(() => { /* resta in coda nel SDK */ });
}

/** Un post-it aperto cambia sul PC: si ridisegna, ma non mentre lo si sta scrivendo. */
function remoteIntoEditor() {
  if (!S.ed || $("editorSchermo").hidden) return;
  const n = S.notes[S.ed.id];
  if (!n) {
    if (!S.ed.isNew) closeEditor(false);  // eliminato altrove
    return;
  }
  if (Number(n.color) !== S.ed.color) { S.ed.color = Number(n.color) || 0; paintEditor(); }
  if (S.ed.dirty || document.activeElement === editor) return;
  const text = typeof n.text === "string" ? n.text : "";
  const cur = readEditor();
  if (cur.text === text && JSON.stringify(tagsFrom(cur.text, cur.st)) === JSON.stringify(n.tags || [])) return;
  renderEditor(text, stylesFrom(text, n.tags));
}

function closeEditor(save = true) {
  if (save) saveEditor();
  S.ed = null;
  editor.blur();
  document.querySelector('meta[name="theme-color"]').content = "#1b1814";
  closeSheets();
  show("lista");
  renderList();
}

$("btnIndietro").addEventListener("click", () => history.back());
window.addEventListener("popstate", () => {
  if (!sheetsHidden()) { closeSheets(); if (S.ed) history.pushState({ editor: S.ed.id }, ""); return; }
  if (S.ed) closeEditor(true);
});

// colore
$("btnColore").addEventListener("click", () => {
  const box = $("colori");
  box.textContent = "";
  for (const c of PAPER_ORDER) {
    const b = document.createElement("button");
    b.className = "colore";
    b.setAttribute("aria-pressed", String(S.ed.color === c));
    const sw = document.createElement("span");
    sw.className = "campione";
    paperVars(sw, c);
    const name = document.createElement("span");
    name.className = "nome";
    name.textContent = colorName(c);
    b.append(sw, name);
    b.addEventListener("click", () => {
      S.ed.color = c;
      paintEditor();
      if (S.notes[S.ed.id]) {
        S.notes[S.ed.id].color = c;
        saveCache();
        update(ref(db, `users/${S.uid}/notes/${S.ed.id}`), { color: c, updated: serverTimestamp() }).catch(() => {});
      }
      closeSheets();
    });
    box.appendChild(b);
  }
  openSheet("foglioColori");
});

// eliminazione
$("btnElimina").addEventListener("click", () => {
  editor.blur();
  $("formato").hidden = true;
  $("conferma").hidden = false;
});
$("btnAnnullaElimina").addEventListener("click", () => {
  $("conferma").hidden = true;
  $("formato").hidden = false;
});
$("btnConfermaElimina").addEventListener("click", () => {
  const id = S.ed.id;
  clearTimeout(saveTimer);
  S.ed.dirty = false;
  if (S.notes[id]) {
    delete S.notes[id];
    saveCache();
    remove(ref(db, `users/${S.uid}/notes/${id}`)).catch(() => {});
  }
  history.back();
});

// fogli a scomparsa e menu
function openSheet(id) { $("velo").hidden = false; $(id).hidden = false; }
function closeSheets() { $("velo").hidden = true; $("foglioColori").hidden = true; $("foglioMenu").hidden = true; }
const sheetsHidden = () => $("foglioColori").hidden && $("foglioMenu").hidden;
$("velo").addEventListener("click", closeSheets);
$("btnMenu").addEventListener("click", () => {
  $("menuAccount").textContent = `Collegato come ${S.email}`;
  openSheet("foglioMenu");
});
$("btnEsci").addEventListener("click", async () => {
  closeSheets();
  try { localStorage.removeItem(cacheKey()); } catch { /* niente */ }
  S.notes = {}; S.themes = {}; S.loaded = false;
  await signOut(auth);
});

// salva prima di andare in secondo piano
document.addEventListener("visibilitychange", () => { if (document.hidden) saveEditor(); });
window.addEventListener("pagehide", saveEditor);

// per il collaudo
window.__postit = { S, stylesFrom, tagsFrom, readEditor, applyFormat, setSel, saveEditor };
