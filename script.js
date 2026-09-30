/* =========================================================
   script.js — Módulos 3 + 4: persistencia, etiquetas, paletas y Pomodoro
   ========================================================= */
'use strict';

/* ---------- 1. UTILIDADES ---------- */
const $ = (id) => document.getElementById(id);
const root = document.documentElement;

// LocalStorage seguro: guarda JSON y nunca rompe la app si el almacenamiento falla
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} },
  del(key) { try { localStorage.removeItem(key); } catch (e) {} },
};

// Fecha local AAAA-MM-DD (identifica cada día)
function dateKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* ---------- 2. REFERENCIAS Y ESTADO ---------- */
const themeToggle = $('theme-toggle');
const calendarTitle = $('calendar-title');
const calendarGrid = $('calendar-grid');
const dayModal = $('day-modal');
const tabList = $('tab-list');
const tabPanels = $('tab-panels');

let viewDate = new Date();     // mes visible
let selectedKey = null;        // día seleccionado (AAAA-MM-DD)

/* ---------- 3. PALETAS DE COLOR ---------- */
const THEMES = [
  { id: 'warm', name: 'Claro cálido' },
  { id: 'cozy', name: 'Oscuro cozy' },
  { id: 'pastel', name: 'Verde pastel' },
];

function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  root.setAttribute('data-theme', theme.id);
  $('theme-name').textContent = theme.name;
  themeToggle.setAttribute('aria-label', `Paleta: ${theme.name}. Cambiar paleta`);
  store.set('diario:theme', theme.id);
}

themeToggle.addEventListener('click', () => {
  const i = THEMES.findIndex((t) => t.id === root.getAttribute('data-theme'));
  applyTheme(THEMES[(i + 1) % THEMES.length].id);
});

function initTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(store.get('diario:theme', prefersDark ? 'cozy' : 'warm'));
}

/* ---------- 4. DATOS POR DÍA ---------- */
// Cada día se guarda en su propia clave: { fields: {campo: html}, tabs: [{id, title}] }
const dayStoreKey = (key) => `diario:day:${key}`;

const LABELS = ['green', 'blue', 'yellow', 'pink', 'purple'];

// Resumen de un día para pintar el calendario: ¿tiene notas? ¿qué etiqueta?
function dayInfo(key) {
  const data = store.get(dayStoreKey(key), null);
  if (!data) return { hasNotes: false, label: null };
  return { hasNotes: Object.keys(data.fields).length > 0, label: LABELS.includes(data.label) ? data.label : null };
}

// Barrita de color (etiqueta) + puntito (tiene notas)
function marksHTML(key) {
  const info = dayInfo(key);
  return (info.label ? `<span class="day-mark lb-${info.label}"></span>` : '') +
         (info.hasNotes ? '<span class="day-dot" title="Tiene notas"></span>' : '');
}

/* ---------- 5. CALENDARIO ---------- */
function renderCalendar() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const todayStr = new Date().toDateString();

  calendarTitle.textContent = viewDate.toLocaleDateString('es', { month: 'long', year: 'numeric' });

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;   // semana desde lunes
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  calendarGrid.innerHTML = '';
  for (let i = 0; i < totalCells; i++) {
    const date = new Date(year, month, i - firstWeekday + 1);
    const key = dateKey(date);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'day';
    cell.dataset.date = key;
    cell.setAttribute('aria-label', date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }));

    if (date.getMonth() !== month) cell.classList.add('is-outside');
    if (date.toDateString() === todayStr) cell.classList.add('is-today');
    if (key === selectedKey) cell.classList.add('is-selected');

    cell.innerHTML = `<span class="day-num">${date.getDate()}</span>`;
    cell.insertAdjacentHTML('beforeend', marksHTML(key));
    calendarGrid.appendChild(cell);
  }
}

// Marca visualmente el día elegido sin redibujar todo el calendario
function selectDay(key) {
  selectedKey = key;
  calendarGrid.querySelectorAll('.day').forEach((c) => c.classList.toggle('is-selected', c.dataset.date === key));
}

// Vuelve a pintar las marcas de un solo día (sin redibujar todo el calendario)
function refreshMarker(key) {
  const cell = calendarGrid.querySelector(`.day[data-date="${key}"]`);
  if (!cell) return;
  cell.querySelectorAll('.day-mark, .day-dot').forEach((el) => el.remove());
  cell.insertAdjacentHTML('beforeend', marksHTML(key));
}

