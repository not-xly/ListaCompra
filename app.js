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
let openCatId = null; // grupo desplegado (sólo uno a la vez)
let editing = false;  // modo edición: tocar un artículo lo abre para editarlo
let editingId = null; // artículo abierto en el diálogo (null = nuevo)
let readOnly = false; // datos guardados ilegibles: no sobrescribir hasta importar

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const byName = (a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });
const itemsOf = (catId) => state.items.filter((i) => i.cat === catId).sort(byName);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function seedState() {
  return {
    v: 1,
    cats: SEED_CATEGORIES.map(([id, name]) => ({ id, name })),
    items: SEED_ITEMS.map(([cat, name]) => ({ id: uid(), name, cat, sel: false, bought: false })),
  };
}

function loadState() {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return seedState();
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.cats) || !Array.isArray(data.items)) throw new Error("formato no reconocido");
    return data;
  } catch (err) {
    readOnly = true;
    alert("No se han podido leer los datos guardados (" + err.message + "). " +
      "No se modificará nada hasta que importes un archivo de copia.");
    return { v: 1, cats: [], items: [] };
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

// Pantalla principal: grupos en acordeón

function render() {
  groupsEl.replaceChildren();
  for (const cat of state.cats) {
    if (openCatId && cat.id !== openCatId) continue; // con un grupo abierto, sólo se ve ese
    const items = itemsOf(cat.id);
    const open = cat.id === openCatId;
    const section = el("section", "group" + (open ? " open" : ""));
    const head = el("button", "group-title");
    head.type = "button";
    head.dataset.cat = cat.id;
    head.append(el("span", "", cat.name), el("span", "group-count"));
    head.addEventListener("click", () => {
      openCatId = open ? null : cat.id;
      render();
      // Al abrir, el grupo queda arriba; al cerrar, la lista vuelve a verse centrada en ese grupo.
      const target = openCatId ? groupsEl.querySelector(".group.open") : groupsEl.querySelector(`.group-title[data-cat="${cat.id}"]`);
      target.scrollIntoView({ block: "start" });
    });
    section.append(head);
    if (open) {
      const grid = el("div", "items");
      grid.style.gridTemplateRows = "repeat(" + Math.ceil(items.length / 2) + ", auto)";
      for (const item of items) grid.append(itemButton(item));
      section.append(grid);
    }
    groupsEl.append(section);
  }
  groupsEl.classList.toggle("editing", editing);
  document.getElementById("editHint").hidden = !editing;
  document.getElementById("editBtn").classList.toggle("on", editing);
  updateCounts();
}

function updateCounts() {
  for (const head of groupsEl.querySelectorAll(".group-title")) {
    const items = itemsOf(head.dataset.cat);
    head.querySelector(".group-count").textContent = items.filter((i) => i.sel).length + "/" + items.length;
  }
  const n = state.items.filter((i) => i.sel).length;
  document.getElementById("viewBtn").textContent = "Editar seleccionados (" + n + ")";
}

function itemButton(item) {
  const btn = el("button", "item" + (item.sel ? " sel" : ""));
  btn.type = "button";
  btn.append(el("span", "name", item.name));
  btn.addEventListener("click", () => {
    if (editing) return openFicha(item);
    setSelected(item, !item.sel, btn); // un toque selecciona o quita
  });
  return btn;
}

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
  const options = state.cats.map((c) => new Option(c.name, c.id));
  options.push(new Option("+ Nuevo grupo…", "__new__"));
  select.replaceChildren(...options);
  select.value = selected;
  toggleNewCat();
}

function toggleNewCat() {
  const isNew = document.getElementById("fCat").value === "__new__";
  document.getElementById("newCatField").hidden = !isNew;
}

function openFicha(item, catId = openCatId) {
  editingId = item ? item.id : null;
  document.getElementById("fichaTitle").textContent = item ? "Editar artículo" : "Nuevo artículo";
  document.getElementById("fName").value = item ? item.name : "";
  document.getElementById("fNewCat").value = "";
  document.getElementById("fDelete").hidden = !item;
  fillCategorySelect(item ? item.cat : (catId ?? state.cats[0].id));
  ficha.showModal();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("fName").value.trim();
  if (!name) return;

  let cat = document.getElementById("fCat").value;
  if (cat === "__new__") {
    const newName = document.getElementById("fNewCat").value.trim();
    if (!newName) return document.getElementById("fNewCat").focus();
    const same = state.cats.find((c) => c.name.toLowerCase() === newName.toLowerCase());
    if (same) {
      cat = same.id;
    } else {
      cat = uid();
      state.cats.push({ id: cat, name: newName });
    }
  }

  if (editingId) {
    Object.assign(state.items.find((i) => i.id === editingId), { name, cat });
  } else {
    state.items.push({ id: uid(), name, cat, sel: false, bought: false });
  }
  save();
  ficha.close();
  render();
});

document.getElementById("fCat").addEventListener("change", () => {
  toggleNewCat();
  if (!document.getElementById("newCatField").hidden) document.getElementById("fNewCat").focus();
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
  openCatId = null; // vuelven a verse todos los grupos
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
    state = data;
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
if (!readOnly && localStorage.getItem(KEY) === null) save();
render();
