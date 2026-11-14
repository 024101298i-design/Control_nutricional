/* NutriMeta · Módulo 2: buscador y registro de alimentos
   Búsqueda en Open Food Facts + "Mis alimentos" locales + alimento manual.
   El registro diario se guarda en localStorage: nutrimeta:v1:dia:AAAA-MM-DD */
(() => {
  'use strict';

  const NM = window.NutriMeta;
  const fmt = NM.fmt;

  const MEALS = [
    { id: 'breakfast', label: 'Desayuno' },
    { id: 'lunch', label: 'Almuerzo' },
    { id: 'dinner', label: 'Cena' },
    { id: 'snacks', label: 'Snacks' },
  ];

  const API = 'https://world.openfoodfacts.org/cgi/search.pl';
  const MIN_CHARS = 3;
  const DEBOUNCE_MS = 700; // Open Food Facts limita las búsquedas (~10 por minuto)

  const $ = (id) => document.getElementById(id);
  const els = {
    form: $('search-form'), input: $('search-input'), status: $('search-status'),
    boxMine: $('results-mine'), listMine: $('list-mine'),
    boxOnline: $('results-online'), listOnline: $('list-online'),
    openManual: $('open-manual'), more: $('search-more'), onlineTitle: $('title-online'),
    dayTitle: $('day-title'), daySummary: $('day-summary'), meals: $('meals'),
    // diálogo "añadir"
    addDlg: $('add-dialog'), addForm: $('add-form'), addName: $('add-name'), addPer: $('add-per'),
    addQty: $('add-qty'), addUnit: $('add-unit'), addMeal: $('add-meal'), addPreview: $('add-preview'),
    addCancel: $('add-cancel'),
    // diálogo "manual"
    manDlg: $('manual-dialog'), manForm: $('manual-form'), manName: $('man-name'),
    manBasis: $('man-basis'), manKcal: $('man-kcal'), manProtein: $('man-protein'),
    manCarbs: $('man-carbs'), manFat: $('man-fat'), manUnitGrams: $('man-unit-grams'),
    manUnitGramsWrap: $('man-unit-grams-wrap'), manQty: $('man-qty'), manQtyLabel: $('man-qty-label'),
    manMeal: $('man-meal'), manSave: $('man-save'), manCancel: $('man-cancel'),
    // diálogo "editar"
    edDlg: $('edit-dialog'), edForm: $('edit-form'), edName: $('ed-name'), edQty: $('ed-qty'),
    edUnit: $('ed-unit'), edMeal: $('ed-meal'), edKcal: $('ed-kcal'), edProtein: $('ed-protein'),
    edCarbs: $('ed-carbs'), edFat: $('ed-fat'), edCancel: $('ed-cancel'),
  };

  /* ---------- Utilidades ---------- */
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    children.flat().forEach((c) => { if (c) node.append(c); });
    return node;
  }

  const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
  const round1 = (n) => Math.round(n * 10) / 10;
  const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function defaultMeal() {
    const h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 16) return 'lunch';
    if (h < 19) return 'snacks';
    return 'dinner';
  }

  function fillMealSelect(select) {
    select.replaceChildren(...MEALS.map((m) => el('option', { value: m.id, text: m.label })));
  }

  /* ---------- Estado ---------- */
  let currentDate = NM.dateKey();
  let log = loadLog(currentDate);
  let myFoods = NM.read('mis-alimentos', []);
  const searchCache = new Map();
  let controller = null;
  let timer = null;
  let selected = null;
  let scope = NM.read('busqueda-ambito', 'pe') === 'world' ? 'world' : 'pe'; // 'pe' | 'world'

  function loadLog(date) {
    const saved = NM.read(`dia:${date}`, null) || {};
    const meals = saved.meals || {};
    MEALS.forEach((m) => { if (!Array.isArray(meals[m.id])) meals[m.id] = []; });
    return { meals };
  }
  const saveLog = () => NM.write(`dia:${currentDate}`, log);
  const saveMine = () => NM.write('mis-alimentos', myFoods);

  /* ---------- Cálculo de nutrientes ----------
     food.basis 'g'    → valores por 100 g (cantidad en g, o en unidades si hay unitGrams)
     food.basis 'unit' → valores por 1 unidad/porción                              */
  function nutrientsFor(food, qty, unit) {
    let factor;
    if (food.basis === 'unit') factor = qty;
    else factor = (unit === 'u' ? qty * food.unitGrams : qty) / 100;
    return {
      kcal: Math.round(food.kcal * factor),
      protein: round1(food.protein * factor),
      carbs: round1(food.carbs * factor),
      fat: round1(food.fat * factor),
    };
  }

  /* ---------- Open Food Facts ---------- */
  function normalizeOFF(p) {
    const name = (p.product_name || '').trim();
    if (!name) return null;
    const n = p.nutriments || {};
    let kcal = num(n['energy-kcal_100g']);
    if (kcal === null && num(n['energy_100g']) !== null) kcal = num(n['energy_100g']) / 4.184;
    if (kcal === null) return null;
    const serving = num(p.serving_quantity);
    return {
      id: `off:${p.code}`,
      source: 'off',
      name,
      brand: (p.brands || '').split(',')[0].trim(),
      basis: 'g',
      kcal,
      protein: num(n.proteins_100g) ?? 0,
      carbs: num(n.carbohydrates_100g) ?? 0,
      fat: num(n.fat_100g) ?? 0,
      unitGrams: serving && serving > 0 ? serving : null,
    };
  }

  async function searchOnline(q, where) {
    const key = `${where}:${plain(q)}`;
    if (searchCache.has(key)) return searchCache.get(key);
    if (controller) controller.abort();
    controller = new AbortController();
    const params = new URLSearchParams({
      search_terms: q, search_simple: '1', action: 'process', json: '1', page_size: '24',
      sort_by: 'unique_scans_n', // primero los productos más escaneados
      fields: 'code,product_name,brands,nutriments,serving_quantity',
    });
    if (where === 'pe') {
      // Solo productos vendidos en Perú
      params.set('tagtype_0', 'countries');
      params.set('tag_contains_0', 'contains');
      params.set('tag_0', 'peru');
    }
    const res = await fetch(`${API}?${params}`, { signal: controller.signal });
    if (!res.ok) { const err = new Error('http'); err.status = res.status; throw err; }
    const data = await res.json();
    const foods = (data.products || []).map(normalizeOFF).filter(Boolean);
    searchCache.set(key, foods);
    return foods;
  }

  /* ---------- Búsqueda: render ---------- */
  function foodRow(food) {
    const per = food.basis === 'unit' ? 'por unidad' : 'por 100 g';
    const info = `${fmt(food.kcal)} kcal · ${fmt(food.protein, 1)} g prot. ${per}`;
    const li = el('li', { class: 'food-item' },
      el('button', { class: 'food-main', type: 'button', onclick: () => openAdd(food) },
        el('span', { class: 'food-name', text: food.name }),
        el('span', { class: 'food-meta', text: [food.brand, info].filter(Boolean).join(' · ') })));
    if (food.source === 'mine') {
      li.append(el('button', {
        class: 'icon-btn', type: 'button', 'aria-label': `Quitar ${food.name} de mis alimentos`,
        text: 'Quitar', onclick: () => removeMine(food.id),
      }));
    }
    return li;
  }

  function renderList(box, list, foods) {
    list.replaceChildren(...foods.map(foodRow));
    box.hidden = foods.length === 0;
  }

  function matchMine(q) {
    const key = plain(q);
    return myFoods.filter((f) => plain(f.name).includes(key));
  }

  function removeMine(id) {
    myFoods = myFoods.filter((f) => f.id !== id);
    saveMine();
    renderList(els.boxMine, els.listMine, matchMine(els.input.value.trim()));
  }

  function setStatus(msg) { els.status.textContent = msg; }

  function scopeLabel(where) { return where === 'pe' ? 'Perú' : 'Todo el mundo'; }

  async function runSearch() {
    const q = els.input.value.trim();
    if (q.length < MIN_CHARS) return;
    const where = scope;
    els.onlineTitle.textContent = `Open Food Facts · ${scopeLabel(where)}`;
    els.more.hidden = true;
    setStatus('Buscando…');
    try {
      const foods = await searchOnline(q, where);
      if (els.input.value.trim() !== q || scope !== where) return; // la búsqueda cambió mientras tanto
      renderList(els.boxOnline, els.listOnline, foods);
      els.more.hidden = !(where === 'pe' && foods.length < 8);
      if (foods.length) setStatus(`${foods.length} resultados${where === 'pe' ? ' en Perú' : ''}. Toca uno para añadirlo.`);
      else if (where === 'pe') setStatus('Sin resultados en Perú. Prueba con «Todo el mundo» o añade el alimento manual.');
      else setStatus('Sin resultados. Prueba otra palabra o añade el alimento manual.');
    } catch (e) {
      if (e.name === 'AbortError') return;
      els.boxOnline.hidden = true;
      if (e.status === 429) setStatus('Demasiadas búsquedas seguidas. Espera unos segundos e inténtalo otra vez.');
      else if (!navigator.onLine) setStatus('Sin conexión. Puedes usar Mis alimentos o añadir uno manual.');
      else setStatus('No se pudo consultar Open Food Facts. Puedes añadir el alimento manual.');
    }
  }

  // Selector "Perú / Todo el mundo"
  const scopeInputs = document.querySelectorAll('input[name="scope"]');
  function setScope(value, { search = true } = {}) {
    scope = value === 'world' ? 'world' : 'pe';
    NM.write('busqueda-ambito', scope);
    scopeInputs.forEach((r) => { r.checked = r.value === scope; });
    if (search && els.input.value.trim().length >= MIN_CHARS) { clearTimeout(timer); runSearch(); }
  }
  scopeInputs.forEach((r) => r.addEventListener('change', () => { if (r.checked) setScope(r.value); }));
  els.more.addEventListener('click', () => setScope('world'));
  setScope(scope, { search: false });

  els.input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = els.input.value.trim();
    if (q.length < MIN_CHARS) {
      if (controller) controller.abort();
      els.boxOnline.hidden = true;
      els.more.hidden = true;
      renderList(els.boxMine, els.listMine, []);
      setStatus(`Escribe al menos ${MIN_CHARS} letras para buscar.`);
      return;
    }
    renderList(els.boxMine, els.listMine, matchMine(q));
    setStatus('Buscando…');
    timer = setTimeout(runSearch, DEBOUNCE_MS);
  });

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    renderList(els.boxMine, els.listMine, matchMine(els.input.value.trim()));
    runSearch();
  });

  /* ---------- Diálogo: añadir alimento encontrado ---------- */
  function unitOptions(food) {
    const units = [];
    if (food.basis === 'g') units.push(el('option', { value: 'g', text: 'gramos' }));
    if (food.basis === 'unit') units.push(el('option', { value: 'u', text: 'unidades' }));
    else if (food.unitGrams) units.push(el('option', { value: 'u', text: `unidades (≈ ${fmt(food.unitGrams, 0)} g c/u)` }));
    return units;
  }

  function openAdd(food) {
    selected = food;
    els.addName.textContent = food.name;
    els.addPer.textContent = [
      food.brand,
      `${fmt(food.kcal)} kcal · ${fmt(food.protein, 1)} g prot. · ${fmt(food.carbs, 1)} g carb. · ${fmt(food.fat, 1)} g grasa ${food.basis === 'unit' ? 'por unidad' : 'por 100 g'}`,
    ].filter(Boolean).join(' · ');

    els.addUnit.replaceChildren(...unitOptions(food));

    els.addQty.value = food.basis === 'unit' ? 1 : 100;
    fillMealSelect(els.addMeal);
    els.addMeal.value = defaultMeal();
    updatePreview();
    els.addDlg.showModal();
  }

  function currentQty() {
    const q = parseFloat(els.addQty.value);
    return Number.isFinite(q) && q > 0 ? q : 0;
  }

  function updatePreview() {
    const n = nutrientsFor(selected, currentQty(), els.addUnit.value);
    els.addPreview.textContent =
      `${fmt(n.kcal)} kcal · ${fmt(n.protein, 1)} g proteínas · ${fmt(n.carbs, 1)} g carbohidratos · ${fmt(n.fat, 1)} g grasas`;
  }

  els.addQty.addEventListener('input', updatePreview);
  els.addUnit.addEventListener('change', updatePreview);
  els.addCancel.addEventListener('click', () => els.addDlg.close());

  els.addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const qty = currentQty();
    if (!qty || qty > 10000) { els.addQty.focus(); return; }
    addEntry(selected, qty, els.addUnit.value, els.addMeal.value);
    els.addDlg.close();
  });

  function addEntry(food, qty, unit, meal) {
    const n = nutrientsFor(food, qty, unit);
    log.meals[meal].push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: food.name, brand: food.brand || '', qty, unit, ...n,
      base: {
        basis: food.basis, kcal: food.kcal, protein: food.protein,
        carbs: food.carbs, fat: food.fat, unitGrams: food.unitGrams || null,
      },
    });
    saveLog();
    renderDay();
    const label = MEALS.find((m) => m.id === meal).label;
    setStatus(`Añadido a ${label.toLowerCase()}: ${food.name}.`);
  }

  /* ---------- Diálogo: alimento manual ---------- */
  function syncManualBasis() {
    const byUnit = els.manBasis.value === 'unit';
    els.manUnitGramsWrap.hidden = byUnit;
    els.manQtyLabel.textContent = byUnit ? 'Cantidad (unidades)' : 'Cantidad (gramos)';
    els.manQty.value = byUnit ? 1 : 100;
  }

  els.openManual.addEventListener('click', () => {
    els.manForm.reset();
    fillMealSelect(els.manMeal);
    els.manMeal.value = defaultMeal();
    els.manName.value = els.input.value.trim();
    els.manSave.checked = true;
    syncManualBasis();
    els.manDlg.showModal();
  });
  els.manBasis.addEventListener('change', syncManualBasis);
  els.manCancel.addEventListener('click', () => els.manDlg.close());

  els.manForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.manName.value.trim();
    const kcal = num(els.manKcal.value);
    const qty = num(els.manQty.value);
    if (!name || kcal === null || kcal < 0 || !qty || qty <= 0) return;

    const basis = els.manBasis.value;
    const unitGrams = basis === 'g' ? num(els.manUnitGrams.value) : null;
    const food = {
      id: `mine:${Date.now()}`, source: 'mine', name, brand: '', basis,
      kcal, protein: num(els.manProtein.value) ?? 0, carbs: num(els.manCarbs.value) ?? 0,
      fat: num(els.manFat.value) ?? 0, unitGrams: unitGrams && unitGrams > 0 ? unitGrams : null,
    };

    if (els.manSave.checked) {
      myFoods = myFoods.filter((f) => !(plain(f.name) === plain(name) && f.basis === basis));
      myFoods.unshift(food);
      saveMine();
    }
    addEntry(food, qty, basis === 'unit' ? 'u' : 'g', els.manMeal.value);
    els.manDlg.close();
  });

  [els.addDlg, els.manDlg, els.edDlg].forEach((dlg) => {
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  });

  /* ---------- Diálogo: editar una comida ya registrada ---------- */
  let editing = null; // { mealId, entry }

  // Nutrientes para una cantidad/unidad nuevas. Si la entrada no guardó su base
  // (registros antiguos), se escala proporcionalmente desde sus valores actuales.
  function editNutrients(entry, qty, unit) {
    if (entry.base && entry.base.basis) return nutrientsFor(entry.base, qty, unit);
    const k = entry.qty > 0 ? qty / entry.qty : 1;
    return {
      kcal: Math.round(entry.kcal * k), protein: round1(entry.protein * k),
      carbs: round1((entry.carbs || 0) * k), fat: round1((entry.fat || 0) * k),
    };
  }

  function fillEditNutrients(n) {
    els.edKcal.value = n.kcal;
    els.edProtein.value = n.protein;
    els.edCarbs.value = n.carbs;
    els.edFat.value = n.fat;
  }

  function openEdit(mealId, entry) {
    editing = { mealId, entry };
    els.edName.value = entry.name;
    els.edQty.value = entry.qty;
    const options = entry.base && entry.base.basis
      ? unitOptions(entry.base)
      : [el('option', { value: entry.unit, text: entry.unit === 'g' ? 'gramos' : 'unidades' })];
    els.edUnit.replaceChildren(...options);
    els.edUnit.value = entry.unit;
    fillMealSelect(els.edMeal);
    els.edMeal.value = mealId;
    fillEditNutrients(entry);
    els.edDlg.showModal();
  }

  function recalcEdit() {
    const qty = parseFloat(els.edQty.value);
    if (!editing || !Number.isFinite(qty) || qty <= 0) return;
    fillEditNutrients(editNutrients(editing.entry, qty, els.edUnit.value));
  }

  els.edQty.addEventListener('input', recalcEdit);
  els.edUnit.addEventListener('change', recalcEdit);
  els.edCancel.addEventListener('click', () => els.edDlg.close());

  els.edForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!editing) return;
    const qty = num(els.edQty.value);
    const kcal = num(els.edKcal.value);
    const name = els.edName.value.trim();
    if (!name || !qty || qty <= 0 || qty > 10000 || kcal === null || kcal < 0) return;

    const { mealId, entry } = editing;
    const updated = {
      ...entry, name, qty, unit: els.edUnit.value,
      kcal: Math.round(kcal),
      protein: round1(Math.max(num(els.edProtein.value) ?? 0, 0)),
      carbs: round1(Math.max(num(els.edCarbs.value) ?? 0, 0)),
      fat: round1(Math.max(num(els.edFat.value) ?? 0, 0)),
    };

    const newMeal = els.edMeal.value;
    if (newMeal === mealId) {
      log.meals[mealId] = log.meals[mealId].map((x) => (x.id === entry.id ? updated : x));
    } else {
      log.meals[mealId] = log.meals[mealId].filter((x) => x.id !== entry.id);
      log.meals[newMeal].push(updated);
    }
    saveLog();
    renderDay();
    els.edDlg.close();
    editing = null;
    setStatus(`Cambios guardados: ${name}.`);
  });

  /* ---------- Registro diario ---------- */
  function qtyText(entry) {
    if (entry.unit === 'g') return `${fmt(entry.qty, 1)} g`;
    return `${fmt(entry.qty, 1)} ${entry.qty === 1 ? 'unidad' : 'unidades'}`;
  }

  function deleteEntry(meal, id) {
    log.meals[meal] = log.meals[meal].filter((e) => e.id !== id);
    saveLog();
    renderDay();
  }

  function renderDay() {
    const [y, m, d] = currentDate.split('-').map(Number);
    const label = new Date(y, m - 1, d).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    els.dayTitle.textContent = `Hoy, ${label}`;

    const all = MEALS.flatMap((meal) => log.meals[meal.id]);
    const totalKcal = all.reduce((s, e) => s + e.kcal, 0);
    const totalProt = all.reduce((s, e) => s + e.protein, 0);
    const goals = (NM.read('perfil', null) || {}).goals || {};
    els.daySummary.textContent =
      `${fmt(totalKcal)}${goals.kcal ? ` de ${fmt(goals.kcal)}` : ''} kcal · ` +
      `${fmt(totalProt, 1)}${goals.protein ? ` de ${fmt(goals.protein)}` : ''} g proteínas`;

    els.meals.replaceChildren(...MEALS.map((meal) => {
      const entries = log.meals[meal.id];
      const kcal = entries.reduce((s, e) => s + e.kcal, 0);
      const prot = entries.reduce((s, e) => s + e.protein, 0);
      const list = el('ul', { class: 'entry-list' }, entries.map((entry) =>
        el('li', { class: 'entry' },
          el('div', { class: 'entry-text' },
            el('span', { class: 'food-name', text: entry.name }),
            el('span', { class: 'food-meta', text: `${qtyText(entry)} · ${fmt(entry.kcal)} kcal · ${fmt(entry.protein, 1)} g prot.` })),
          el('div', { class: 'entry-actions' },
            el('button', {
              class: 'icon-btn edit', type: 'button', text: 'Editar',
              'aria-label': `Editar ${entry.name} de ${meal.label.toLowerCase()}`,
              onclick: () => openEdit(meal.id, entry),
            }),
            el('button', {
              class: 'icon-btn', type: 'button', text: 'Quitar',
              'aria-label': `Quitar ${entry.name} de ${meal.label.toLowerCase()}`,
              onclick: () => deleteEntry(meal.id, entry.id),
            })))));
      return el('div', { class: 'meal' },
        el('div', { class: 'meal-head' },
          el('h4', { text: meal.label }),
          el('span', { class: 'food-meta', text: entries.length ? `${fmt(kcal)} kcal · ${fmt(prot, 1)} g prot.` : '' })),
        entries.length ? list : el('p', { class: 'hint', text: 'Sin alimentos todavía.' }));
    }));
  }

  /* ---------- Inicio ---------- */
  document.addEventListener('nutrimeta:view', (e) => {
    if (e.detail !== 'alimentos') return;
    currentDate = NM.dateKey();
    log = loadLog(currentDate); // el registro pudo cambiar desde la pestaña Hoy
    renderDay();
  });

  renderDay();
})();