$('prev-month').addEventListener('click', () => { viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1); renderCalendar(); });
$('next-month').addEventListener('click', () => { viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1); renderCalendar(); });
$('today-btn').addEventListener('click', () => { viewDate = new Date(); renderCalendar(); });

calendarGrid.addEventListener('click', (e) => {
  const cell = e.target.closest('.day');
  if (!cell) return;
  const [y, m, d] = cell.dataset.date.split('-').map(Number);
  openDayModal(new Date(y, m - 1, d));
});

/* ---------- 6. VISTA DIARIA (MODAL) ---------- */
let currentKey = null;                                   // día abierto en el modal
let currentLabel = null;                                 // etiqueta del día abierto
const confirmBar = $('confirm-bar');
const editors = () => dayModal.querySelectorAll('.editor');

function openDayModal(date) {
  currentKey = dateKey(date);
  selectDay(currentKey);

  const text = date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('day-modal-title').textContent = text.charAt(0).toUpperCase() + text.slice(1);

  // 1) Limpiar todo lo del día anterior, así el contenido nunca se repite entre fechas
  tabList.querySelectorAll('[data-custom]').forEach((el) => el.remove());
  tabPanels.querySelectorAll('[data-custom]').forEach((el) => el.remove());

  // 2) Cargar SOLO los datos de esta fecha
  const data = store.get(dayStoreKey(currentKey), { fields: {}, tabs: [] });
  data.tabs.forEach((t) => createTab(t.id, t.title));
  editors().forEach((ed) => { ed.innerHTML = data.fields[ed.dataset.field] || ''; });
  currentLabel = LABELS.includes(data.label) ? data.label : null;
  renderLabelUI();
  confirmBar.hidden = true;

  activateTab($('tab-log'));
  dayModal.showModal();
}

// Guarda el día abierto; si no hay nada que guardar, borra su clave
function saveDay() {
  if (!currentKey) return;
  const fields = {};
  editors().forEach((ed) => { if (ed.textContent.trim()) fields[ed.dataset.field] = ed.innerHTML; });
  const tabs = [...tabList.querySelectorAll('[data-custom]')].map((t) => ({ id: Number(t.dataset.custom), title: t.textContent }));

  if (!Object.keys(fields).length && !tabs.length && !currentLabel) store.del(dayStoreKey(currentKey));
  else store.set(dayStoreKey(currentKey), { fields, tabs, label: currentLabel });
  refreshMarker(currentKey);
}

// Autoguardado con pequeña espera mientras se escribe
let saveTimer;
dayModal.addEventListener('input', (e) => {
  if (e.target.matches('.editor') && !e.target.textContent.trim()) e.target.innerHTML = '';   // limpia <br> residuales
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDay, 300);
});
dayModal.addEventListener('close', () => { clearTimeout(saveTimer); saveDay(); });

// Pegar siempre como texto plano (evita HTML ajeno dentro de las notas)
dayModal.addEventListener('paste', (e) => {
  if (!e.target.closest('.editor')) return;
  e.preventDefault();
  document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
});

/* --- Pestañas --- */
function activateTab(tab) {
  tabList.querySelectorAll('[role="tab"]').forEach((t) => {
    const active = t === tab;
    t.setAttribute('aria-selected', active);
    t.tabIndex = active ? 0 : -1;
    $(t.getAttribute('aria-controls')).hidden = !active;
  });
}

// Crea una pestaña extra (usada al pulsar [+] y al cargar un día guardado)
function createTab(id, title) {
  const tab = document.createElement('button');
  tab.className = 'tab';
  tab.type = 'button';
  tab.id = `tab-custom-${id}`;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', `panel-custom-${id}`);
  tab.dataset.custom = id;
  tab.textContent = title;

  const panel = document.createElement('section');
  panel.className = 'tab-panel';
  panel.id = `panel-custom-${id}`;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', tab.id);
  panel.dataset.custom = id;
  panel.hidden = true;
  panel.innerHTML = `<div class="editor paper" contenteditable="true" role="textbox" aria-multiline="true"
    aria-label="${title}" data-field="tab-${id}" data-placeholder="Página en blanco…"></div>`;

  tab.setAttribute('aria-selected', 'false');
  tab.tabIndex = -1;
  tabList.appendChild(tab);
  tabPanels.appendChild(panel);
  return tab;
}

