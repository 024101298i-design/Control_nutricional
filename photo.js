/* NutriMeta · Identificar comida con una foto — 100 % en tu dispositivo
   Usa CLIP (transformers.js) para comparar la foto con la lista de alimentos de referencia
   (foods-db.js) y devolver los más parecidos. Sin API key, sin costo y la foto no sale del teléfono.
   Solo se descarga el modelo la primera vez (queda guardado en el navegador). */
(() => {
  'use strict';

  const NM = window.NutriMeta;
  const fmt = NM.fmt;

  const LIB_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
  const MODEL = 'Xenova/clip-vit-base-patch32';
  const READY_FLAG = 'nutrimeta:modelo-listo'; // fuera de "nutrimeta:v1:" → no entra en los respaldos
  const MAX_SIDE = 448;        // la foto se reduce antes de analizarla
  const TOP_N = 5;             // cuántas coincidencias se muestran
  const LOW_SCORE = 0.2;       // por debajo se avisa que la coincidencia es baja

  const MEALS = [
    { id: 'breakfast', label: 'Desayuno' },
    { id: 'lunch', label: 'Almuerzo' },
    { id: 'dinner', label: 'Cena' },
    { id: 'snacks', label: 'Snacks' },
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    open: $('open-photo'), dlg: $('photo-dialog'), intro: $('photo-intro'),
    camera: $('photo-camera'), gallery: $('photo-gallery'),
    inCamera: $('photo-input-camera'), inGallery: $('photo-input-gallery'),
    preview: $('photo-preview'), status: $('photo-status'),
    results: $('photo-results'), list: $('photo-list'), meal: $('photo-meal'),
    close: $('photo-close'), add: $('photo-add'),
  };

  try { localStorage.removeItem('nutrimeta:apikey'); } catch (e) { /* versión anterior con API key */ }

  let classifierPromise = null;
  let runId = 0;
  let detected = []; // [{ checked, name, grams, food, score }]
  const downloads = new Map();

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
  const isReady = () => { try { return localStorage.getItem(READY_FLAG) === '1'; } catch (e) { return false; } };
  const markReady = () => { try { localStorage.setItem(READY_FLAG, '1'); } catch (e) { /* sin acceso */ } };
  const setStatus = (msg) => { els.status.textContent = msg; };

  function defaultMeal() {
    const h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 16) return 'lunch';
    if (h < 19) return 'snacks';
    return 'dinner';
  }

  /* ---------- Modelo (se carga una sola vez) ---------- */
  function onProgress(p) {
    if (!p || !p.file) return;
    if (p.status === 'progress' && p.total) downloads.set(p.file, { loaded: p.loaded, total: p.total });
    else if (p.status === 'done' && downloads.has(p.file)) { const d = downloads.get(p.file); d.loaded = d.total; }
    let loaded = 0; let total = 0;
    downloads.forEach((d) => { loaded += d.loaded; total += d.total; });
    if (total) setStatus(`Descargando el modelo… ${Math.round((loaded / total) * 100)} % (solo la primera vez)`);
  }

  function loadClassifier() {
    if (!classifierPromise) {
      classifierPromise = (async () => {
        const importer = NM.importModule || ((url) => import(url)); // NM.importModule: gancho para pruebas
        const { pipeline, env } = await importer(LIB_URL);
        env.allowLocalModels = false;
        env.backends.onnx.wasm.numThreads = 1; // GitHub Pages no permite hilos múltiples
        return pipeline('zero-shot-image-classification', MODEL, { progress_callback: onProgress });
      })().catch((e) => { classifierPromise = null; throw e; });
    }
    return classifierPromise;
  }

  /* ---------- Imagen ---------- */
  function prepareImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
      img.src = url;
    });
  }

  /* ---------- Resultados editables ---------- */
  function macros(d) {
    const k = d.grams / 100;
    return {
      kcal: Math.round(d.food.kcal * k), protein: round1(d.food.protein * k),
      carbs: round1(d.food.carbs * k), fat: round1(d.food.fat * k),
    };
  }
  function macroText(d) {
    const n = macros(d);
    return `${fmt(n.kcal)} kcal · ${fmt(n.protein, 1)} g prot. · ${fmt(n.carbs, 1)} g carb. · ${fmt(n.fat, 1)} g grasa`;
  }

  function updateAddButton() {
    const count = detected.filter((d) => d.checked && d.grams > 0).length;
    els.add.hidden = detected.length === 0;
    els.add.disabled = count === 0;
    els.add.textContent = count === 1 ? 'Añadir 1 alimento' : `Añadir ${count} alimentos`;
  }

  function renderResults() {
    els.list.replaceChildren(...detected.map((d) => {
      const meta = el('span', { class: 'food-meta', text: macroText(d) });
      const gramsInput = el('input', {
        type: 'number', min: '1', max: '3000', step: 'any', inputmode: 'decimal',
        value: String(d.grams), 'aria-label': `Gramos de ${d.name}`, class: 'photo-grams',
      });
      const check = el('input', { type: 'checkbox', 'aria-label': `Incluir ${d.name}` });
      check.checked = d.checked;
      check.addEventListener('change', () => { d.checked = check.checked; updateAddButton(); });
      gramsInput.addEventListener('input', () => {
        const g = num(gramsInput.value);
        d.grams = g && g > 0 ? g : 0;
        meta.textContent = d.grams ? macroText(d) : 'Escribe los gramos';
        updateAddButton();
      });
      return el('li', { class: 'photo-item' },
        el('label', { class: 'photo-check' }, check),
        el('div', { class: 'photo-body' },
          el('span', { class: 'food-name', text: d.name }),
          el('div', { class: 'photo-fields' }, gramsInput, el('span', { class: 'food-meta', text: 'g (porción típica)' })),
          meta,
          el('span', { class: 'food-meta', text: `Parecido a la foto: ${Math.round(d.score * 100)} %` })));
    }));
    els.results.hidden = detected.length === 0;
    updateAddButton();
  }

  /* ---------- Flujo ---------- */
  function resetResults() {
    runId += 1;
    detected = [];
    els.results.hidden = true;
    els.list.replaceChildren();
    els.preview.hidden = true;
    els.add.hidden = true;
    els.intro.hidden = isReady();
    setStatus('Toma una foto o elige una de tu galería.');
  }

  function errorMessage(e) {
    if (e && e.message === 'imagen') return 'No se pudo leer la imagen. Prueba con otra foto.';
    if (!navigator.onLine && !isReady()) return 'Sin conexión. Necesitas internet para descargar el modelo la primera vez.';
    if (!isReady()) return 'No se pudo descargar el modelo. Conéctate a internet (de preferencia con Wi-Fi) e inténtalo otra vez.';
    return 'No se pudo analizar la foto. Inténtalo otra vez o prueba con otra foto.';
  }

  async function handleFile(file) {
    if (!file) return;
    if (!isReady() && !confirm('La primera vez se descarga un modelo de reconocimiento (aprox. 150 MB, estimado) que queda guardado en tu dispositivo. Conviene usar Wi-Fi. ¿Continuar?')) return;

    const myRun = ++runId;
    detected = [];
    els.results.hidden = true;
    els.add.hidden = true;
    try {
      setStatus('Preparando la foto…');
      const dataUrl = await prepareImage(file);
      els.preview.src = dataUrl;
      els.preview.hidden = false;

      setStatus(isReady() ? 'Cargando el modelo…' : 'Descargando el modelo… (solo la primera vez)');
      const classifier = await loadClassifier();
      markReady();
      els.intro.hidden = true;
      if (myRun !== runId) return;

      setStatus('Analizando la foto…');
      const foods = NM.referenceFoods;
      const out = await classifier(dataUrl, foods.map((f) => f.en), { hypothesis_template: 'a photo of {}' });
      if (myRun !== runId) return;

      const byLabel = new Map(foods.map((f) => [f.en, f]));
      detected = out.slice(0, TOP_N)
        .map((o) => ({ food: byLabel.get(o.label), score: o.score }))
        .filter((o) => o.food)
        .map((o, i) => ({ checked: i === 0, name: o.food.name, grams: o.food.portion, food: o.food, score: o.score }));

      els.meal.replaceChildren(...MEALS.map((m) => el('option', { value: m.id, text: m.label })));
      els.meal.value = defaultMeal();
      renderResults();
      setStatus(detected.length && detected[0].score < LOW_SCORE
        ? 'No estoy muy seguro de qué es. Revisa las opciones o búscalo por nombre.'
        : 'Marca lo que aparece en tu plato y ajusta los gramos.');
    } catch (e) {
      if (myRun === runId) setStatus(errorMessage(e));
    }
  }

  function addSelected() {
    const chosen = detected.filter((d) => d.checked && d.grams > 0);
    if (!chosen.length || !NM.foods) return;
    chosen.forEach((d) => {
      NM.foods.addEntry({
        name: d.name, brand: '', basis: 'g', unitGrams: null,
        kcal: d.food.kcal, protein: d.food.protein, carbs: d.food.carbs, fat: d.food.fat,
      }, d.grams, 'g', els.meal.value);
    });
    els.dlg.close();
  }

  /* ---------- Eventos ---------- */
  els.open.addEventListener('click', () => { resetResults(); els.dlg.showModal(); });
  els.camera.addEventListener('click', () => els.inCamera.click());
  els.gallery.addEventListener('click', () => els.inGallery.click());
  [els.inCamera, els.inGallery].forEach((input) => {
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.value = '';
      handleFile(file);
    });
  });
  els.add.addEventListener('click', addSelected);
  els.close.addEventListener('click', () => els.dlg.close());
  els.dlg.addEventListener('close', () => { runId += 1; });
  els.dlg.addEventListener('click', (e) => { if (e.target === els.dlg) els.dlg.close(); });
})();
