"use strict";

// Clave propia: todas las apps de not-xly.github.io comparten el mismo localStorage.
const KEY = "lista-compra-v1";

const groupsEl = document.getElementById("groups");
const datosDialog = document.getElementById("datos");
const ficha = document.getElementById("ficha");
const form = document.getElementById("fichaForm");

let state = null;     // { v, cats: [{id, name}], items: [{id, name, cat, sel}] }
let tab = "alimentacion"; // pantalla visible: id de un grupo o "compra"
let editing = false;  // modo edición: tocar un artículo lo abre para editarlo
let editingId = null; // artículo abierto en el diálogo (null = nuevo)
let readOnly = false; // datos guardados ilegibles: no sobrescribir hasta importar

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const byName = (a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });
const itemsOf = (catId) => state.items.filter((i) => i.cat === catId).sort(byName);
const COLS = 3; // columnas de cada grupo; el orden alfabético baja por la primera, luego la segunda…

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function seedState() {
  return {
    v: 4,
    cats: SEED_CATEGORIES.map(([id, name]) => ({ id, name })),
    items: SEED_ITEMS.map(([cat, name]) => ({ id: uid(), name, cat, sel: false })),
  };
}

// v1 tenía 13 grupos (y los que se hubieran creado a mano). Se juntan en dos:
// limpieza, ropa e higiene por un lado; todo lo demás en alimentación y bebidas.
// Se conservan los artículos, las selecciones y las marcas de comprado.
// v2 acortó los nombres; v3 devuelve el original a los que aún tienen el nombre corto
// (los renombrados a mano no se tocan). v4: tres pantallas; los grupos se llaman
// sólo «Alimentación» y «Limpieza» y desaparece la marca de comprado.
const LIMPIEZA_V1 = new Set(["casa", "ropa", "higiene"]);
const ORIGINAL_NAMES = Object.fromEntries(Object.entries(SHORT_NAMES_V2).map(([long, short]) => [short, long]));
function migrate(data) {
  if (data.v >= 4) return data;
  if (!(data.v >= 2)) {
    for (const item of data.items) item.cat = LIMPIEZA_V1.has(item.cat) ? "limpieza" : "alimentacion";
  } else if (data.v === 2) {
    for (const item of data.items) if (Object.hasOwn(ORIGINAL_NAMES, item.name)) item.name = ORIGINAL_NAMES[item.name];
  }
  data.cats = SEED_CATEGORIES.map(([id, name]) => ({ id, name }));
  for (const item of data.items) delete item.bought;
  data.v = 4;
  return data;
}

function loadState() {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return seedState();
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.cats) || !Array.isArray(data.items)) throw new Error("formato no reconocido");
    return migrate(data);
  } catch (err) {
    readOnly = true;
    alert("No se han podido leer los datos guardados (" + err.message + "). " +
      "No se modificará nada hasta que importes un archivo de copia.");
    return { v: 4, cats: [], items: [] };
  }
}

function save() {
  if (readOnly) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    alert("No se han podido guardar los cambios: " + err.message);
  }
}

// Tres pantallas: Alimentación y Limpieza para elegir; Compra con lo elegido

let query = ""; // texto del buscador (sólo en Alimentación y Limpieza)

// Sin distinguir mayúsculas ni acentos
const normalize = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function render() {
  const compra = tab === "compra";
  document.getElementById("title").textContent = compra ? "Compra" : state.cats.find((c) => c.id === tab).name;
  document.getElementById("editBtn").hidden = compra;
  document.getElementById("addBtn").hidden = compra;
  document.getElementById("clearBtn").hidden = !compra;
  document.getElementById("searchBar").hidden = compra;
  if (compra) editing = false;
  groupsEl.replaceChildren();
  if (compra) renderCompra();
  else renderCat(tab);
  groupsEl.classList.toggle("editing", editing);
  document.getElementById("editBtn").classList.toggle("on", editing);
  document.getElementById("editHint").hidden = !editing;
  for (const b of document.querySelectorAll(".tabs button")) b.classList.toggle("on", b.dataset.tab === tab);
  updateCounts();
}

// Cuadrícula en orden alfabético por columnas: baja por la primera, luego la segunda…
function grid(items, cols, make) {
  const node = el("div", "items cols" + cols);
  node.style.gridTemplateRows = "repeat(" + Math.ceil(items.length / cols) + ", auto)";
  for (const item of items) node.append(make(item));
  return node;
}

// Con búsqueda se ve todo igual, pero los artículos encontrados se marcan
// y la lista se desplaza hasta el primero.
function renderCat(catId) {
  const items = itemsOf(catId);
  const q = normalize(query);
  const hits = query ? new Set(items.filter((i) => normalize(i.name).includes(q)).map((i) => i.id)) : null;
  if (hits && !hits.size) {
    groupsEl.append(el("p", "search-empty", "Ningún artículo de esta pantalla coincide con «" + query + "»."));
    return;
  }
  groupsEl.append(grid(items, COLS, (item) => itemButton(item, hits ? hits.has(item.id) : false)));
  if (hits) groupsEl.querySelector(".item.hit").scrollIntoView({ block: "center" });
}

function updateCounts() {
  const n = state.items.filter((i) => i.sel).length;
  document.getElementById("tabCompra").textContent = "Compra (" + n + ")";
}

function itemButton(item, hit = false) {
  const btn = el("button", "item" + (item.sel ? " sel" : "") + (hit ? " hit" : ""));
  btn.type = "button";
  btn.append(el("span", "name", item.name));
  btn.addEventListener("click", () => {
    if (editing) return openFicha(item);
    item.sel = !item.sel; // un toque selecciona o quita
    btn.classList.toggle("sel", item.sel);
    save();
    updateCounts();
    expand(btn);
  });
  return btn;
}