$('tab-add').addEventListener('click', () => {
  const ids = [...tabList.querySelectorAll('[data-custom]')].map((t) => Number(t.dataset.custom));
  const id = ids.length ? Math.max(...ids) + 1 : 1;
  const tab = createTab(id, `Pestaña ${id}`);
  activateTab(tab);
  tab.scrollIntoView({ inline: 'nearest' });
  $(`panel-custom-${id}`).querySelector('.editor').focus();
  saveDay();
});

tabList.addEventListener('click', (e) => {
  const tab = e.target.closest('[role="tab"]');
  if (tab) activateTab(tab);
});
tabList.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const tabs = [...tabList.querySelectorAll('[role="tab"]')];
  const i = tabs.indexOf(document.activeElement);
  const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
  activateTab(next);
  next.focus();
});

/* --- Barra de formato --- */
const toolbar = $('toolbar');
// mousedown + preventDefault: el clic en la barra no le quita la selección al texto
toolbar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
toolbar.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  const editor = document.activeElement;
  if (!btn || !editor || !editor.classList.contains('editor')) return;   // solo si se está escribiendo en un editor

  document.execCommand('styleWithCSS', false, true);
  if (btn.dataset.cmd === 'clear') {
    document.execCommand('removeFormat');
    document.execCommand('hiliteColor', false, 'transparent');
  } else if (btn.dataset.cmd) {
    document.execCommand(btn.dataset.cmd);
  } else if ('hl' in btn.dataset) {
    document.execCommand('hiliteColor', false, getComputedStyle(btn).backgroundColor);   // toma el color del propio botón
  }
});

/* --- Etiqueta de color del día (con opción de quitarla) --- */
function renderLabelUI() {
  $('label-row').querySelectorAll('.lb').forEach((b) => b.setAttribute('aria-pressed', b.dataset.label === currentLabel));
}
$('label-row').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-label]');
  if (!btn) return;
  currentLabel = btn.dataset.label || null;      // "Quitar etiqueta" trae valor vacío → null
  renderLabelUI();
  saveDay();
});

/* --- Limpiar día, con confirmación --- */
$('clear-day').addEventListener('click', () => { confirmBar.hidden = false; $('confirm-yes').focus(); });
$('confirm-no').addEventListener('click', () => { confirmBar.hidden = true; });
$('confirm-yes').addEventListener('click', () => {
  editors().forEach((ed) => { ed.innerHTML = ''; });
  dayModal.querySelectorAll('[data-custom]').forEach((el) => el.remove());   // también las pestañas extra
  activateTab($('tab-log'));
  confirmBar.hidden = true;
  saveDay();                                     // la etiqueta se conserva: se quita con su propio botón
});

/* --- Cerrar --- */
$('modal-close').addEventListener('click', () => dayModal.close());
dayModal.addEventListener('click', (e) => { if (e.target === dayModal) dayModal.close(); });

/* ---------- 7. HÁBITOS EDITABLES ---------- */
// items: lista de hábitos · done: { fecha: [ids completados ese día] }, así cada día empieza en blanco
let habits = store.get('diario:habits', {
  items: [
    { id: 1, text: 'Estudiar 25 minutos sin distracciones' },
    { id: 2, text: 'Repasar lo aprendido ayer' },
    { id: 3, text: 'Beber agua y estirarte en cada pausa' },
    { id: 4, text: 'Anotar una cosa nueva que entendiste' },
  ],
  done: {},
});
const saveHabits = () => store.set('diario:habits', habits);

function renderHabits() {
  const list = $('habits-list');
  const today = dateKey(new Date());
  const doneToday = habits.done[today] || [];
  list.innerHTML = '';

  habits.items.forEach((h) => {
    const li = document.createElement('li');
    li.className = 'habit-row';
    li.innerHTML = `<label class="habit"><input type="checkbox"><span class="box"><svg class="icon"><use href="#i-check"/></svg></span><span class="habit-text"></span></label>
      <button class="habit-del" type="button" aria-label="Borrar hábito"><svg class="icon"><use href="#i-close"/></svg></button>`;
    li.querySelector('.habit-text').textContent = h.text;      // textContent: el texto del usuario nunca se interpreta como HTML

    const checkbox = li.querySelector('input');
    checkbox.checked = doneToday.includes(h.id);
    checkbox.addEventListener('change', () => {
      const set = new Set(habits.done[today] || []);
      if (checkbox.checked) set.add(h.id); else set.delete(h.id);
      habits.done[today] = [...set];
      saveHabits();
    });

    li.querySelector('.habit-del').addEventListener('click', () => {
      habits.items = habits.items.filter((x) => x.id !== h.id);
      Object.keys(habits.done).forEach((d) => { habits.done[d] = habits.done[d].filter((id) => id !== h.id); });
      saveHabits();
      renderHabits();
    });
    list.appendChild(li);
  });
}

