# NutriMeta

Web app móvil (PWA) para calcular tus calorías diarias, registrar lo que comes y cumplir tu meta de proteínas.
Es una página estática: sin backend, sin build y sin API keys. Tus datos se guardan en el navegador (`localStorage`).

## Qué incluye

- **Metas**: BMR y TDEE (Mifflin-St Jeor), meta de calorías y de proteínas editables, respaldo en archivo `.json`.
- **Alimentos**: búsqueda en [Open Food Facts](https://world.openfoodfacts.org), alimento manual, "Mis alimentos" y registro diario por tomas (Desayuno, Almuerzo, Cena, Snacks).
- **Hoy**: anillo de calorías (ingerido / meta / restantes), barra de proteínas que cambia de color (rojo, amarillo, verde), resumen por toma, navegación a días anteriores y botón para reiniciar el día.

## Abrirla en tu computadora

Con VS Code, instala la extensión *Live Server* y pulsa **Go Live**. O desde la carpeta:

```bash
python -m http.server 8000
# abre http://localhost:8000
```

También funciona abriendo `index.html` directamente, pero sin modo offline ni instalación como app.

## Publicarla con GitHub Pages (queda con un link)

```bash
git init
git add .
git commit -m "NutriMeta: versión completa"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/nutrimeta.git
git push -u origin main
```

Luego, en GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
En uno o dos minutos tu app estará en `https://TU-USUARIO.github.io/nutrimeta/`. Ábrelo en el celular y usa
*Añadir a pantalla de inicio* para instalarla.

## Notas

- Los datos son **por dispositivo y por navegador**. Para pasarlos a otro, usa *Descargar respaldo* y *Restaurar respaldo* en la pestaña Metas.
- Cuando publiques cambios, sube el número de `CACHE` en `sw.js` (`nutrimeta-v4` → `nutrimeta-v5`) para que los celulares reciban la versión nueva.
- Open Food Facts limita las búsquedas (unas 10 por minuto), por eso la búsqueda espera un momento después de que dejas de escribir.
- No usa Tailwind ni ninguna librería de JavaScript externa: los estilos están en `styles.css`. Lo único externo son las fuentes de Google, que tienen una alternativa del sistema si no cargan.

## Estructura

```
index.html            Estructura y vistas
styles.css            Estilos propios
core.js               Almacenamiento, navegación, respaldo, registro del service worker
app.js                Módulo 1: calculadora de metas
foods.js              Módulo 2: buscador y registro de alimentos
today.js              Módulo 3: dashboard y progreso (pestaña Hoy)
sw.js                 Service worker (offline)
manifest.webmanifest  Datos de instalación PWA
icons/                Íconos
```
