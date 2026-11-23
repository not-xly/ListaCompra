"use strict";

// Clave propia: todas las apps de not-xly.github.io comparten el mismo localStorage.
const KEY = "lista-compra-v1";

const groupsEl = document.getElementById("groups");
const compraDialog = document.getElementById("compra");
const compraList = document.getElementById("compraList");
const datosDialog = document.getElementById("datos");
const ficha = document.getElementById("ficha");
const form = document.getElementById("fichaForm");

let state = null;     // { v, cats: [{id, name}], items: [{id, name, cat, sel, bought}] }
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
    v: 3,
    cats: SEED_CATEGORIES.map(([id, name]) => ({ id, name })),
    items: SEED_ITEMS.map(([cat, name]) => ({ id: uid(), name, cat, sel: false, bought: false })),
  };
}

// v1 tenía 13 grupos (y los que se hubieran creado a mano). Se juntan en dos:
// limpieza, ropa e higiene por un lado; todo lo demás en alimentación y bebidas.
// Se conservan los artículos, las selecciones y las marcas de comprado.
// v2 acortó los nombres; v3 devuelve el original a los que aún tienen el nombre corto
// (los renombrados a mano no se tocan).
const LIMPIEZA_V1 = new Set(["casa", "ropa", "higiene"]);
const ORIGINAL_NAMES = Object.fromEntries(Object.entries(SHORT_NAMES_V2).map(([long, short]) => [short, long]));
function migrate(data) {
  if (data.v >= 3) return data;
  if (!(data.v >= 2)) {
    for (const item of data.items) item.cat = LIMPIEZA_V1.has(item.cat) ? "limpieza" : "alimentacion";
    data.cats = SEED_CATEGORIES.map(([id, name]) => ({ id, name }));
  } else {
    for (const item of data.items) if (Object.hasOwn(ORIGINAL_NAMES, item.name)) item.name = ORIGINAL_NAMES[item.name];
  }
  data.v = 3;
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
    return { v: 3, cats: [], items: [] };
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

// Pantalla principal: los dos grupos, siempre desplegados

let query = ""; // texto del buscador: vacío = lista por grupos normal

// Sin distinguir mayúsculas ni acentos
const normalize = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function render() {
  groupsEl.replaceChildren();
  renderGroups();
  groupsEl.classList.toggle("editing", editing);
  document.getElementById("editBtn").classList.toggle("on", editing);
  document.getElementById("editHint").hidden = !editing;
  updateCounts();
}

// Con búsqueda se ve todo igual, pero los artículos encontrados se marcan
// y la lista se desplaza hasta el primero.
function renderGroups() {
  const q = normalize(query);
  const hits = query ? new Set(state.items.filter((i) => normalize(i.name).includes(q)).map((i) => i.id)) : null;
  if (hits && !hits.size) {
    groupsEl.append(el("p", "search-empty", "Ningún artículo coincide con «" + query + "»."));
    return;
  }
  for (const cat of state.cats) {
    const items = itemsOf(cat.id);
    const section = el("section", "group");
    const head = el("h2", "group-title");
    head.dataset.cat = cat.id;
    head.append(el("span", "", cat.name), el("span", "group-count"));
    const grid = el("div", "items");
    grid.style.gridTemplateRows = "repeat(" + Math.ceil(items.length / COLS) + ", auto)";
    for (const item of items) grid.append(itemButton(item, hits ? hits.has(item.id) : false));
    section.append(head, grid);
    groupsEl.append(section);
  }
  if (hits) groupsEl.querySelector(".item.hit").scrollIntoView({ block: "center" });
}

function updateCounts() {
  for (const head of groupsEl.querySelectorAll(".group-title")) {
    const items = itemsOf(head.dataset.cat);
    head.querySelector(".group-count").textContent = items.filter((i) => i.sel).length + "/" + items.length;
  }
  const n = state.items.filter((i) => i.sel).length;
  document.getElementById("viewBtn").textContent = "Editar seleccionados (" + n + ")";
}

function itemButton(item, hit = false) {
  const btn = el("button", "item" + (item.sel ? " sel" : "") + (hit ? " hit" : ""));
  btn.type = "button";
  btn.append(el("span", "name", item.name));
  btn.addEventListener("click", () => {
    if (editing) return openFicha(item);
    setSelected(item, !item.sel, btn); // un toque selecciona o quita
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

function setSelected(item, value, btn) {
  item.sel = value;
  if (!value) item.bought = false;
  btn.classList.toggle("sel", value);
  save();
  updateCounts();
}

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
  fillCategorySelect(item ? item.cat : state.cats[0].id);
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
    state.items.push({ id: uid(), name, cat, sel: false, bought: false });
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

// Pantalla de la compra

function openCompra() {
  renderCompra();
  compraDialog.showModal();
}

function renderCompra() {
  compraList.replaceChildren();
  const selected = state.items.filter((i) => i.sel).sort(byName);
  if (!selected.length) {
    compraList.append(el("p", "empty", "Todavía no hay artículos seleccionados. Toca un artículo dentro de su grupo para seleccionarlo."));
  }
  compraList.style.gridTemplateRows = selected.length ? "repeat(" + Math.ceil(selected.length / 2) + ", auto)" : "";
  for (const item of selected) compraList.append(compraRow(item));
  const pending = selected.filter((i) => !i.bought).length;
  document.getElementById("compraCount").textContent = selected.length ? pending + " por comprar" : "";
}

function compraRow(item) {
  const row = el("div", "compra-row" + (item.bought ? " bought" : ""));

  const main = el("button", "compra-main");
  main.type = "button";
  main.append(el("span", "box"), el("span", "name", item.name));
  main.addEventListener("click", () => {
    item.bought = !item.bought;
    save();
    renderCompra();
  });

  const quit = el("button", "compra-quit", "×");
  quit.type = "button";
  quit.setAttribute("aria-label", "Quitar de la compra");
  quit.addEventListener("click", () => {
    item.sel = false;
    item.bought = false;
    save();
    renderCompra();
    render();
  });

  row.append(main, quit);
  return row;
}

document.getElementById("viewBtn").addEventListener("click", openCompra);
document.getElementById("compraClose").addEventListener("click", () => compraDialog.close());

// Devuelve true si se ha reseteado.
function resetList() {
  if (readOnly || !confirm("¿Empezar de cero? Se quitarán todas las selecciones y marcas de comprado.")) return false;
  state.items.forEach((i) => { i.sel = false; i.bought = false; });
  save();
  render();
  return true;
}

document.getElementById("resetBtn").addEventListener("click", resetList);
document.getElementById("compraReset").addEventListener("click", () => {
  if (resetList()) compraDialog.close();
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
