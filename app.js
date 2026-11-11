const presets = {
  blush: { name: 'Atelier Blush', paper: '#FDF9EE', card: '#FFFDF6', ink: '#33302E', primary: '#CFB7BC', accent: '#99CDD8' },
  mist: { name: 'Misty Studio', paper: '#F8F9F6', card: '#FFFFFF', ink: '#3B4144', primary: '#D6DAEB', accent: '#858479' },
  garden: { name: 'Garden Note', paper: '#F7FBF5', card: '#FEFFF9', ink: '#435348', primary: '#DAEDE3', accent: '#657166' },
  peach: { name: 'Peach Morning', paper: '#FFF9F0', card: '#FFFDF9', ink: '#33302E', primary: '#FDEBD3', accent: '#F3C3B2' }
};

const defaults = { preset: 'blush', ...presets.blush, blur: 0, overlay: 70, brightness: 100, cardAlpha: 92 };
const root = document.documentElement;
const toast = document.querySelector('#toast');
let state = { ...defaults, ...loadAppearance() };
let ideas = loadIdeas();
let calendarEntries = loadCalendarEntries();
let selectedCalendarDate = toDateKey(new Date());
let calendarView = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let editingCalendarEntryId = null;
let tasks = loadTasks();
let editingTaskId = null;

function loadAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem('atelier-appearance') || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function toDateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function dateFromKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
}

function loadCalendarEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem('atelier-calendar-notes') || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).map(([date, value]) => {
      if (Array.isArray(value)) {
        return [date, value.filter(entry => entry && typeof entry === 'object' && (typeof entry.title === 'string' || typeof entry.note === 'string'))
          .map(entry => ({ id: entry.id || newId(), title: entry.title || '', time: entry.time || '', note: entry.note || '' }))];
      }
      if (typeof value === 'string') {
        return [date, [{ id: newId(), title: '备注', time: '', note: value }]];
      }
      return [date, []];
    }).filter(([, entries]) => entries.length));
  } catch {
    return {};
  }
}

function saveCalendarEntries() {
  localStorage.setItem('atelier-calendar-notes', JSON.stringify(calendarEntries));
}

function loadTasks() {
  const defaults = [
    { id: 'starter-1', title: '整理灵感收集箱', priority: 'LOW', completed: true },
    { id: 'starter-2', title: '完成设计探索', priority: 'HIGH', completed: false },
    { id: 'starter-3', title: '给妈妈打电话', priority: 'PERSONAL', completed: false }
  ];
  try {
    const saved = JSON.parse(localStorage.getItem('atelier-tasks') || 'null');
    if (!Array.isArray(saved)) return defaults;
    return saved.filter(task => task && typeof task.title === 'string').map(task => ({
      id: task.id || newId(),
      title: task.title,
      priority: ['LOW', 'HIGH', 'PERSONAL'].includes(task.priority) ? task.priority : 'LOW',
      completed: Boolean(task.completed)
    }));
  } catch {
    return defaults;
  }
}

function saveTasks() {
  localStorage.setItem('atelier-tasks', JSON.stringify(tasks));
}

function formatCalendarDate(dateString) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
    .format(dateFromKey(dateString));
}

function formatCalendarMonth(date) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(date);
}

function renderCalendar() {
  const grid = document.querySelector('#calendarGrid');
  if (!grid) return;
  const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];
  const year = calendarView.getFullYear();
  const month = calendarView.getMonth();
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  document.querySelector('#calendarTitle').textContent = formatCalendarMonth(calendarView);
  const cells = weekdayLabels.map(day => '<span>' + day + '</span>');
  for (let blank = 0; blank < firstDayOffset; blank += 1) cells.push('<span class="calendar-blank" aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = toDateKey(new Date(year, month, day));
    const entries = calendarEntries[date] || [];
    const isToday = date === toDateKey(new Date());
    const entryButtons = entries.slice(0, 3).map(entry => '<button class="calendar-entry-chip" type="button" data-calendar-date="' + date + '" data-calendar-entry-id="' + entry.id + '" aria-label="编辑：' + escapeHtml(entry.title || entry.note) + '">' + (entry.time ? '<time>' + escapeHtml(entry.time) + '</time>' : '') + escapeHtml(entry.title || entry.note) + '</button>').join('');
    const more = entries.length > 3 ? '<small class="calendar-more">还有 ' + (entries.length - 3) + ' 项</small>' : '';
    cells.push('<div class="calendar-day ' + (isToday ? 'today ' : '') + (entries.length ? 'has-note' : '') + '"><button class="calendar-date-button" type="button" data-calendar-date="' + date + '" aria-label="' + formatCalendarDate(date) + (entries.length ? '，已有 ' + entries.length + ' 项日程' : '，新建日程') + '"><b>' + day + '</b><i>＋</i></button><div class="calendar-entry-list">' + entryButtons + more + '</div></div>');
  }
  grid.innerHTML = cells.join('');
}