// El último artículo tocado muestra el nombre entero si no le cabía.
function expand(btn) {
  const was = btn.classList.contains("expanded");
  collapse();
  const name = btn.querySelector(".name");
  if (!was && name.scrollWidth > name.clientWidth + 1) btn.classList.add("expanded");
}

function collapse() {
  for (const b of groupsEl.querySelectorAll(".item.expanded")) b.classList.remove("expanded");
}
groupsEl.addEventListener("scroll", collapse, { passive: true });

// Compra: sólo lo elegido, separado por grupo. Tocar un artículo lo quita de la lista.
function renderCompra() {
  const selected = state.items.filter((i) => i.sel);
  if (!selected.length) {
    groupsEl.append(el("p", "search-empty", "La lista está vacía. Elige artículos en Alimentación o Limpieza."));
    return;
  }
  for (const cat of state.cats) {
    const items = selected.filter((i) => i.cat === cat.id).sort(byName);
    if (!items.length) continue;
    groupsEl.append(el("h2", "group-title", cat.name), grid(items, 2, compraButton));
  }
}

function compraButton(item) {
  const btn = el("button", "item");
  btn.type = "button";
  btn.append(el("span", "name", item.name));
  btn.addEventListener("click", () => {
    item.sel = false;
    save();
    render();
    showUndo([item], "«" + item.name + "» quitado");
  });
  return btn;
}

// Aviso con «Deshacer» por si se toca algo sin querer.
let undoItems = [];
let undoTimer = null;
function showUndo(items, text) {
  undoItems = items;
  document.getElementById("toastText").textContent = text;
  document.getElementById("toast").hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, 5000);
}
function hideUndo() {
  document.getElementById("toast").hidden = true;
  undoItems = [];
}
document.getElementById("undoBtn").addEventListener("click", () => {
  undoItems.forEach((i) => { i.sel = true; });
  save();
  hideUndo();
  render();
});

// Diálogo de artículo

function fillCategorySelect(selected) {
  const select = document.getElementById("fCat");
  select.replaceChildren(...state.cats.map((c) => new Option(c.name, c.id)));
  select.value = selected;
}

function openFicha(item) {
  editingId = item ? item.id : null;
  document.getElementById("fichaTitle").textContent = item ? "Editar artículo" : "Nuevo artículo";
  document.getElementById("fName").value = item ? item.name : "";
  document.getElementById("fDelete").hidden = !item;
  fillCategorySelect(item ? item.cat : tab);
  ficha.showModal();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("fName").value.trim();
  if (!name) return;

  const cat = document.getElementById("fCat").value;

  if (editingId) {
    Object.assign(state.items.find((i) => i.id === editingId), { name, cat });
  } else {
    state.items.push({ id: uid(), name, cat, sel: false });
  }
  save();
  ficha.close();
  render();
});

document.getElementById("fCancel").addEventListener("click", () => ficha.close());

document.getElementById("fDelete").addEventListener("click", () => {
  const item = state.items.find((i) => i.id === editingId);
  if (!item || !confirm("¿Borrar «" + item.name + "»?")) return;
  state.items = state.items.filter((i) => i !== item);
  save();
  ficha.close();
  render();
});

// Cabecera

document.getElementById("search").addEventListener("input", (event) => {
  query = event.target.value.trim();
  render();
});

document.getElementById("addBtn").addEventListener("click", () => {
  if (readOnly) return alert("No se pueden añadir artículos hasta que se recupere la lista (menú Datos).");
  openFicha(null);
});

document.getElementById("editBtn").addEventListener("click", () => {
  editing = !editing;
  render();
});

document.getElementById("datosBtn").addEventListener("click", () => datosDialog.showModal());
document.getElementById("datosClose").addEventListener("click", () => datosDialog.close());

// Pestañas

for (const b of document.querySelectorAll(".tabs button")) {
  b.addEventListener("click", () => {
    if (b.dataset.tab === tab) return;
    tab = b.dataset.tab;
    query = "";
    document.getElementById("search").value = "";
    hideUndo();
    render();
    groupsEl.scrollTop = 0;
  });
}

document.getElementById("clearBtn").addEventListener("click", () => {
  const selected = state.items.filter((i) => i.sel);
  if (readOnly || !selected.length || !confirm("¿Vaciar la lista de la compra?")) return;
  selected.forEach((i) => { i.sel = false; });
  save();
  render();
  showUndo(selected, "Lista vaciada");
});

// Datos: copia de seguridad

document.getElementById("exportBtn").addEventListener("click", () => {
  if (readOnly) return alert("No hay datos válidos que exportar.");
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a");
  a.href = url;
  a.download = "lista-compra-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.getElementById("importFile").addEventListener("change", (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch {
      return alert("El archivo no es un JSON válido.");
    }
    if (!data || !Array.isArray(data.cats) || !Array.isArray(data.items)) {
      return alert("El archivo no es una copia de esta lista.");
    }
    if (!confirm("Esto sustituirá la lista actual. ¿Continuar?")) return;
    state = migrate(data); // una copia antigua llega con los 13 grupos
    readOnly = false;
    save();
    datosDialog.close();
    render();
  };
  reader.readAsText(file);
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

// Arranque: al final, con todas las constantes ya declaradas.
state = loadState();
if (!readOnly) save(); // guarda la lista inicial o la ya migrada a dos grupos
render();
