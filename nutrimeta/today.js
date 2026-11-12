/* NutriMeta · Módulo 3: pestaña "Hoy" (dashboard y progreso)
   Lee las metas de nutrimeta:v1:perfil y el registro de nutrimeta:v1:dia:AAAA-MM-DD */
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

  // Umbrales de la barra de proteínas
  const PROTEIN_NEAR = 0.6; // desde 60 % = "cerca" (amarillo); menos = insuficiente (rojo)
  const RING_RADIUS = 52;
  const RING_LEN = 2 * Math.PI * RING_RADIUS;

  const $ = (id) => document.getElementById(id);
  const els = {
    prev: $('day-prev'), next: $('day-next'), date: $('day-date'), label: $('hoy-label'),
    toToday: $('day-today'),
    noGoals: $('hoy-nogoals'), goMetas: $('go-metas'), dash: $('hoy-dash'),
    ringFg: $('ring-fg'), ring: $('ring'), ringNum: $('ring-num'), ringLbl: $('ring-lbl'),
    eaten: $('st-eaten'), goal: $('st-goal'),
    protState: $('prot-state'), protEaten: $('prot-eaten'), protGoal: $('prot-goal'),
    protBar: $('prot-bar'), protFill: $('prot-fill'), protNote: $('prot-note'),
    carbs: $('st-carbs'), fat: $('st-fat'),
    meals: $('hoy-meals'), reset: $('reset-day'),
  };

  let date = NM.dateKey();

  /* ---------- Utilidades de fecha ---------- */
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  function shift(key, delta) {
    const d = parseKey(key);
    d.setDate(d.getDate() + delta);
    return NM.dateKey(d);
  }
  function longLabel(key) {
    const text = parseKey(key).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    const today = NM.dateKey();
    if (key === today) return `Hoy · ${text}`;
    if (key === shift(today, -1)) return `Ayer · ${text}`;
    return parseKey(key).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* ---------- Datos ---------- */
  function loadDay(key) {
    const saved = NM.read(`dia:${key}`, null) || {};
    const meals = saved.meals || {};
    MEALS.forEach((m) => { if (!Array.isArray(meals[m.id])) meals[m.id] = []; });
    return meals;
  }

  function sum(entries) {
    return entries.reduce((t, e) => ({
      kcal: t.kcal + (e.kcal || 0),
      protein: t.protein + (e.protein || 0),
      carbs: t.carbs + (e.carbs || 0),
      fat: t.fat + (e.fat || 0),
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  }

  function proteinState(ratio) {
    if (ratio >= 1) return { id: 'done', text: 'Meta cumplida' };
    if (ratio >= PROTEIN_NEAR) return { id: 'near', text: 'Cerca de la meta' };
    return { id: 'low', text: 'Insuficiente' };
  }

  /* ---------- Render ---------- */
  function render() {
    const today = NM.dateKey();
    if (date > today) date = today;
    const isToday = date === today;

    els.date.value = date;
    els.date.max = today;
    els.next.disabled = isToday;
    els.toToday.hidden = isToday;
    els.label.textContent = longLabel(date);
    els.reset.textContent = isToday ? 'Reiniciar día' : 'Borrar los registros de este día';

    const goals = (NM.read('perfil', null) || {}).goals || {};
    const hasGoals = goals.kcal > 0 && goals.protein > 0;
    els.noGoals.hidden = hasGoals;
    els.dash.hidden = !hasGoals;
    if (!hasGoals) return;

    const meals = loadDay(date);
    const all = MEALS.flatMap((m) => meals[m.id]);
    const total = sum(all);

    // Anillo de calorías
    const ratio = total.kcal / goals.kcal;
    const remaining = goals.kcal - total.kcal;
    els.ringFg.style.strokeDasharray = `${Math.min(ratio, 1) * RING_LEN} ${RING_LEN}`;
    els.ringFg.style.visibility = total.kcal > 0 ? 'visible' : 'hidden';
    els.ring.classList.toggle('is-over', remaining < 0);
    els.ringNum.textContent = fmt(Math.abs(remaining));
    els.ringLbl.textContent = remaining >= 0 ? 'kcal restantes' : 'kcal de más';
    els.eaten.textContent = fmt(total.kcal);
    els.goal.textContent = fmt(goals.kcal);

    // Proteínas
    const pRatio = total.protein / goals.protein;
    const state = proteinState(pRatio);
    els.protBar.dataset.state = state.id;
    els.protState.dataset.state = state.id;
    els.protState.textContent = state.text;
    els.protEaten.textContent = fmt(total.protein, 1);
    els.protGoal.textContent = fmt(goals.protein);
    els.protFill.style.width = `${Math.min(pRatio, 1) * 100}%`;
    els.protBar.setAttribute('aria-valuenow', String(Math.round(Math.min(pRatio, 1) * 100)));
    const missing = goals.protein - total.protein;
    els.protNote.textContent = missing > 0
      ? `Te faltan ${fmt(missing, 1)} g (${Math.round(pRatio * 100)} % de tu meta).`
      : `Superaste tu meta por ${fmt(-missing, 1)} g.`;

    // Otros macros
    els.carbs.textContent = `${fmt(total.carbs, 1)} g`;
    els.fat.textContent = `${fmt(total.fat, 1)} g`;

    // Resumen por toma
    els.meals.replaceChildren(...MEALS.map((m) => {
      const t = sum(meals[m.id]);
      const row = document.createElement('div');
      row.className = 'meal-row';
      const name = document.createElement('span');
      name.textContent = m.label;
      const info = document.createElement('span');
      info.className = 'food-meta';
      info.textContent = meals[m.id].length
        ? `${fmt(t.kcal)} kcal · ${fmt(t.protein, 1)} g prot.`
        : 'Sin registros';
      row.append(name, info);
      return row;
    }));
  }

  /* ---------- Eventos ---------- */
  els.prev.addEventListener('click', () => { date = shift(date, -1); render(); });
  els.next.addEventListener('click', () => { date = shift(date, 1); render(); });
  els.toToday.addEventListener('click', () => { date = NM.dateKey(); render(); });
  els.date.addEventListener('change', () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(els.date.value)) date = els.date.value;
    render();
  });
  els.goMetas.addEventListener('click', () => NM.show('metas'));

  els.reset.addEventListener('click', () => {
    const isToday = date === NM.dateKey();
    const msg = isToday
      ? '¿Reiniciar el día de hoy? Se borrarán todos los alimentos registrados hoy.'
      : '¿Borrar los alimentos registrados en este día?';
    if (!confirm(msg)) return;
    NM.remove(`dia:${date}`);
    render();
  });

  document.addEventListener('nutrimeta:view', (e) => { if (e.detail === 'hoy') render(); });

  /* ---------- Inicio: abre en "Hoy" si ya hay metas guardadas ---------- */
  const goals = (NM.read('perfil', null) || {}).goals || {};
  NM.show(goals.kcal > 0 && goals.protein > 0 ? 'hoy' : 'metas');
})();
