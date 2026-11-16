/* NutriMeta · Módulo 1: Calculadora de metas
   Todo se guarda en localStorage (sin backend). */
(() => {
  'use strict';

  const STORAGE_KEY = 'nutrimeta:v1:perfil';

  const ACTIVITY_FACTORS = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    high: 1.725,
    athlete: 1.9,
  };

  // Ajuste calórico y proteína (g por kg de peso) según objetivo
  const GOALS = {
    lose:     { kcalAdjust: -500, proteinPerKg: 2.2 },
    maintain: { kcalAdjust: 0,    proteinPerKg: 1.8 },
    gain:     { kcalAdjust: +300, proteinPerKg: 2.0 },
  };

  const MIN_KCAL = { male: 1500, female: 1200 }; // piso de seguridad

  const $ = (id) => document.getElementById(id);
  const form = $('profile-form');
  const els = {
    age: $('age'), weight: $('weight'), height: $('height'), activity: $('activity'),
    results: $('results'), error: $('form-error'),
    bmr: $('out-bmr'), tdee: $('out-tdee'),
    goalKcal: $('goal-kcal'), goalProtein: $('goal-protein'),
    hintKcal: $('hint-kcal'), hintProtein: $('hint-protein'),
    resetKcal: $('reset-kcal'), resetProtein: $('reset-protein'),
    status: $('save-status'),
  };

  // Estado: perfil + metas (con marca de edición manual)
  let state = {
    profile: null,
    goals: { kcal: null, protein: null, kcalCustom: false, proteinCustom: false },
  };

  /* ---------- Persistencia ---------- */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, savedAt: new Date().toISOString() }));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- Cálculos ---------- */
  // Mifflin-St Jeor
  function calcBMR({ sex, weight, height, age }) {
    const base = 10 * weight + 6.25 * height - 5 * age;
    return sex === 'male' ? base + 5 : base - 161;
  }

  function calcSuggested(profile) {
    const bmr = calcBMR(profile);
    const tdee = bmr * ACTIVITY_FACTORS[profile.activity];
    const goal = GOALS[profile.goal];
    const rawKcal = tdee + goal.kcalAdjust;
    const minKcal = MIN_KCAL[profile.sex];
    const kcal = Math.round(Math.max(rawKcal, minKcal) / 10) * 10;
    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      kcal,
      kcalWasRaised: rawKcal < minKcal,
      protein: Math.round(profile.weight * goal.proteinPerKg),
    };
  }

  /* ---------- Formulario ---------- */
  function readProfile() {
    const age = parseFloat(els.age.value);
    const weight = parseFloat(els.weight.value);
    const height = parseFloat(els.height.value);
    return {
      age, weight, height,
      sex: form.elements.sex.value,
      activity: els.activity.value,
      goal: form.elements.goal.value,
    };
  }

  function validate(p) {
    const problems = [];
    const rules = [
      [els.age, p.age, 15, 100, 'Edad: entre 15 y 100 años.'],
      [els.weight, p.weight, 30, 300, 'Peso: entre 30 y 300 kg.'],
      [els.height, p.height, 120, 230, 'Estatura: entre 120 y 230 cm.'],
    ];
    rules.forEach(([el, val, min, max, msg]) => {
      const ok = Number.isFinite(val) && val >= min && val <= max;
      el.classList.toggle('invalid', !ok && el.value !== '');
      if (!ok && el.value !== '') problems.push(msg);
    });
    const complete = [p.age, p.weight, p.height].every(Number.isFinite);
    return { valid: complete && problems.length === 0, problems };
  }

  /* ---------- Render ---------- */
  function setStatus(msg) { els.status.textContent = msg; }

  function render() {
    const p = readProfile();
    const { valid, problems } = validate(p);

    els.error.hidden = problems.length === 0;
    els.error.textContent = problems.join(' ');
    els.results.hidden = !valid;
    if (!valid) return;

    state.profile = p;
    const s = calcSuggested(p);

    els.bmr.textContent = s.bmr.toLocaleString('es');
    els.tdee.textContent = s.tdee.toLocaleString('es');

    // Si la meta no fue editada a mano, sigue al valor sugerido
    if (!state.goals.kcalCustom) state.goals.kcal = s.kcal;
    if (!state.goals.proteinCustom) state.goals.protein = s.protein;

    els.goalKcal.value = state.goals.kcal;
    els.goalProtein.value = state.goals.protein;

    const adj = GOALS[p.goal].kcalAdjust;
    const adjText = adj === 0 ? 'igual a tu TDEE' : `${adj > 0 ? '+' : '−'}${Math.abs(adj)} kcal respecto a tu TDEE`;
    els.hintKcal.textContent = `Sugerido: ${s.kcal.toLocaleString('es')} kcal (${adjText})` +
      (s.kcalWasRaised ? '. Se aplicó un mínimo de seguridad.' : '.');

    const perKg = (state.goals.protein / p.weight).toFixed(1);
    els.hintProtein.textContent = `Sugerido: ${s.protein} g (${GOALS[p.goal].proteinPerKg} g por kg). Tu meta actual: ${perKg} g/kg.`;

    els.resetKcal.hidden = !state.goals.kcalCustom;
    els.resetProtein.hidden = !state.goals.proteinCustom;

    saveState(); // guardado automático: así la pestaña Hoy siempre tiene tus metas
  }

  function restoreForm(saved) {
    const p = saved.profile;
    if (!p) return;
    els.age.value = p.age;
    els.weight.value = p.weight;
    els.height.value = p.height;
    els.activity.value = p.activity;
    form.elements.sex.value = p.sex;
    form.elements.goal.value = p.goal;
    state.goals = { ...state.goals, ...saved.goals };
  }

  /* ---------- Eventos ---------- */
  form.addEventListener('input', (e) => {
    if (e.target === els.goalKcal || e.target === els.goalProtein) return;
    setStatus('');
    render();
  });

  els.goalKcal.addEventListener('input', () => {
    const v = parseInt(els.goalKcal.value, 10);
    if (Number.isFinite(v)) {
      state.goals.kcal = v;
      state.goals.kcalCustom = true;
      if (v >= 800 && v <= 6000) saveState();
    }
    els.resetKcal.hidden = false;
    setStatus('');
  });

  els.goalProtein.addEventListener('input', () => {
    const v = parseInt(els.goalProtein.value, 10);
    if (Number.isFinite(v)) {
      state.goals.protein = v;
      state.goals.proteinCustom = true;
      if (v >= 20 && v <= 500) saveState();
      const w = state.profile && state.profile.weight;
      if (w) els.hintProtein.textContent = `Tu meta actual: ${(v / w).toFixed(1)} g por kg de peso.`;
    }
    els.resetProtein.hidden = false;
    setStatus('');
  });

  els.resetKcal.addEventListener('click', () => { state.goals.kcalCustom = false; render(); });
  els.resetProtein.addEventListener('click', () => { state.goals.proteinCustom = false; render(); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const p = readProfile();
    if (!validate(p).valid) { setStatus('Completa tus datos para guardar.'); return; }

    const kcal = parseInt(els.goalKcal.value, 10);
    const protein = parseInt(els.goalProtein.value, 10);
    if (!(kcal >= 800 && kcal <= 6000) || !(protein >= 20 && protein <= 500)) {
      setStatus('Revisa tus metas: calorías entre 800 y 6000, proteínas entre 20 y 500 g.');
      return;
    }
    state.profile = p;
    state.goals.kcal = kcal;
    state.goals.protein = protein;

    setStatus(saveState() ? 'Metas guardadas. Mira tu progreso en la pestaña Hoy.' : 'No se pudo guardar: el almacenamiento del navegador no está disponible.');
  });

  /* ---------- Inicio ---------- */
  const saved = loadState();
  if (saved) restoreForm(saved);
  render();
})();
