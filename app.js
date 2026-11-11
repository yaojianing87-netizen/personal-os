const presets = {
  blush: { name: 'Atelier Blush', paper: '#FDF9EE', card: '#FFFDF6', ink: '#33302E', primary: '#CFB7BC', accent: '#99CDD8' },
  mist: { name: 'Misty Studio', paper: '#F8F9F6', card: '#FFFFFF', ink: '#3B4144', primary: '#D6DAEB', accent: '#858479' },
  garden: { name: 'Garden Note', paper: '#F7FBF5', card: '#FEFFF9', ink: '#435348', primary: '#DAEDE3', accent: '#657166' },
  peach: { name: 'Peach Morning', paper: '#FFF9F0', card: '#FFFDF9', ink: '#33302E', primary: '#FDEBD3', accent: '#F3C3B2' }
};

const defaults = { preset: 'blush', ...presets.blush, blur: 0, overlay: 70, brightness: 100, cardAlpha: 92 };
const root = document.documentElement;
const toast = document.querySelector('#toast');
let state = { ...defaults, ...JSON.parse(localStorage.getItem('atelier-appearance') || '{}') };
let ideas = loadIdeas();
let calendarNotes = loadCalendarNotes();
let selectedCalendarDate = '2026-11-11';

function loadCalendarNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem('atelier-calendar-notes') || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function saveCalendarNotes() {
  localStorage.setItem('atelier-calendar-notes', JSON.stringify(calendarNotes));
}

function formatCalendarDate(dateString) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
    .format(new Date(dateString + 'T12:00:00'));
}

function renderCalendar() {
  const grid = document.querySelector('#calendarGrid');
  if (!grid) return;
  const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];
  const firstDayOffset = 6;
  const daysInMonth = 30;
  const cells = weekdayLabels.map(day => '<span>' + day + '</span>');
  for (let blank = 0; blank < firstDayOffset; blank += 1) cells.push('<span class="calendar-blank" aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = '2026-11-' + String(day).padStart(2, '0');
    const note = calendarNotes[date];
    cells.push('<button class="calendar-day ' + (date === '2026-11-11' ? 'today ' : '') + (note ? 'has-note' : '') + '" data-calendar-date="' + date + '" aria-label="' + formatCalendarDate(date) + (note ? '，已有备注' : '，添加备注') + '"><b>' + day + '</b>' + (note ? '<small>' + escapeHtml(note).replace(/\n/g, ' ') + '</small>' : '<i>＋</i>') + '</button>');
  }
  grid.innerHTML = cells.join('');
}

function openCalendarNote(date) {
  selectedCalendarDate = date;
  const dialog = document.querySelector('#calendarDialog');
  document.querySelector('#calendarNoteDate').value = date;
  document.querySelector('#calendarNoteText').value = calendarNotes[date] || '';
  document.querySelector('#calendarDialogTitle').textContent = calendarNotes[date] ? '编辑 ' + formatCalendarDate(date) + ' 的备注' : '为 ' + formatCalendarDate(date) + ' 添加备注';
  document.querySelector('#deleteCalendarNote').hidden = !calendarNotes[date];
  dialog.showModal();
  document.querySelector('#calendarNoteText').focus();
}

function loadIdeas() {
  try {
    const saved = JSON.parse(localStorage.getItem('atelier-ideas') || '[]');
    return Array.isArray(saved) ? saved.filter(note => note && typeof note.text === 'string') : [];
  } catch {
    return [];
  }
}