function changeCalendarMonth(delta) {
  calendarView = new Date(calendarView.getFullYear(), calendarView.getMonth() + delta, 1);
  renderCalendar();
}

function openCalendarNote(date, entryId = null) {
  selectedCalendarDate = date;
  editingCalendarEntryId = entryId;
  const entry = entryId ? (calendarEntries[date] || []).find(item => item.id === entryId) : null;
  const dialog = document.querySelector('#calendarDialog');
  document.querySelector('#calendarNoteDate').value = date;
  document.querySelector('#calendarEventTitle').value = entry ? entry.title : '';
  document.querySelector('#calendarEventTime').value = entry ? entry.time : '';
  document.querySelector('#calendarNoteText').value = entry ? entry.note : '';
  document.querySelector('#calendarDialogTitle').textContent = entry ? '编辑 ' + formatCalendarDate(date) + ' 的日程' : '为 ' + formatCalendarDate(date) + ' 新建日程';
  document.querySelector('#deleteCalendarNote').hidden = !entry;
  document.querySelector('#calendarFormError').hidden = true;
  dialog.showModal();
  document.querySelector('#calendarEventTitle').focus();
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

function taskMarkup(task) {
  return '<article class="task ' + (task.completed ? 'done' : '') + '" data-task-id="' + task.id + '"><label class="task-check"><input type="checkbox" data-task-toggle ' + (task.completed ? 'checked' : '') + ' aria-label="标记“' + escapeHtml(task.title) + '”完成"><span></span></label><button class="task-title" type="button" data-edit-task>' + escapeHtml(task.title) + '</button><button class="task-priority priority-' + task.priority.toLowerCase() + '" type="button" data-edit-task aria-label="编辑“' + escapeHtml(task.title) + '”的优先级">' + task.priority + '</button><button class="task-edit" type="button" data-edit-task aria-label="编辑“' + escapeHtml(task.title) + '”">编辑</button></article>';
}

function renderTasks() {
  const orderedTasks = [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed));
  document.querySelector('#taskList').innerHTML = orderedTasks.slice(0, 4).map(taskMarkup).join('') || '<p class="tasks-empty">还没有任务。</p>';
  document.querySelector('#tasksPageList').innerHTML = orderedTasks.map(taskMarkup).join('') || '<p class="tasks-empty">还没有任务。点击“新建任务”开始吧。</p>';
  updateTaskCount();
}

function updateTaskCount() {
  const remaining = tasks.filter(task => !task.completed).length;
  document.querySelector('#taskCount').textContent = String(remaining);
  document.querySelector('.nav-item[data-page="tasks"] b').textContent = String(remaining);
  document.querySelector('#taskSummary').textContent = remaining ? '还有 ' + remaining + ' 项任务等待完成。' : '今天的任务已全部完成。';
}