$('habit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('habit-input');
  const text = input.value.trim();
  if (!text) return;
  habits.items.push({ id: Date.now(), text });
  input.value = '';
  saveHabits();
  renderHabits();
});

/* ---------- 8. NOTAS RÁPIDAS (guardado automático) ---------- */
const scratchpad = $('scratchpad');
scratchpad.value = store.get('diario:scratch', '');
scratchpad.addEventListener('input', () => store.set('diario:scratch', scratchpad.value));

/* ---------- 9. POMODORO ---------- */
const POMODORO_SECONDS = 25 * 60;
const BASE_TITLE = document.title;
const pomo = { remaining: POMODORO_SECONDS, endAt: 0, timer: null, audio: null };
const pomoBox = document.querySelector('.pomodoro');
const pomoTime = $('pomodoro-time');
const pomoMode = $('pomodoro-mode');
const pomoToggle = $('pomodoro-toggle');

const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function renderPomodoro() {
  pomoTime.textContent = formatTime(pomo.remaining);
  document.title = pomo.timer ? `${formatTime(pomo.remaining)} · ${BASE_TITLE}` : BASE_TITLE;
}

// Cambia el ícono y la etiqueta del botón principal (iniciar ↔ pausar)
function setRunningUI(running) {
  pomoToggle.querySelector('use').setAttribute('href', running ? '#i-pause' : '#i-play');
  pomoToggle.setAttribute('aria-label', running ? 'Pausar temporizador' : 'Iniciar temporizador');
  pomoBox.classList.toggle('is-running', running);
}

function startPomodoro() {
  if (pomo.remaining <= 0) pomo.remaining = POMODORO_SECONDS;
  // El audio se prepara aquí porque el navegador exige un clic del usuario para permitir sonido
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && !pomo.audio) pomo.audio = new AC();
  if (pomo.audio && pomo.audio.state === 'suspended') pomo.audio.resume();

  pomo.endAt = Date.now() + pomo.remaining * 1000;   // se calcula con la hora real: no se atrasa si la pestaña está en segundo plano
  pomo.timer = setInterval(tick, 250);
  pomoBox.classList.remove('is-done');
  pomoMode.textContent = 'Enfoque';
  setRunningUI(true);
  renderPomodoro();
}

function pausePomodoro() {
  clearInterval(pomo.timer);
  pomo.timer = null;
  pomoMode.textContent = 'En pausa';
  setRunningUI(false);
  renderPomodoro();
}

function resetPomodoro() {
  clearInterval(pomo.timer);
  pomo.timer = null;
  pomo.remaining = POMODORO_SECONDS;
  pomoMode.textContent = 'Enfoque';
  pomoBox.classList.remove('is-done');
  setRunningUI(false);
  renderPomodoro();
}

function tick() {
  pomo.remaining = Math.max(0, Math.ceil((pomo.endAt - Date.now()) / 1000));
  if (pomo.remaining > 0) return renderPomodoro();

  // Llegó a 00:00
  clearInterval(pomo.timer);
  pomo.timer = null;
  pomoMode.textContent = '¡Listo!';
  pomoBox.classList.add('is-done');
  setRunningUI(false);
  pomoTime.textContent = '00:00';
  document.title = `¡Pomodoro terminado! · ${BASE_TITLE}`;
  playChime();
}

// Sonido suave: tres notas sinusoidales con volumen bajo
function playChime() {
  const ctx = pomo.audio;
  if (!ctx) return;
  [660, 880, 660].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime + i * 0.45;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.15, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  });
}

pomoToggle.addEventListener('click', () => (pomo.timer ? pausePomodoro() : startPomodoro()));
$('pomodoro-reset').addEventListener('click', resetPomodoro);

/* ---------- 10. INICIO ---------- */
initTheme();
renderCalendar();
renderHabits();