function saveIdeas() {
  localStorage.setItem('atelier-ideas', JSON.stringify(ideas));
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

function renderIdeas() {
  const list = document.querySelector('#ideasList');
  const preview = document.querySelector('#ideaPreview');
  if (!list || !preview) return;

  if (!ideas.length) {
    list.innerHTML = '<p class="ideas-empty">还没有便签。把第一个念头放在上面的输入框里吧。</p>';
    preview.innerHTML = '<p>把稍纵即逝的想法，留在这里。</p>';
    return;
  }

  list.innerHTML = ideas.map((note, index) => `
    <article class="sticky-note note-tone-${index % 4}" data-idea-id="${note.id}">
      <textarea aria-label="编辑灵感便签">${escapeHtml(note.text)}</textarea>
      <footer><span>自动保存</span><button type="button" class="delete-idea" aria-label="删除这张便签">删除</button></footer>
    </article>
  `).join('');
  preview.innerHTML = `<small>最近记录</small><p>${escapeHtml(ideas[0].text)}</p>`;
}

function apply() {
  for (const key of ['paper', 'card', 'ink', 'primary', 'accent']) root.style.setProperty('--' + key, state[key]);
  root.style.setProperty('--wall-blur', state.blur + 'px');
  root.style.setProperty('--wall-overlay', state.overlay / 100);
  root.style.setProperty('--wall-brightness', state.brightness + '%');
  root.style.setProperty('--card-alpha', state.cardAlpha / 100);
  document.querySelectorAll('[data-token]').forEach(input => input.value = state[input.dataset.token]);
  document.querySelectorAll('[data-setting]').forEach(input => {
    input.value = state[input.dataset.setting];
    document.querySelector('#' + input.dataset.setting + 'Value').textContent =
      input.value + (input.dataset.setting === 'blur' ? ' px' : '%');
  });
  localStorage.setItem('atelier-appearance', JSON.stringify(state));
  renderThemes();
}

function renderThemes() {
  document.querySelector('#themeGrid').innerHTML = Object.entries(presets).map(([key, preset]) =>
    `<button class="theme-option ${state.preset === key ? 'selected' : ''}" data-preset="${key}"><span class="swatches"><i style="background:${preset.paper}"></i><i style="background:${preset.primary}"></i><i style="background:${preset.accent}"></i><i style="background:${preset.ink}"></i></span><b>${preset.name}</b></button>`
  ).join('');
}

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-page]');
  if (nav) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const matchingNav = document.querySelector('.nav-item[data-page="' + nav.dataset.page + '"]');
    if (matchingNav) matchingNav.classList.add('active');
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelector('#' + nav.dataset.page).classList.add('active');
    return;
  }

  const preset = event.target.closest('[data-preset]');
  if (preset) {
    state = { ...state, ...presets[preset.dataset.preset], preset: preset.dataset.preset };
    apply();
    show('已应用 ' + presets[preset.dataset.preset].name);
  }

  if (event.target.id === 'resetAppearance') {
    state = { ...defaults };
    apply();
    show('已恢复 Atelier Blush');
  }

  if (event.target.id === 'quickTask' || event.target.id === 'addTask') {
    const text = prompt('写下此刻要做的一件事');
    if (text) {
      const label = document.createElement('label');
      label.className = 'task';
      label.innerHTML = '<input type="checkbox"><span></span>' + escapeHtml(text) + '<i>NEW</i>';
      document.querySelector('#taskList').append(label);
      show('已加入今天的任务');
    }
  }

  if (event.target.id === 'editDashboard') {
    document.querySelectorAll('.card').forEach(card => card.style.outline = '2px dashed var(--ink)');
    show('编辑模式：拖拽排序将在数据阶段启用');
  }

  const calendarDay = event.target.closest('[data-calendar-date]');
  if (calendarDay) {
    openCalendarNote(calendarDay.dataset.calendarDate);
    return;
  }

  if (event.target.id === 'addCalendarNote') {
    openCalendarNote(selectedCalendarDate);
    return;
  }

  const deleteButton = event.target.closest('.delete-idea');
  if (deleteButton) {
    const card = deleteButton.closest('[data-idea-id]');
    ideas = ideas.filter(note => note.id !== card.dataset.ideaId);
    saveIdeas();
    renderIdeas();
    show('便签已删除');
  }
});

document.querySelector('#ideaForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.querySelector('#ideaInput');
  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }
  ideas.unshift({ id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), text });
  saveIdeas();
  input.value = '';
  renderIdeas();
  show('便签已创建');
});

document.querySelector('#ideasList').addEventListener('input', event => {
  if (!event.target.matches('textarea')) return;
  const card = event.target.closest('[data-idea-id]');
  const note = ideas.find(item => item.id === card.dataset.ideaId);
  if (note) {
    note.text = event.target.value;
    saveIdeas();
  }
});

document.querySelector('#calendarNoteForm').addEventListener('submit', event => {
  event.preventDefault();
  const date = document.querySelector('#calendarNoteDate').value;
  const note = document.querySelector('#calendarNoteText').value.trim();
  if (!date || !note) return;
  calendarNotes[date] = note;
  selectedCalendarDate = date;
  saveCalendarNotes();
  renderCalendar();
  document.querySelector('#calendarDialog').close();
  show('日历备注已保存');
});

document.querySelector('#deleteCalendarNote').addEventListener('click', () => {
  if (!calendarNotes[selectedCalendarDate]) return;
  delete calendarNotes[selectedCalendarDate];
  saveCalendarNotes();
  renderCalendar();
  document.querySelector('#calendarDialog').close();
  show('日历备注已删除');
});

document.querySelectorAll('[data-token]').forEach(input => input.addEventListener('input', event => {
  state[event.target.dataset.token] = event.target.value;
  state.preset = 'custom';
  apply();
}));

document.querySelectorAll('[data-setting]').forEach(input => input.addEventListener('input', event => {
  state[event.target.dataset.setting] = +event.target.value;
  apply();
}));

document.querySelector('#wallpaperInput').addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    root.style.setProperty('--wallpaper-image', 'url(' + reader.result + ')');
    show('壁纸仅在当前浏览器会话中预览');
  };
  reader.readAsDataURL(file);
});

function show(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1900);
}

apply();
renderIdeas();
renderCalendar();
document.querySelector('#dashboard').classList.add('active');