function openTaskDialog(taskId = null) {
  editingTaskId = taskId;
  const task = taskId ? tasks.find(item => item.id === taskId) : null;
  document.querySelector('#taskDialogTitle').textContent = task ? '编辑任务' : '新建任务';
  document.querySelector('#taskTitleInput').value = task ? task.title : '';
  document.querySelector('#taskPriorityInput').value = task ? task.priority : 'LOW';
  document.querySelector('#deleteTask').hidden = !task;
  document.querySelector('#taskDialog').showModal();
  document.querySelector('#taskTitleInput').focus();
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
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
      item.removeAttribute('aria-current');
    });
    const matchingNav = document.querySelector('.nav-item[data-page="' + nav.dataset.page + '"]');
    if (matchingNav) {
      matchingNav.classList.add('active');
      matchingNav.setAttribute('aria-current', 'page');
    }
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

  if (event.target.closest('[data-add-task]') || event.target.id === 'quickTask') {
    openTaskDialog();
    return;
  }

  const editTask = event.target.closest('[data-edit-task]');
  if (editTask) {
    openTaskDialog(editTask.closest('[data-task-id]').dataset.taskId);
    return;
  }

  if (event.target.id === 'editDashboard') {
    const dashboard = document.querySelector('#dashboardGrid');
    const editing = dashboard.classList.toggle('is-editing');
    event.target.setAttribute('aria-pressed', String(editing));
    show(editing ? '已进入编辑模式；再次点击即可退出' : '已退出编辑模式');
  }

  const calendarDay = event.target.closest('[data-calendar-date]');
  if (calendarDay) {
    openCalendarNote(calendarDay.dataset.calendarDate, calendarDay.dataset.calendarEntryId || null);
    return;
  }

  if (event.target.id === 'addCalendarNote') {
    openCalendarNote(toDateKey(calendarView));
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
  const title = document.querySelector('#calendarEventTitle').value.trim();
  const time = document.querySelector('#calendarEventTime').value;
  const note = document.querySelector('#calendarNoteText').value.trim();
  const error = document.querySelector('#calendarFormError');
  if (!date || (!title && !note)) {
    error.hidden = false;
    return;
  }
  const entry = { id: editingCalendarEntryId || newId(), title, time, note };
  const entries = calendarEntries[date] || [];
  if (editingCalendarEntryId && selectedCalendarDate !== date) {
    const originalEntries = (calendarEntries[selectedCalendarDate] || []).filter(item => item.id !== editingCalendarEntryId);
    if (originalEntries.length) calendarEntries[selectedCalendarDate] = originalEntries;
    else delete calendarEntries[selectedCalendarDate];
  }
  const existingIndex = entries.findIndex(item => item.id === editingCalendarEntryId);
  if (existingIndex >= 0) entries[existingIndex] = entry;
  else entries.push(entry);
  calendarEntries[date] = entries;
  selectedCalendarDate = date;
  calendarView = new Date(dateFromKey(date).getFullYear(), dateFromKey(date).getMonth(), 1);
  saveCalendarEntries();
  renderCalendar();
  document.querySelector('#calendarDialog').close();
  show(editingCalendarEntryId ? '日程已更新' : '日程已保存');
});

document.querySelector('#deleteCalendarNote').addEventListener('click', () => {
  const entries = calendarEntries[selectedCalendarDate] || [];
  const remaining = entries.filter(item => item.id !== editingCalendarEntryId);
  if (remaining.length) calendarEntries[selectedCalendarDate] = remaining;
  else delete calendarEntries[selectedCalendarDate];
  saveCalendarEntries();
  renderCalendar();
  document.querySelector('#calendarDialog').close();
  show('日程已删除');
});

document.querySelector('#closeCalendarDialog').addEventListener('click', () => {
  document.querySelector('#calendarDialog').close();
});

document.querySelector('#cancelCalendarNote').addEventListener('click', () => {
  document.querySelector('#calendarDialog').close();
});

document.querySelector('#taskForm').addEventListener('submit', event => {
  event.preventDefault();
  const title = document.querySelector('#taskTitleInput').value.trim();
  if (!title) {
    document.querySelector('#taskTitleInput').focus();
    return;
  }
  const priority = document.querySelector('#taskPriorityInput').value;
  const existing = tasks.find(task => task.id === editingTaskId);
  if (existing) {
    existing.title = title;
    existing.priority = priority;
  } else {
    tasks.push({ id: newId(), title, priority, completed: false });
  }
  saveTasks();
  renderTasks();
  document.querySelector('#taskDialog').close();
  show(existing ? '任务已更新' : '任务已创建');
});

document.querySelector('#deleteTask').addEventListener('click', () => {
  if (!editingTaskId) return;
  tasks = tasks.filter(task => task.id !== editingTaskId);
  saveTasks();
  renderTasks();
  document.querySelector('#taskDialog').close();
  show('任务已删除');
});

document.querySelector('#closeTaskDialog').addEventListener('click', () => document.querySelector('#taskDialog').close());
document.querySelector('#cancelTaskDialog').addEventListener('click', () => document.querySelector('#taskDialog').close());
document.querySelector('#taskDialog').addEventListener('click', event => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

document.querySelector('#calendarDialog').addEventListener('click', event => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

document.querySelector('#previousCalendarMonth').addEventListener('click', () => changeCalendarMonth(-1));
document.querySelector('#nextCalendarMonth').addEventListener('click', () => changeCalendarMonth(1));

document.addEventListener('change', event => {
  if (!event.target.matches('[data-task-toggle]')) return;
  const task = tasks.find(item => item.id === event.target.closest('[data-task-id]').dataset.taskId);
  if (!task) return;
  task.completed = event.target.checked;
  saveTasks();
  renderTasks();
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
renderTasks();
document.querySelector('#dashboard').classList.add('active');

