/* NutriMeta · Identificar comida con una foto (Claude con visión)
   La foto se redimensiona en el teléfono y se envía a api.anthropic.com con TU API key.
   La key se guarda solo en este dispositivo y NO entra en los respaldos. */
(() => {
  'use strict';

  const NM = window.NutriMeta;
  const fmt = NM.fmt;

  const KEY_STORAGE = 'nutrimeta:apikey'; // fuera del prefijo "nutrimeta:v1:" → no se exporta
  const API_URL = 'https://api.anthropic.com/v1/messages';
  const MODEL = 'claude-sonnet-5-5';
  const MAX_SIDE = 1024; // px; reduce el tamaño y el costo de cada análisis

  const MEALS = [
    { id: 'breakfast', label: 'Desayuno' },
    { id: 'lunch', label: 'Almuerzo' },
    { id: 'dinner', label: 'Cena' },
    { id: 'snacks', label: 'Snacks' },
  ];

  const SYSTEM = 'Eres un nutricionista que analiza fotos de comidas. Responde SOLO con JSON válido, sin texto adicional ni bloques de código.';
  const PROMPT = 'Identifica cada alimento o plato visible en la foto. La persona vive en Perú: usa nombres peruanos cuando correspondan ' +
    '(por ejemplo "arroz con pollo", "lomo saltado", "papa a la huancaína"). Para cada uno estima el peso de la porción en gramos ' +
    'y sus valores nutricionales para esa porción completa. Devuelve exactamente este JSON: ' +
    '{"items":[{"name":"...","grams":0,"kcal":0,"protein":0,"carbs":0,"fat":0,"confidence":"alta|media|baja"}],"notes":"..."} ' +
    'Proteínas, carbohidratos y grasas en gramos. Máximo 8 elementos. Si la foto no contiene comida, devuelve {"items":[],"notes":"motivo"}.';

  const $ = (id) => document.getElementById(id);
  const els = {
    open: $('open-photo'), dlg: $('photo-dialog'),
    setup: $('photo-setup'), key: $('photo-key'), keySave: $('photo-key-save'), keyRemove: $('photo-key-remove'),
    main: $('photo-main'), camera: $('photo-camera'), gallery: $('photo-gallery'),
    inCamera: $('photo-input-camera'), inGallery: $('photo-input-gallery'),
    preview: $('photo-preview'), status: $('photo-status'),
    results: $('photo-results'), list: $('photo-list'), meal: $('photo-meal'),
    close: $('photo-close'), add: $('photo-add'),
  };

  let controller = null;
  let detected = []; // [{ checked, name, grams, orig: {grams,kcal,protein,carbs,fat}, confidence }]

  /* ---------- API key ---------- */
  const getKey = () => { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (e) { return ''; } };
  const setKey = (v) => {
    try { if (v) localStorage.setItem(KEY_STORAGE, v); else localStorage.removeItem(KEY_STORAGE); } catch (e) { /* sin acceso */ }
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

  function defaultMeal() {
    const h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 16) return 'lunch';
    if (h < 19) return 'snacks';
    return 'dinner';
  }

  function setStatus(msg) { els.status.textContent = msg; }

  /* ---------- Imagen: redimensionar y pasar a base64 ---------- */
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve({ dataUrl, base64: dataUrl.split(',')[1] });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
      img.src = url;
    });
  }

  /* ---------- Llamada a Claude ---------- */
  function sanitize(item) {
    if (!item || typeof item !== 'object') return null;
    const name = String(item.name || '').trim().slice(0, 80);
    const grams = num(item.grams);
    if (!name || !grams || grams <= 0 || grams > 3000) return null;
    const pos = (v) => Math.max(num(v) ?? 0, 0);
    return {
      name, grams, kcal: pos(item.kcal), protein: pos(item.protein), carbs: pos(item.carbs), fat: pos(item.fat),
      confidence: ['alta', 'media', 'baja'].includes(item.confidence) ? item.confidence : 'media',
    };
  }

  function parseResult(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('parse');
    const obj = JSON.parse(match[0]);
    const items = (Array.isArray(obj.items) ? obj.items : []).map(sanitize).filter(Boolean).slice(0, 8);
    return { items, notes: String(obj.notes || '').slice(0, 300) };
  }

  async function analyze(base64, signal) {
    const res = await fetch(API_URL, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': getKey(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true', // necesario para llamar desde el navegador
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });
    if (!res.ok) { const err = new Error('http'); err.status = res.status; throw err; }
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return parseResult(text);
  }

  /* ---------- Resultados editables ---------- */
  function scaled(d) {
    const k = d.orig.grams > 0 ? d.grams / d.orig.grams : 1;
    return { kcal: Math.round(d.orig.kcal * k), protein: round1(d.orig.protein * k), carbs: round1(d.orig.carbs * k), fat: round1(d.orig.fat * k) };
  }

  function macroText(d) {
    const n = scaled(d);
    return `${fmt(n.kcal)} kcal · ${fmt(n.protein, 1)} g prot. · ${fmt(n.carbs, 1)} g carb. · ${fmt(n.fat, 1)} g grasa`;
  }

  function updateAddButton() {
    const count = detected.filter((d) => d.checked && d.grams > 0 && d.name.trim()).length;
    els.add.hidden = detected.length === 0;
    els.add.disabled = count === 0;
    els.add.textContent = count === 1 ? 'Añadir 1 alimento' : `Añadir ${count} alimentos`;
  }

  function renderResults() {
    els.list.replaceChildren(...detected.map((d) => {
      const meta = el('span', { class: 'food-meta', text: macroText(d) });
      const nameInput = el('input', { type: 'text', maxlength: '80', value: d.name, 'aria-label': 'Nombre del alimento', class: 'photo-name' });
      const gramsInput = el('input', { type: 'number', min: '1', max: '3000', step: 'any', inputmode: 'decimal', value: String(d.grams), 'aria-label': 'Gramos', class: 'photo-grams' });
      const check = el('input', { type: 'checkbox', 'aria-label': `Incluir ${d.name}` });
      check.checked = d.checked;
      check.addEventListener('change', () => { d.checked = check.checked; updateAddButton(); });
      nameInput.addEventListener('input', () => { d.name = nameInput.value; updateAddButton(); });
      gramsInput.addEventListener('input', () => {
        const g = num(gramsInput.value);
        d.grams = g && g > 0 ? g : 0;
        meta.textContent = d.grams ? macroText(d) : 'Escribe los gramos';
        updateAddButton();
      });
      return el('li', { class: 'photo-item' },
        el('label', { class: 'photo-check' }, check),
        el('div', { class: 'photo-body' },
          el('div', { class: 'photo-fields' }, nameInput, gramsInput, el('span', { class: 'food-meta', text: 'g' })),
          meta,
          el('span', { class: 'food-meta', text: `Confianza ${d.confidence}` })));
    }));
    els.results.hidden = detected.length === 0;
    updateAddButton();
  }

  /* ---------- Flujo ---------- */
  function showPanels() {
    const hasKey = Boolean(getKey());
    els.setup.hidden = hasKey;
    els.main.hidden = !hasKey;
    els.keyRemove.hidden = !hasKey;
    els.add.hidden = true;
  }

  function resetResults() {
    detected = [];
    els.results.hidden = true;
    els.list.replaceChildren();
    els.preview.hidden = true;
    els.add.hidden = true;
    setStatus('Toma una foto o elige una de tu galería.');
  }

  function errorMessage(e) {
    if (e.status === 401 || e.status === 403) return 'La API key no es válida o no tiene permiso. Quítala y vuelve a ingresarla.';
    if (e.status === 429) return 'Demasiadas solicitudes seguidas. Espera un momento e inténtalo otra vez.';
    if (e.status === 400) return 'La solicitud fue rechazada (por ejemplo, saldo insuficiente en tu cuenta de Anthropic). Revisa tu cuenta.';
    if (e.status >= 500) return 'El servicio de análisis no está disponible ahora. Inténtalo más tarde.';
    if (e.message === 'parse' || e instanceof SyntaxError) return 'No pude interpretar la respuesta. Prueba con otra foto.';
    if (e.message === 'imagen') return 'No se pudo leer la imagen. Prueba con otra foto.';
    if (!navigator.onLine) return 'Sin conexión. Conéctate a internet para analizar la foto.';
    return 'No se pudo analizar la foto. Revisa tu conexión e inténtalo otra vez.';
  }

  async function handleFile(file) {
    if (!file) return;
    if (controller) controller.abort();
    controller = new AbortController();
    const { signal } = controller;
    detected = [];
    els.results.hidden = true;
    els.add.hidden = true;
    setStatus('Analizando la foto… puede tardar unos segundos.');
    try {
      const { dataUrl, base64 } = await prepareImage(file);
      els.preview.src = dataUrl;
      els.preview.hidden = false;
      const { items, notes } = await analyze(base64, signal);
      if (signal.aborted) return;
      if (!items.length) {
        setStatus(notes ? `No encontré comida en la foto. ${notes}` : 'No encontré comida en la foto. Prueba con otra.');
        return;
      }
      detected = items.map((i) => ({
        checked: true, name: i.name, grams: i.grams, confidence: i.confidence,
        orig: { grams: i.grams, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat },
      }));
      els.meal.replaceChildren(...MEALS.map((m) => el('option', { value: m.id, text: m.label })));
      els.meal.value = defaultMeal();
      renderResults();
      setStatus(`Encontré ${items.length} ${items.length === 1 ? 'alimento' : 'alimentos'}. Revisa nombres y porciones.`);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setStatus(errorMessage(e));
    }
  }

  function addSelected() {
    const chosen = detected.filter((d) => d.checked && d.grams > 0 && d.name.trim());
    if (!chosen.length || !NM.foods) return;
    chosen.forEach((d) => {
      // Valores por 100 g derivados de la estimación, para poder editar la cantidad después
      const per100 = (v) => (d.orig.grams > 0 ? (v / d.orig.grams) * 100 : 0);
      NM.foods.addEntry({
        name: d.name.trim(), brand: '', basis: 'g', unitGrams: null,
        kcal: per100(d.orig.kcal), protein: per100(d.orig.protein), carbs: per100(d.orig.carbs), fat: per100(d.orig.fat),
      }, d.grams, 'g', els.meal.value);
    });
    els.dlg.close();
  }

  /* ---------- Eventos ---------- */
  els.open.addEventListener('click', () => {
    showPanels();
    resetResults();
    els.key.value = '';
    els.dlg.showModal();
  });

  els.keySave.addEventListener('click', () => {
    const v = els.key.value.trim();
    if (!v.startsWith('sk-ant-')) { els.key.focus(); return; }
    setKey(v);
    els.key.value = '';
    showPanels();
    resetResults();
  });

  els.keyRemove.addEventListener('click', () => {
    if (!confirm('¿Quitar tu API key de este dispositivo?')) return;
    setKey('');
    showPanels();
  });

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
  els.dlg.addEventListener('close', () => { if (controller) controller.abort(); });
  els.dlg.addEventListener('click', (e) => { if (e.target === els.dlg) els.dlg.close(); });
})();
