/* NutriMeta · Núcleo compartido: almacenamiento, navegación, respaldo y PWA */
(() => {
  'use strict';

  const PREFIX = 'nutrimeta:v1:';

  const NM = (window.NutriMeta = {
    PREFIX,

    read(key, fallback = null) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },

    write(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },

    remove(key) {
      try { localStorage.removeItem(PREFIX + key); } catch (e) { /* sin acceso */ }
    },

    // Fecha local en formato AAAA-MM-DD
    dateKey(date = new Date()) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    },

    fmt(n, decimals = 0) {
      return Number(n || 0).toLocaleString('es', { maximumFractionDigits: decimals });
    },

    show(view) {
      document.querySelectorAll('main > section').forEach((s) => {
        s.hidden = s.id !== `view-${view}`;
      });
      document.querySelectorAll('.nav-item').forEach((b) => {
        const active = b.dataset.view === view;
        b.classList.toggle('is-active', active);
        if (active) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
      window.scrollTo({ top: 0 });
      document.dispatchEvent(new CustomEvent('nutrimeta:view', { detail: view }));
    },
  });

  /* ---------- Navegación ---------- */
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!btn.disabled) NM.show(btn.dataset.view);
    });
  });

  /* ---------- Respaldo en archivo ---------- */
  const status = document.getElementById('backup-status');
  const setStatus = (msg) => { if (status) status.textContent = msg; };

  const btnExport = document.getElementById('btn-export');
  const btnImport = document.getElementById('btn-import');
  const fileImport = document.getElementById('file-import');

  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) items[k] = localStorage.getItem(k);
      }
      const data = { app: 'nutrimeta', version: 1, exportedAt: new Date().toISOString(), items };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nutrimeta-respaldo-${NM.dateKey()}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('Respaldo descargado.');
    });
  }

  if (btnImport && fileImport) {
    btnImport.addEventListener('click', () => fileImport.click());
    fileImport.addEventListener('change', async () => {
      const file = fileImport.files[0];
      fileImport.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (data.app !== 'nutrimeta' || typeof data.items !== 'object' || data.items === null) {
          throw new Error('formato');
        }
        const keys = Object.keys(data.items).filter((k) => k.startsWith(PREFIX));
        if (!keys.length) throw new Error('vacío');
        if (!confirm('Se reemplazarán los datos guardados en este dispositivo con los del respaldo. ¿Continuar?')) return;
        keys.forEach((k) => localStorage.setItem(k, String(data.items[k])));
        setStatus('Respaldo restaurado. Recargando…');
        setTimeout(() => location.reload(), 600);
      } catch (e) {
        setStatus('No se pudo leer el archivo. Usa un respaldo descargado desde NutriMeta.');
      }
    });
  }

  /* ---------- PWA: service worker (solo con http/https) ---------- */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
