/* 任务排序用到的常量：必须放在文件最前面，因为下面马上就会读取任务并排序 */
const TASK_PRIORITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const TASK_CATEGORIES = { PERSONAL: '个人', STUDY: '学习', WORK: '工作', TRAVEL: '旅行' };
const TASK_CATEGORY_CLASS = { PERSONAL: 'priority-personal', STUDY: 'cat-study', WORK: 'cat-work', TRAVEL: 'cat-travel' };
const PINYIN_BOUNDARIES = [['A', '阿'], ['B', '芭'], ['C', '擦'], ['D', '搭'], ['E', '蛾'], ['F', '发'], ['G', '噶'], ['H', '哈'], ['J', '击'], ['K', '喀'], ['L', '垃'], ['M', '妈'], ['N', '拿'], ['O', '哦'], ['P', '啪'], ['Q', '期'], ['R', '然'], ['S', '撒'], ['T', '塌'], ['W', '挖'], ['X', '昔'], ['Y', '压'], ['Z', '匝']];
const pinyinCollator = (() => {
  try {
    const collator = new Intl.Collator('zh-Hans-CN-u-co-pinyin');
    return /^zh/i.test(collator.resolvedOptions().locale) ? collator : null;
  } catch { return null; }
})();

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
let calendarEntries = loadCalendarEntries();
let selectedCalendarDate = toDateKey(new Date());
let calendarView = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let editingCalendarEntryId = null;
let tasks = loadTasks();
let editingTaskId = null;
let noteStore = loadNotes();
let currentFolderId = null;
let activeNoteId = null;
let editingFolderId = null;

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

function updateDateLine() {
  const dateLine = document.querySelector('#dateLine');
  if (!dateLine) return;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).formatToParts(new Date()).reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
  dateLine.textContent = (parts.weekday + ', ' + parts.day + ' ' + parts.month).toUpperCase();
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

// 优先级：HIGH > MEDIUM > LOW。PERSONAL 是“类别”，和优先级分开保存（旧数据里的 PERSONAL 优先级会迁移成类别）。
// 任务名第一个字的首字母：英文取字母；中文取拼音首字母；其他符号/数字排在字母之后
function taskInitial(title) {
  const first = [...String(title || '').trim()][0];
  if (!first) return '~';
  if (/[A-Za-z]/.test(first)) return first.toUpperCase();
  if (/[\u3400-\u9fff]/.test(first) && pinyinCollator) {
    let letter = 'A';
    for (const [initial, boundary] of PINYIN_BOUNDARIES) {
      if (pinyinCollator.compare(first, boundary) >= 0) letter = initial; else break;
    }
    return letter;
  }
  return '~';
}

function compareTasks(a, b) {
  const rank = (TASK_PRIORITY_RANK[a.priority] ?? 3) - (TASK_PRIORITY_RANK[b.priority] ?? 3);
  if (rank) return rank;
  const initialA = taskInitial(a.title);
  const initialB = taskInitial(b.title);
  if (initialA !== initialB) return initialA < initialB ? -1 : 1;
  return (a.seq ?? 0) - (b.seq ?? 0); // 首字母相同：保持原来的先后顺序
}

// 直接整理 tasks 这份数据本身（任务页、首页、专注模式读到的都是排好序的）
function sortTasks() {
  tasks.sort(compareTasks);
}

function normalizeTask(task, index) {
  const legacyPersonal = task.priority === 'PERSONAL';
  return {
    id: task.id || newId(),
    title: task.title,
    priority: TASK_PRIORITY_RANK[task.priority] !== undefined ? task.priority : (legacyPersonal ? 'MEDIUM' : 'LOW'),
    category: legacyPersonal ? 'PERSONAL' : (Object.prototype.hasOwnProperty.call(TASK_CATEGORIES, task.category) ? task.category : ''),
    completed: Boolean(task.completed),
    focus: Boolean(task.focus),
    dueDate: typeof task.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) ? task.dueDate : '',
    seq: Number.isFinite(Number(task.seq)) ? Number(task.seq) : index
  };
}

function loadTasks() {
  const defaults = [
    { id: 'starter-1', title: '整理灵感收集箱', priority: 'LOW', completed: true },
    { id: 'starter-2', title: '完成设计探索', priority: 'HIGH', completed: false },
    { id: 'starter-3', title: '给妈妈打电话', priority: 'PERSONAL', completed: false }
  ];
  let list;
  try {
    const saved = JSON.parse(localStorage.getItem('atelier-tasks') || 'null');
    list = Array.isArray(saved) ? saved.filter(task => task && typeof task.title === 'string') : defaults;
  } catch {
    list = defaults;
  }
  return list.map(normalizeTask).sort(compareTasks);
}

function saveTasks() {
  sortTasks();
  localStorage.setItem('atelier-tasks', JSON.stringify(tasks));
}

function loadNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem('atelier-notes') || '{}');
    const legacyNotes = Array.isArray(saved) ? saved : null;
    const storedFolders = !legacyNotes && saved && typeof saved === 'object' && Array.isArray(saved.folders) ? saved.folders : [];
    const usedFolderIds = new Set();
    const uniqueFolderId = value => {
      let id = typeof value === 'string' && value.trim() && !usedFolderIds.has(value) ? value : newId();
      while (usedFolderIds.has(id)) id = newId();
      usedFolderIds.add(id);
      return id;
    };
    const folders = storedFolders
      .filter(folder => folder && typeof folder === 'object' && typeof folder.name === 'string')
      .map(folder => ({
        id: uniqueFolderId(folder.id),
        parentId: typeof folder.parentId === 'string' ? folder.parentId : null,
        name: folder.name,
        icon: typeof folder.icon === 'string' && folder.icon ? folder.icon : '◫'
      }));
    const folderIds = new Set(folders.map(folder => folder.id));
    const foldersById = new Map(folders.map(folder => [folder.id, folder]));
    folders.forEach(folder => {
      if (!folderIds.has(folder.parentId) || folder.parentId === folder.id) folder.parentId = null;
    });
    folders.forEach(folder => {
      const visited = new Set([folder.id]);
      let parentId = folder.parentId;
      while (parentId) {
        if (visited.has(parentId)) {
          folder.parentId = null;
          break;
        }
        visited.add(parentId);
        parentId = foldersById.get(parentId)?.parentId || null;
      }
    });

    const storedNotes = legacyNotes || (saved && typeof saved === 'object' && Array.isArray(saved.notes) ? saved.notes : []);
    const usedNoteIds = new Set();
    const uniqueNoteId = value => {
      let id = typeof value === 'string' && value.trim() && !usedNoteIds.has(value) ? value : newId();
      while (usedNoteIds.has(id)) id = newId();
      usedNoteIds.add(id);
      return id;
    };
    const notes = storedNotes
      .filter(note => note && typeof note === 'object' && typeof note.title === 'string')
      .map(note => ({
        id: uniqueNoteId(note.id),
        folderId: !legacyNotes && typeof note.folderId === 'string' && folderIds.has(note.folderId) ? note.folderId : null,
        title: note.title,
        body: typeof note.body === 'string' ? note.body : ''
      }));
    return { folders, notes };
  } catch { return { folders: [], notes: [] }; }
}
function saveNotes() { localStorage.setItem('atelier-notes', JSON.stringify(noteStore)); }
function renderNotes() {
  if (currentFolderId && !noteStore.folders.some(item => item.id === currentFolderId)) currentFolderId = null;
  const folder = noteStore.folders.find(item => item.id === currentFolderId);
  const ancestors = [];
  const visited = new Set();
  let parent = folder;
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id);
    ancestors.unshift(parent);
    parent = noteStore.folders.find(item => item.id === parent.parentId) || null;
  }
  const parentButton = folder
    ? '<button type="button" data-notes-parent aria-label="返回上一级">‹ 上一级</button>'
    : '';
  const breadcrumb = ancestors.map((item, index) => {
    const isCurrent = index === ancestors.length - 1;
    return '<span aria-hidden="true">／</span>' + (isCurrent
      ? '<b aria-current="location">' + escapeHtml(item.name) + '</b>'
      : '<button type="button" data-open-folder="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + '</button>');
  }).join('');
  document.querySelector('#notesPath').innerHTML =
    '<button type="button" data-notes-root>笔记</button>' + breadcrumb + parentButton;
  const folders = noteStore.folders.filter(item => item.parentId === currentFolderId);
  const notes = noteStore.notes.filter(item => item.folderId === currentFolderId);
  const folderMarkup = folders.map(item => {
    const id = escapeHtml(item.id);
    const name = escapeHtml(item.name);
    return '<article class="note-folder"><button class="note-folder-open" type="button" data-open-folder="' + id + '" aria-label="打开文件夹：' + name + '"><span aria-hidden="true">' + escapeHtml(item.icon) + '</span><b>' + name + '</b></button><button class="note-folder-edit" type="button" data-edit-folder="' + id + '" aria-label="编辑文件夹：' + name + '">•••</button></article>';
  }).join('');
  const noteMarkup = notes.map(item => {
    const id = escapeHtml(item.id);
    const title = escapeHtml(item.title || '未命名笔记');
    const excerpt = escapeHtml(item.body || '空白笔记').slice(0, 80);
    return '<button class="note-item' + (item.id === activeNoteId ? ' selected' : '') + '" type="button" data-open-note="' + id + '"' + (item.id === activeNoteId ? ' aria-current="true"' : '') + '><span aria-hidden="true">▤</span><b>' + title + '</b><small>' + excerpt + '</small></button>';
  }).join('');
  document.querySelector('#notesItems').innerHTML = folderMarkup + noteMarkup ||
    '<p class="notes-empty">' + (folder ? '这个文件夹还没有内容。可以新建笔记或子文件夹。' : '这里还没有内容。创建一个文件夹或笔记开始吧。') + '</p>';
  const note = noteStore.notes.find(item => item.id === activeNoteId);
  document.querySelector('#noteEditor').hidden = !note;
  document.querySelector('.notes-workspace').classList.toggle('has-active-note', Boolean(note));
  if (note) { document.querySelector('#noteTitle').value = note.title; document.querySelector('#noteBody').value = note.body; }
  updateDashboardNotePreview();
}
function openFolderDialog(id = null) {
  editingFolderId = id;
  const folder = noteStore.folders.find(item => item.id === id);
  document.querySelector('#folderDialogTitle').textContent = folder ? '编辑文件夹' : '新建文件夹';
  document.querySelector('#folderNameInput').value = folder ? folder.name : '';
  document.querySelector('#folderIconInput').value = folder ? folder.icon : '◫';
  document.querySelector('#deleteFolder').hidden = !folder;
  document.querySelector('#folderDialog').showModal();
  document.querySelector('#folderNameInput').focus();
}

function createNote() {
  const note = { id: newId(), folderId: currentFolderId, title: '未命名笔记', body: '' };
  noteStore.notes.push(note);
  activeNoteId = note.id;
  saveNotes();
  renderNotes();
  document.querySelector('#noteTitle').focus();
}

function updateNoteListing(note) {
  const item = [...document.querySelectorAll('#notesItems [data-open-note]')]
    .find(element => element.dataset.openNote === note.id);
  if (item) {
    item.querySelector('b').textContent = note.title || '未命名笔记';
    item.querySelector('small').textContent = note.body || '空白笔记';
  }
  updateDashboardNotePreview();
}

function updateDashboardNotePreview() {
  const preview = document.querySelector('#dashboardNotePreview');
  if (!preview) return;
  const latest = noteStore.notes[noteStore.notes.length - 1];
  if (!latest) {
    preview.innerHTML = '<small>正式笔记</small><h3>把值得长期保存的内容放在这里。</h3><p>你的笔记会保存在当前浏览器中。</p>';
    return;
  }
  const excerpt = latest.body.trim().slice(0, 90);
  preview.innerHTML = '<small>最近一篇笔记</small><h3>' + escapeHtml(latest.title || '未命名笔记') +
    '</h3><p>' + escapeHtml(excerpt || '打开笔记，继续补充正文。') + '</p>';
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

function taskMarkup(task) {
  return '<article class="task ' + (task.completed ? 'done' : '') + '" data-task-id="' + task.id + '"><label class="task-check"><input type="checkbox" data-task-toggle ' + (task.completed ? 'checked' : '') + ' aria-label="标记“' + escapeHtml(task.title) + '”完成"><span></span></label><button class="task-title" type="button" data-edit-task>' + escapeHtml(task.title) + '</button><div class="task-badges"><button class="task-priority priority-' + task.priority.toLowerCase() + '" type="button" data-edit-task aria-label="编辑“' + escapeHtml(task.title) + '”的优先级">' + task.priority + '</button>' + (task.category ? '<button class="task-priority ' + (TASK_CATEGORY_CLASS[task.category] || '') + '" type="button" data-edit-task aria-label="编辑“' + escapeHtml(task.title) + '”的类别">' + task.category + '</button>' : '') + '</div><button class="task-edit" type="button" data-edit-task aria-label="编辑“' + escapeHtml(task.title) + '”">编辑</button></article>';
}

function renderTasks() {
  sortTasks();
  const orderedTasks = tasks;
  document.querySelector('#taskList').innerHTML = orderedTasks.slice(0, 4).map(taskMarkup).join('') || '<p class="tasks-empty">还没有任务。</p>';
  renderTasksPage();
  updateTaskCount();
  if (typeof fmRenderTask === 'function') fmRenderTask();
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
  document.querySelector('#taskDueInput').value = task ? task.dueDate : toDateKey(new Date());
  document.querySelector('#taskCategoryInput').value = task ? task.category : '';
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

const TRAVEL_STORAGE_KEY = 'atelier-travel-destinations';
const TRAVEL_STATUS = {
  visited: { label: '已去过', color: '#6E8B74' },
  wishlist: { label: '想去', color: '#C48F9C' },
  planning: { label: '正在计划', color: '#D9A05B' }
};
const TRAVEL_BACKUP_KEY = 'atelier-travel-destinations-backup-v1';
// 仅用于“识别并清理”旧版本内置、并被自动存进浏览器的 7 个示例地点（不会被显示）。
// 必须 ID、名称、国家、经纬度全部一致才算示例；只要有一项不同就视为用户数据并保留。
const OLD_SAMPLE_PLACES = [
  { id: 'travel-tokyo', name: '东京', country: '日本', lat: 35.6762, lon: 139.6503 },
  { id: 'travel-kyoto', name: '京都', country: '日本', lat: 35.0116, lon: 135.7681 },
  { id: 'travel-paris', name: '巴黎', country: '法国', lat: 48.8566, lon: 2.3522 },
  { id: 'travel-santorini', name: '圣托里尼', country: '希腊', lat: 36.3932, lon: 25.4615 },
  { id: 'travel-new-york', name: '纽约', country: '美国', lat: 40.7128, lon: -74.006 },
  { id: 'travel-reykjavik', name: '雷克雅未克', country: '冰岛', lat: 64.1466, lon: -21.9426 },
  { id: 'travel-rome', name: '罗马', country: '意大利', lat: 41.9028, lon: 12.4964 }
];
let travelDestinations = loadTravelDestinations();
let travelMap = null;
let travelLayer = null;
const travelMarkers = new Map();

// 清理旧的示例地点。安全规则：
// 1) 先把原始数据原样备份到 TRAVEL_BACKUP_KEY，并读回核对；备份不成功就不清理。
// 2) 只删除能明确识别的示例；无法判断的记录一律保留。
// 3) 写回后再读回核对；不一致就把原始数据恢复回去。
// 手动恢复：localStorage.setItem('atelier-travel-destinations', JSON.parse(localStorage.getItem('atelier-travel-destinations-backup-v1')).raw)
function removeOldSamplePlaces(raw, saved) {
  try {
    if (localStorage.getItem(TRAVEL_BACKUP_KEY) === null) {
      localStorage.setItem(TRAVEL_BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), raw }));
    }
    const backup = JSON.parse(localStorage.getItem(TRAVEL_BACKUP_KEY));
    if (!backup || typeof backup.raw !== 'string') return saved;
    const cleaned = saved.filter(item => !isOldSamplePlace(item));
    if (cleaned.length === saved.length) return saved;
    const cleanedText = JSON.stringify(cleaned);
    localStorage.setItem(TRAVEL_STORAGE_KEY, cleanedText);
    if (localStorage.getItem(TRAVEL_STORAGE_KEY) !== cleanedText) {
      localStorage.setItem(TRAVEL_STORAGE_KEY, raw);
      return saved;
    }
    return cleaned;
  } catch {
    try { localStorage.setItem(TRAVEL_STORAGE_KEY, raw); } catch { /* 原数据可能本来就没改动 */ }
    return saved;
  }
}

function isOldSamplePlace(item) {
  return OLD_SAMPLE_PLACES.some(sample => item && item.id === sample.id && item.name === sample.name &&
    item.country === sample.country && Number(item.lat) === sample.lat && Number(item.lon) === sample.lon);
}

function loadTravelDestinations() {
  try {
    const raw = localStorage.getItem(TRAVEL_STORAGE_KEY);
    const parsed = JSON.parse(raw || 'null');
    if (!Array.isArray(parsed)) return [];
    const saved = removeOldSamplePlaces(raw, parsed);
    return saved
      .filter(item => item && typeof item.name === 'string' && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
      .map(item => ({
        ...item,
        id: item.id || newId(),
        name: item.name,
        country: typeof item.country === 'string' ? item.country : '',
        lat: Number(item.lat),
        lon: Number(item.lon),
        status: TRAVEL_STATUS[item.status] ? item.status : 'wishlist'
      }));
  } catch {
    return [];
  }
}

function saveTravelDestinations() {
  localStorage.setItem(TRAVEL_STORAGE_KEY, JSON.stringify(travelDestinations));
}

const TRAVEL_EMPTY_TEXT = {
  wishlist: '还没有想去的地方。<br>添加地点时选择“想去”，它会出现在这里。',
  visited: '还没有去过的地方。<br>添加地点时选择“已去过”。',
  planning: '还没有计划中的旅行。<br>添加地点时选择“正在计划”。'
};

// 三个面板：数量和地点列表都由当前保存的地点实时生成，和地图保持同步
function renderTravelStats() {
  Object.keys(TRAVEL_EMPTY_TEXT).forEach(status => {
    const places = travelDestinations.filter(item => item.status === status);
    document.querySelector('#' + status + 'Count').textContent = String(places.length);
    document.querySelector('#' + status + 'List').innerHTML = places.length
      ? places.map(place => {
        const id = escapeHtml(place.id);
        const chips = travelAttractions.filter(item => item.destinationId === place.id).map(item => {
          const cached = attractionCoverCache.get(item.id);
          return '<button class="travel-attraction" type="button" data-open-attraction="' + escapeHtml(item.id) + '" title="' + escapeHtml(item.name) + '">' +
            '<span class="travel-attraction-photo" data-cover-for="' + escapeHtml(item.id) + '">' +
            (cached && cached.url ? '<img src="' + cached.url + '" alt="" />' : '<i aria-hidden="true">◉</i>') +
            '<em class="travel-attraction-count"' + (cached && cached.count > 1 ? '' : ' hidden') + '>' + (cached ? cached.count : 0) + '</em></span>' +
            '<b>' + escapeHtml(item.name) + '</b></button>';
        }).join('');
        return '<div class="travel-place-group"><button class="travel-place" type="button" data-focus-destination="' + id + '"><b>' +
          escapeHtml(place.name) + '</b><small>' + escapeHtml(place.country || '未填写国家') + '</small></button>' +
          '<div class="travel-attractions">' + chips + '<button class="travel-attraction-add" type="button" data-add-attraction="' + id +
          '">＋ 添加景点</button></div>' + (place.status === 'planning' ? todoMarkup(place) : '') + '</div>';
      }).join('')
      : '<p class="travel-list-empty">' + TRAVEL_EMPTY_TEXT[status] + '</p>';
  });
  document.querySelector('#travelEmpty').hidden = travelDestinations.length > 0;
  hydrateAttractionCovers();
}

// 景点封面：从 IndexedDB 读取封面照片并显示在卡片上（结果缓存，重复渲染不闪烁）
const attractionCoverCache = new Map();
async function hydrateAttractionCovers() {
  const cards = [...document.querySelectorAll('[data-cover-for]')];
  for (const card of cards) {
    const attractionId = card.dataset.coverFor;
    if (attractionCoverCache.has(attractionId)) continue;
    const attraction = travelAttractions.find(item => item.id === attractionId);
    if (!attraction) continue;
    const photos = await photosForAttraction(attractionId);
    const cover = photos.find(photo => photo.id === attraction.coverPhotoId) || photos[0];
    attractionCoverCache.set(attractionId, { url: cover ? URL.createObjectURL(cover.blob) : '', count: photos.length });
  }
  document.querySelectorAll('[data-cover-for]').forEach(card => {
    const info = attractionCoverCache.get(card.dataset.coverFor);
    if (!info || !info.url || card.querySelector('img')) return;
    card.querySelector('i')?.remove();
    card.insertAdjacentHTML('afterbegin', '<img src="' + info.url + '" alt="" />');
    const badge = card.querySelector('.travel-attraction-count');
    if (badge) { badge.textContent = String(info.count); badge.hidden = info.count < 2; }
  });
}

function forgetAttractionCover(attractionId) {
  const info = attractionCoverCache.get(attractionId);
  if (info && info.url) URL.revokeObjectURL(info.url);
  attractionCoverCache.delete(attractionId);
}

/* ---------- 每个「正在计划」目的地的独立待办清单 ----------
   待办按 destinationId 关联，存在 localStorage，勾选/修改都会自动保存。 */
const TODOS_KEY = 'atelier-travel-todos';
let travelTodos = loadTravelTodos();
let editingTodoId = null;

function loadTravelTodos() {
  try {
    const saved = JSON.parse(localStorage.getItem(TODOS_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved
      .filter(item => item && typeof item.destinationId === 'string' && typeof item.text === 'string')
      .map(item => ({ id: item.id || newId(), destinationId: item.destinationId, text: item.text, done: Boolean(item.done), createdAt: item.createdAt || new Date().toISOString() }));
  } catch { return []; }
}

function saveTravelTodos() {
  localStorage.setItem(TODOS_KEY, JSON.stringify(travelTodos));
}

function todoMarkup(destination) {
  const id = escapeHtml(destination.id);
  const list = travelTodos.filter(item => item.destinationId === destination.id);
  const done = list.filter(item => item.done).length;
  const percent = list.length ? Math.round((done / list.length) * 100) : 0;
  const items = list.map(item => {
    const todoId = escapeHtml(item.id);
    const text = escapeHtml(item.text);
    const editing = item.id === editingTodoId;
    return '<li class="travel-todo-item' + (item.done ? ' done' : '') + '">' +
      '<label class="travel-todo-check"><input type="checkbox" data-todo-toggle="' + todoId + '"' + (item.done ? ' checked' : '') + ' aria-label="标记“' + text + '”完成"><span></span></label>' +
      (editing
        ? '<input class="travel-todo-edit-input" data-todo-input="' + todoId + '" value="' + text + '" maxlength="120" aria-label="编辑待办" />'
        : '<span class="travel-todo-text">' + text + '</span>') +
      '<button type="button" class="travel-todo-action" data-todo-edit="' + todoId + '">编辑</button>' +
      '<button type="button" class="travel-todo-action travel-todo-delete" data-todo-delete="' + todoId + '">删除</button></li>';
  }).join('');
  return '<div class="travel-todo">' +
    '<div class="travel-todo-head"><span>待办清单</span><small>' + (list.length ? done + '/' + list.length + ' 完成 · ' + percent + '%' : '还没有待办') + '</small></div>' +
    (list.length ? '<div class="travel-todo-bar"><span style="width:' + percent + '%"></span></div>' : '') +
    (list.length ? '<ul class="travel-todo-list">' + items + '</ul>' : '') +
    '<form class="travel-todo-form" data-todo-destination="' + id + '"><input type="text" maxlength="120" placeholder="＋ 添加待办，例如：Research flights" aria-label="为 ' + escapeHtml(destination.name) + ' 添加待办" /><button type="submit">添加</button></form>' +
    '</div>';
}

function travelPinIcon(status) {
  const color = (TRAVEL_STATUS[status] || TRAVEL_STATUS.wishlist).color;
  return L.divIcon({
    className: 'travel-pin-wrap',
    html: '<svg class="travel-pin" width="26" height="34" viewBox="0 0 26 34" aria-hidden="true"><path d="M13 32.5C13 32.5 24.5 20 24.5 12.8A11.5 11.5 0 1 0 1.5 12.8C1.5 20 13 32.5 13 32.5Z" fill="' + color + '" stroke="#fffdf6" stroke-width="2"/><circle cx="13" cy="12.8" r="4.2" fill="#fffdf6"/></svg>',
    iconSize: [26, 34],
    iconAnchor: [13, 33],
    popupAnchor: [0, -30]
  });
}

function renderTravelMarkers() {
  if (!travelMap || !travelLayer) return;
  travelLayer.clearLayers();
  travelMarkers.clear();
  travelDestinations.forEach(destination => {
    const marker = L.marker([destination.lat, destination.lon], {
      icon: travelPinIcon(destination.status),
      title: destination.name
    });
    travelMarkers.set(destination.id, marker);
    marker.bindPopup(
      '<div class="travel-popup"><b>' + escapeHtml(destination.name) + '</b><small>' +
      escapeHtml(destination.country || '未填写国家') + ' · ' +
      (TRAVEL_STATUS[destination.status] || TRAVEL_STATUS.wishlist).label +
      '</small><button type="button" class="travel-popup-delete" data-delete-destination="' +
      destination.id + '">删除</button></div>'
    );
    marker.addTo(travelLayer);
  });
}

function openTravelPage() {
  if (typeof L === 'undefined') {
    const holder = document.querySelector('#travelMap');
    if (holder && !holder.dataset.failed) {
      holder.dataset.failed = 'true';
      holder.innerHTML = '<p class="travel-map-error">地图加载失败。请检查网络连接，然后刷新页面。</p>';
    }
    return;
  }
  if (!travelMap) {
    travelMap = L.map('travelMap', {
      minZoom: 2,
      scrollWheelZoom: false,
      worldCopyJump: true
    }).setView([22, 18], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(travelMap);
    travelLayer = L.layerGroup().addTo(travelMap);
  }
  renderTravelMarkers();
  renderTravelStats();
  setTimeout(() => travelMap.invalidateSize(), 60);
}

function openTravelDialog(query = '') {
  document.querySelector('#travelQuery').value = query;
  document.querySelector('#travelSearchStatus').textContent = '';
  document.querySelector('#travelStatusSelect').value = 'wishlist';
  document.querySelector('#saveTravelDestination').disabled = false;
  document.querySelector('#travelDialog').showModal();
  document.querySelector('#travelQuery').focus();
}

// 一步添加：输入地点 → 直接取第一个匹配结果保存，不再需要二次确认
async function addTravelDestination(event) {
  if (event) event.preventDefault();
  const input = document.querySelector('#travelQuery');
  const statusBox = document.querySelector('#travelSearchStatus');
  const addButton = document.querySelector('#saveTravelDestination');
  const term = input.value.trim();
  if (!term) { statusBox.textContent = '请先输入城市、国家或地区名称。'; input.focus(); return; }
  statusBox.textContent = '正在查找并添加…';
  addButton.disabled = true;
  try {
    const response = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=' + encodeURIComponent(term));
    if (!response.ok) throw new Error('geocode failed');
    const match = (await response.json())[0];
    const lat = match ? Number(match.lat) : NaN;
    const lon = match ? Number(match.lon) : NaN;
    if (!match || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      statusBox.textContent = '没有找到这个地点，换个写法试试。';
      addButton.disabled = false;
      return;
    }
    const name = (match.name || (match.display_name || '').split(',')[0] || term).trim();
    const country = (match.address && match.address.country) || '';
    const duplicate = travelDestinations.find(item =>
      (item.name.trim().toLowerCase() === name.toLowerCase() && (item.country || '').toLowerCase() === country.toLowerCase()) ||
      (Math.abs(item.lat - lat) < 0.01 && Math.abs(item.lon - lon) < 0.01));
    if (duplicate) {
      statusBox.textContent = '「' + name + '」已经在你的旅行地图里了。';
      addButton.disabled = false;
      return;
    }
    const statusValue = document.querySelector('#travelStatusSelect').value;
    const destination = {
      id: newId(),
      name,
      country,
      lat,
      lon,
      status: TRAVEL_STATUS[statusValue] ? statusValue : 'wishlist'
    };
    travelDestinations.push(destination);
    saveTravelDestinations();
    renderTravelStats();
    renderTravelMarkers();
    document.querySelector('#travelDialog').close();
    show('已添加 ' + name);
    if (travelMap) { travelMap.setView([lat, lon], 5); const marker = travelMarkers.get(destination.id); if (marker) marker.openPopup(); }
  } catch {
    statusBox.textContent = '查找失败，请检查网络后再试。';
    addButton.disabled = false;
  }
}

/* ---------- 景点 + 每个景点独立的照片相册 ----------
   景点资料存 localStorage；照片的二进制存 IndexedDB（容量比 localStorage 大得多）。
   每张照片都带 attractionId，只会在所属景点的相册里出现。 */
const ATTRACTIONS_KEY = 'atelier-travel-attractions';
const PHOTO_DB_NAME = 'atelier-travel-photos';
const PHOTO_STORE = 'photos';
let travelAttractions = loadAttractions();
let editingAttractionId = null;
let attractionDraftPhotos = [];
let attractionCoverId = null;
let loadedPhotoIds = [];
let photoViewerUrl = null;
let photoDBPromise = null;
let attractionSession = 0;

function loadAttractions() {
  try {
    const saved = JSON.parse(localStorage.getItem(ATTRACTIONS_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved
      .filter(item => item && typeof item.name === 'string' && typeof item.destinationId === 'string')
      .map(item => ({
        id: item.id || newId(),
        destinationId: item.destinationId,
        name: item.name,
        location: typeof item.location === 'string' ? item.location : '',
        description: typeof item.description === 'string' ? item.description : '',
        note: typeof item.note === 'string' ? item.note : '',
        coverPhotoId: item.coverPhotoId || null,
        createdAt: item.createdAt || new Date().toISOString()
      }));
  } catch { return []; }
}

function saveAttractions() {
  localStorage.setItem(ATTRACTIONS_KEY, JSON.stringify(travelAttractions));
}

function openPhotoDB() {
  if (photoDBPromise) return photoDBPromise;
  photoDBPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: 'id' }).createIndex('attractionId', 'attractionId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return photoDBPromise;
}

async function photoStore(mode) {
  const db = await openPhotoDB();
  return db.transaction(PHOTO_STORE, mode).objectStore(PHOTO_STORE);
}

function idbWait(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function photosForAttraction(attractionId) {
  try {
    const store = await photoStore('readonly');
    const all = await idbWait(store.index('attractionId').getAll(attractionId));
    return all.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  } catch { return []; }
}

async function putPhoto(record) {
  try { const store = await photoStore('readwrite'); await idbWait(store.put(record)); } catch (error) { console.error(error); }
}

async function deletePhotoRecord(id) {
  try { const store = await photoStore('readwrite'); await idbWait(store.delete(id)); } catch (error) { console.error(error); }
}

async function deletePhotosOfAttraction(attractionId) {
  const photos = await photosForAttraction(attractionId);
  for (const photo of photos) await deletePhotoRecord(photo.id);
}

// 压缩到最长边 1600px 的 JPEG，避免几张手机照片就占满空间
async function preparePhoto(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 900 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob || file;
  } catch { return file; }
}

function releaseDraftPhotos() {
  attractionDraftPhotos.forEach(photo => { if (photo.url) URL.revokeObjectURL(photo.url); });
  attractionDraftPhotos = [];
}

function renderAttractionGallery() {
  const gallery = document.querySelector('#attractionGallery');
  if (!gallery) return;
  if (!attractionDraftPhotos.length) {
    gallery.innerHTML = '<p class="attraction-gallery-empty">还没有照片。用上面的按钮从电脑里选几张吧。</p>';
    return;
  }
  gallery.innerHTML = attractionDraftPhotos.map(photo => {
    const url = escapeHtml(photo.url);
    const isCover = photo.id === attractionCoverId;
    return '<figure class="attraction-photo' + (isCover ? ' is-cover' : '') + '">' +
      '<button class="attraction-photo-open" type="button" data-view-photo="' + url + '" aria-label="查看大图"><img src="' + url + '" alt="" /></button>' +
      '<figcaption><button type="button" class="attraction-photo-cover" data-cover-photo="' + escapeHtml(photo.id) + '">' + (isCover ? '已设封面' : '设为封面') + '</button>' +
      '<button type="button" class="attraction-photo-remove" data-remove-photo="' + escapeHtml(photo.id) + '" aria-label="删除这张照片">删除</button></figcaption></figure>';
  }).join('');
}

function destinationOptions(selectedId) {
  return travelDestinations.map(destination => '<option value="' + escapeHtml(destination.id) + '"' +
    (destination.id === selectedId ? ' selected' : '') + '>' + escapeHtml(destination.name) +
    (destination.country ? ' · ' + escapeHtml(destination.country) : '') + '</option>').join('');
}

async function openAttractionDialog(attractionId = null, destinationId = null) {
  if (!travelDestinations.length) {
    show('请先添加一个旅行地点，再来添加景点');
    openTravelDialog();
    return;
  }
  editingAttractionId = attractionId;
  attractionSession += 1;
  const attraction = travelAttractions.find(item => item.id === attractionId);
  document.querySelector('#attractionDialogTitle').textContent = attraction ? '景点详情' : '添加景点';
  document.querySelector('#attractionDestination').innerHTML = destinationOptions(attraction ? attraction.destinationId : (destinationId || travelDestinations[0].id));
  document.querySelector('#attractionName').value = attraction ? attraction.name : '';
  document.querySelector('#attractionLocation').value = attraction ? attraction.location : '';
  document.querySelector('#attractionDescription').value = attraction ? attraction.description : '';
  document.querySelector('#attractionNote').value = attraction ? attraction.note : '';
  document.querySelector('#deleteAttraction').hidden = !attraction;
  document.querySelector('#attractionPhotos').value = '';
  releaseDraftPhotos();
  attractionCoverId = null;
  loadedPhotoIds = [];
  renderAttractionGallery();
  document.querySelector('#attractionDialog').showModal();
  document.querySelector('#attractionName').focus();
  if (!attraction) return;
  const photos = await photosForAttraction(attraction.id);
  loadedPhotoIds = photos.map(photo => photo.id);
  attractionDraftPhotos = photos.map(photo => ({ id: photo.id, blob: photo.blob, url: URL.createObjectURL(photo.blob), isNew: false }));
  attractionCoverId = attraction.coverPhotoId || photos[0]?.id || null;
  renderAttractionGallery();
}

async function saveAttraction(event) {
  event.preventDefault();
  const name = document.querySelector('#attractionName').value.trim() || '未命名景点';
  const destinationId = document.querySelector('#attractionDestination').value;
  if (!travelDestinations.some(item => item.id === destinationId)) { show('请先选择所属目的地'); return; }
  const existing = travelAttractions.find(item => item.id === editingAttractionId);
  const record = {
    id: existing ? existing.id : newId(),
    destinationId,
    name,
    location: document.querySelector('#attractionLocation').value.trim(),
    description: document.querySelector('#attractionDescription').value.trim(),
    note: document.querySelector('#attractionNote').value.trim(),
    coverPhotoId: attractionCoverId,
    createdAt: existing ? existing.createdAt : new Date().toISOString()
  };
  for (const id of loadedPhotoIds) if (!attractionDraftPhotos.some(photo => photo.id === id)) await deletePhotoRecord(id);
  for (const photo of attractionDraftPhotos) {
    if (photo.isNew) await putPhoto({ id: photo.id, attractionId: record.id, blob: photo.blob, name: 'photo', createdAt: new Date().toISOString() });
  }
  if (existing) travelAttractions = travelAttractions.map(item => (item.id === existing.id ? record : item));
  else travelAttractions.push(record);
  saveAttractions();
  forgetAttractionCover(record.id);
  loadedPhotoIds = attractionDraftPhotos.map(photo => photo.id);
  document.querySelector('#attractionDialog').close();
  releaseDraftPhotos();
  renderTravelStats();
  show(existing ? '景点已更新' : '已添加景点 ' + name);
}

async function removeAttraction(attractionId) {
  const attraction = travelAttractions.find(item => item.id === attractionId);
  if (!attraction || !confirm('删除景点「' + attraction.name + '」和它的所有照片？此操作无法撤销。')) return;
  await deletePhotosOfAttraction(attractionId);
  forgetAttractionCover(attractionId);
  travelAttractions = travelAttractions.filter(item => item.id !== attractionId);
  saveAttractions();
  renderTravelStats();
  show('已删除景点 ' + attraction.name);
}

// 删除目的地时，一并清理它下面的景点和照片
async function removeDestinationCascade(destinationId) {
  const attractions = travelAttractions.filter(item => item.destinationId === destinationId);
  for (const attraction of attractions) { await deletePhotosOfAttraction(attraction.id); forgetAttractionCover(attraction.id); }
  travelAttractions = travelAttractions.filter(item => item.destinationId !== destinationId);
  saveAttractions();
  travelTodos = travelTodos.filter(item => item.destinationId !== destinationId);
  saveTravelTodos();
}

document.querySelector('#addAttraction').addEventListener('click', () => openAttractionDialog());
document.querySelector('#attractionPhotos').addEventListener('change', async event => {
  const files = [...event.target.files].filter(file => /^image\/(jpeg|png|webp)$/.test(file.type));
  if (!files.length) return;
  const session = attractionSession;
  for (const file of files) {
    const blob = await preparePhoto(file);
    if (session !== attractionSession) return; // 中途取消了，丢弃还没处理完的照片
    attractionDraftPhotos.push({ id: newId(), blob, url: URL.createObjectURL(blob), isNew: true });
  }
  if (!attractionCoverId && attractionDraftPhotos.length) attractionCoverId = attractionDraftPhotos[0].id;
  event.target.value = '';
  renderAttractionGallery();
});
document.querySelector('#attractionGallery').addEventListener('click', event => {
  const remove = event.target.closest('[data-remove-photo]');
  if (remove) {
    const photo = attractionDraftPhotos.find(item => item.id === remove.dataset.removePhoto);
    if (photo && photo.url) URL.revokeObjectURL(photo.url);
    attractionDraftPhotos = attractionDraftPhotos.filter(item => item.id !== remove.dataset.removePhoto);
    if (attractionCoverId === remove.dataset.removePhoto) attractionCoverId = attractionDraftPhotos[0]?.id || null;
    renderAttractionGallery();
    return;
  }
  const cover = event.target.closest('[data-cover-photo]');
  if (cover) {
    attractionCoverId = cover.dataset.coverPhoto;
    renderAttractionGallery();
    return;
  }
  const view = event.target.closest('[data-view-photo]');
  if (view) {
    const dialog = document.querySelector('#photoViewer');
    if (photoViewerUrl) URL.revokeObjectURL(photoViewerUrl);
    photoViewerUrl = view.dataset.viewPhoto;
    document.querySelector('#photoViewerImage').src = photoViewerUrl;
    dialog.showModal();
  }
});
document.querySelector('#closePhotoViewer').addEventListener('click', () => document.querySelector('#photoViewer').close());
document.querySelector('#photoViewer').addEventListener('click', event => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
document.querySelector('#attractionForm').addEventListener('submit', saveAttraction);
document.querySelector('#attractionDialog').addEventListener('close', () => {
  attractionSession += 1; // Esc、点空白处、取消、保存：只要关闭就结束本次编辑
  releaseDraftPhotos();
});
document.querySelector('#deleteAttraction').addEventListener('click', async () => {
  if (!editingAttractionId) return;
  await removeAttraction(editingAttractionId);
  document.querySelector('#attractionDialog').close();
  releaseDraftPhotos();
});
['closeAttractionDialog', 'cancelAttraction'].forEach(id => {
  document.querySelector('#' + id).addEventListener('click', () => {
    document.querySelector('#attractionDialog').close();
    releaseDraftPhotos();
  });
});
document.querySelector('#attractionDialog').addEventListener('click', event => {
  if (event.target === event.currentTarget) {
    event.currentTarget.close();
    releaseDraftPhotos();
  }
});

document.querySelector('.travel-stats').addEventListener('change', event => {
  const toggle = event.target.closest('[data-todo-toggle]');
  if (!toggle) return;
  const todo = travelTodos.find(item => item.id === toggle.dataset.todoToggle);
  if (!todo) return;
  todo.done = toggle.checked;
  saveTravelTodos();
  renderTravelStats();
});
document.addEventListener('submit', event => {
  const form = event.target.closest('.travel-todo-form');
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector('input');
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  travelTodos.push({ id: newId(), destinationId: form.dataset.todoDestination, text, done: false, createdAt: new Date().toISOString() });
  saveTravelTodos();
  renderTravelStats();
  document.querySelector('.travel-todo-form[data-todo-destination="' + form.dataset.todoDestination + '"] input')?.focus();
});
document.querySelector('.travel-stats').addEventListener('keydown', event => {
  const input = event.target.closest('[data-todo-input]');
  if (!input) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    const todo = travelTodos.find(item => item.id === input.dataset.todoInput);
    const text = input.value.trim();
    if (todo && text) { todo.text = text; saveTravelTodos(); }
    editingTodoId = null;
    renderTravelStats();
  } else if (event.key === 'Escape') {
    editingTodoId = null;
    renderTravelStats();
  }
});
document.querySelector('.travel-stats').addEventListener('focusout', event => {
  const input = event.target.closest('[data-todo-input]');
  if (!input) return;
  const todo = travelTodos.find(item => item.id === input.dataset.todoInput);
  const text = input.value.trim();
  if (todo && text && text !== todo.text) { todo.text = text; saveTravelTodos(); }
  if (editingTodoId === input.dataset.todoInput) {
    editingTodoId = null;
    renderTravelStats();
  }
});

document.querySelector('#addDestination').addEventListener('click', () => openTravelDialog());
document.querySelector('#addDestinationEmpty').addEventListener('click', () => openTravelDialog());
document.querySelector('.travel-stats').addEventListener('click', event => {
  const todoEdit = event.target.closest('[data-todo-edit]');
  if (todoEdit) { editingTodoId = todoEdit.dataset.todoEdit; renderTravelStats(); document.querySelector('[data-todo-input]')?.focus(); return; }
  const todoDelete = event.target.closest('[data-todo-delete]');
  if (todoDelete) {
    travelTodos = travelTodos.filter(item => item.id !== todoDelete.dataset.todoDelete);
    if (editingTodoId === todoDelete.dataset.todoDelete) editingTodoId = null;
    saveTravelTodos();
    renderTravelStats();
    show('已删除待办');
    return;
  }
  const addAttraction = event.target.closest('[data-add-attraction]');
  if (addAttraction) { openAttractionDialog(null, addAttraction.dataset.addAttraction); return; }
  const openAttraction = event.target.closest('[data-open-attraction]');
  if (openAttraction) { openAttractionDialog(openAttraction.dataset.openAttraction); return; }
  const focus = event.target.closest('[data-focus-destination]');
  const place = focus && travelDestinations.find(item => item.id === focus.dataset.focusDestination);
  if (!place || !travelMap) return;
  travelMap.setView([place.lat, place.lon], 5);
  const marker = travelMarkers.get(place.id);
  if (marker) marker.openPopup();
  document.querySelector('#travelMap').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
document.querySelector('#travelForm').addEventListener('submit', addTravelDestination);
['closeTravelDialog', 'cancelTravelDialog'].forEach(id => {
  document.querySelector('#' + id).addEventListener('click', () => document.querySelector('#travelDialog').close());
});
document.querySelector('#travelDialog').addEventListener('click', event => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

document.addEventListener('click', event => {
  if (event.target.closest('#dashboardAddNote')) {
    currentFolderId = null;
    document.querySelector('.nav-item[data-page="notes"]').click();
    createNote();
    return;
  }

  const deleteDestination = event.target.closest('[data-delete-destination]');
  if (deleteDestination) {
    const id = deleteDestination.dataset.deleteDestination;
    const destination = travelDestinations.find(item => item.id === id);
    if (destination && confirm('删除「' + destination.name + '」？它下面的景点和照片也会一起删除，此操作无法撤销。')) {
      removeDestinationCascade(id).then(() => {
        renderTravelStats();
        if (travelMap) travelMap.closePopup();
      });
      travelDestinations = travelDestinations.filter(item => item.id !== id);
      saveTravelDestinations();
      renderTravelMarkers();
      show('已删除 ' + destination.name);
    }
    return;
  }

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
    if (nav.dataset.page === 'travel') openTravelPage();
    if (nav.dataset.page === 'focusmode') fmRender();
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

  if (event.target.id === 'addFolder') { openFolderDialog(); return; }
  if (event.target.id === 'addNote') {
    createNote();
    return;
  }
  if (event.target.closest('[data-notes-parent]')) {
    const folder = noteStore.folders.find(item => item.id === currentFolderId);
    currentFolderId = folder?.parentId || null;
    activeNoteId = null;
    renderNotes();
    return;
  }
  const openFolder = event.target.closest('[data-open-folder]');
  if (openFolder) { currentFolderId = openFolder.dataset.openFolder; activeNoteId = null; renderNotes(); return; }
  if (event.target.closest('[data-notes-root]')) { currentFolderId = null; activeNoteId = null; renderNotes(); return; }
  const openNote = event.target.closest('[data-open-note]');
  if (openNote) { activeNoteId = openNote.dataset.openNote; renderNotes(); return; }
  const editFolder = event.target.closest('[data-edit-folder]');
  if (editFolder) { openFolderDialog(editFolder.dataset.editFolder); return; }
});

document.querySelector('#folderForm').addEventListener('submit', event => {
  event.preventDefault(); const name = document.querySelector('#folderNameInput').value.trim(); if (!name) return;
  const icon = document.querySelector('#folderIconInput').value.trim() || '◫';
  const folder = noteStore.folders.find(item => item.id === editingFolderId);
  if (folder) { folder.name = name; folder.icon = icon; } else noteStore.folders.push({ id: newId(), parentId: currentFolderId, name, icon });
  saveNotes(); renderNotes(); document.querySelector('#folderDialog').close(); show('文件夹已保存');
});
document.querySelector('#deleteFolder').addEventListener('click', () => {
  if (!editingFolderId || !confirm('删除该文件夹及其中内容？此操作无法撤销。')) return;
  const ids = new Set([editingFolderId]); let changed = true;
  while (changed) { changed = false; noteStore.folders.forEach(folder => { if (ids.has(folder.parentId) && !ids.has(folder.id)) { ids.add(folder.id); changed = true; } }); }
  noteStore.folders = noteStore.folders.filter(folder => !ids.has(folder.id)); noteStore.notes = noteStore.notes.filter(note => !ids.has(note.folderId));
  currentFolderId = null; activeNoteId = null; saveNotes(); renderNotes(); document.querySelector('#folderDialog').close(); show('文件夹已删除');
});
['closeFolderDialog', 'cancelFolderDialog'].forEach(id => document.querySelector('#' + id).addEventListener('click', () => document.querySelector('#folderDialog').close()));
document.querySelector('#folderDialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.querySelector('#deleteNote').addEventListener('click', () => {
  if (!activeNoteId || !confirm('删除这篇笔记？此操作无法撤销。')) return;
  noteStore.notes = noteStore.notes.filter(note => note.id !== activeNoteId); activeNoteId = null; saveNotes(); renderNotes(); show('笔记已删除');
});
['noteTitle', 'noteBody'].forEach(id => document.querySelector('#' + id).addEventListener('input', event => {
  const note = noteStore.notes.find(item => item.id === activeNoteId); if (!note) return;
  if (id === 'noteTitle') note.title = event.target.value; else note.body = event.target.value; saveNotes();
  updateNoteListing(note);
}));

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

/* ---------- 任务页（参考设计的真实交互） ---------- */
let taskFilter = 'all';
let taskSortMode = 'due';
const taskGroupsCollapsed = { today: false, week: false, later: false };

function taskTodayKey() { return toDateKey(new Date()); }
function taskWeekRange() {
  const now = new Date();
  const offset = (now.getDay() + 6) % 7; // 周一为一周的开始
  const start = new Date(now);
  start.setDate(now.getDate() - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toDateKey(start), end: toDateKey(end) };
}
// 今天（含已过期）、本周、之后；没有截止日期的算“之后”
function taskBucket(task) {
  if (!task.dueDate) return 'later';
  const today = taskTodayKey();
  if (task.dueDate <= today) return 'today';
  if (task.dueDate <= taskWeekRange().end) return 'week';
  return 'later';
}
function taskMatchesFilter(task) {
  if (taskFilter === 'all') return true;
  if (taskFilter === 'high') return task.priority === 'HIGH';
  if (taskFilter.startsWith('cat:')) return task.category === taskFilter.slice(4);
  return true;
}
function taskViewComparator() {
  if (taskSortMode === 'priority') return compareTasks;
  return (a, b) => {
    const dueA = a.dueDate || '9999-99-99';
    const dueB = b.dueDate || '9999-99-99';
    if (dueA !== dueB) return dueA < dueB ? -1 : 1;
    const rank = (TASK_PRIORITY_RANK[a.priority] ?? 3) - (TASK_PRIORITY_RANK[b.priority] ?? 3);
    if (rank) return rank;
    return (a.seq ?? 0) - (b.seq ?? 0);
  };
}

function taskCategoryBadge(task) {
  if (!task.category) return '';
  return '<button type="button" class="task-priority ' + (TASK_CATEGORY_CLASS[task.category] || '') + '" data-edit-task aria-label="编辑“' + escapeHtml(task.title) + '”的分类">' + task.category + '</button>';
}
function taskRowMarkup(task) {
  return '<article class="tk-row' + (task.completed ? ' done' : '') + '" data-task-id="' + escapeHtml(task.id) + '">' +
    '<label class="task-check"><input type="checkbox" data-task-toggle ' + (task.completed ? 'checked' : '') + ' aria-label="标记“' + escapeHtml(task.title) + '”完成"><span></span></label>' +
    '<button class="tk-row-title" type="button" data-edit-task>' + escapeHtml(task.title) + '</button>' +
    '<div class="task-badges"><button type="button" class="task-priority priority-' + task.priority.toLowerCase() + '" data-edit-task aria-label="编辑“' + escapeHtml(task.title) + '”的优先级">' + task.priority + '</button>' + taskCategoryBadge(task) + '</div>' +
    '</article>';
}

function renderTasksPage() {
  const list = document.getElementById('tasksPageList');
  const doneEl = document.getElementById('tkDone');
  if (!list || !doneEl) return; // 页面结构还没解析完时先跳过，DOM 就绪后会重画
  const today = taskTodayKey();
  const { start, end } = taskWeekRange();
  const undone = tasks.filter(task => !task.completed);
  document.getElementById('tkDone').textContent = String(tasks.length - undone.length);
  document.getElementById('tkDoing').textContent = String(undone.filter(task => !task.dueDate || task.dueDate <= today).length);
  document.getElementById('tkLater').textContent = String(undone.filter(task => task.dueDate && task.dueDate > today).length);

  // 分类筛选标签
  const tabs = [{ id: 'all', label: '全部', count: tasks.length }, { id: 'high', label: '高优先级', count: tasks.filter(task => task.priority === 'HIGH').length }];
  Object.keys(TASK_CATEGORIES).forEach(key => {
    const count = tasks.filter(task => task.category === key).length;
    if (count) tabs.push({ id: 'cat:' + key, label: TASK_CATEGORIES[key], count });
  });
  if (!tabs.some(tab => tab.id === taskFilter)) taskFilter = 'all';
  document.getElementById('tkTabs').innerHTML = tabs.map(tab =>
    '<button type="button" role="tab" class="tk-tab' + (taskFilter === tab.id ? ' is-active' : '') + '" aria-selected="' + (taskFilter === tab.id) + '" data-tk-filter="' + tab.id + '">' +
    escapeHtml(tab.label) + '<em>' + tab.count + '</em></button>').join('');

  // 分组 + 排序
  const groups = { today: [], week: [], later: [] };
  tasks.filter(taskMatchesFilter).forEach(task => groups[taskBucket(task)].push(task));
  const comparator = taskViewComparator();
  const labels = { today: '今天', week: '本周', later: '之后' };
  const sections = Object.keys(groups).map(key => {
    const items = [...groups[key]].sort(comparator);
    if (!items.length) return '';
    const collapsed = taskGroupsCollapsed[key];
    return '<section class="tk-group' + (collapsed ? ' is-collapsed' : '') + '">' +
      '<button type="button" class="tk-group-head" data-tk-group="' + key + '" aria-expanded="' + !collapsed + '">' +
      '<span class="tk-chevron" aria-hidden="true">⌄</span>' + labels[key] + '<em>' + items.length + '</em></button>' +
      '<div class="tk-group-body">' + items.map(taskRowMarkup).join('') + '</div></section>';
  }).join('');
  list.innerHTML = sections || '<p class="tasks-empty">' + (tasks.length ? '这个筛选下没有任务。' : '还没有任务。点击「新建任务」开始吧。') + '</p>';

  // 本周进度（按截止日期落在本周的任务计算）
  const weekTasks = tasks.filter(task => task.dueDate && task.dueDate >= start && task.dueDate <= end);
  const weekDone = weekTasks.filter(task => task.completed).length;
  const percent = weekTasks.length ? Math.round((weekDone / weekTasks.length) * 100) : 0;
  document.getElementById('tkWeekCount').textContent = weekDone + ' / ' + weekTasks.length;
  document.getElementById('tkWeekBar').style.width = percent + '%';
  document.getElementById('tkWeekPercent').textContent = percent + '%';
  document.getElementById('tkWeekHint').textContent = weekTasks.length ? '本周任务的完成情况' : '本周还没有安排任务';

  // 今日重点：直接复用任务数据里的 focus 标记
  const focusTasks = tasks.filter(task => task.focus);
  document.getElementById('tkFocusList').innerHTML = focusTasks.length
    ? focusTasks.map(task => '<div class="tk-focus-row' + (task.completed ? ' done' : '') + '" data-task-id="' + escapeHtml(task.id) + '">' +
      '<label class="task-check"><input type="checkbox" data-task-toggle ' + (task.completed ? 'checked' : '') + ' aria-label="标记“' + escapeHtml(task.title) + '”完成"><span></span></label>' +
      '<button type="button" class="tk-focus-title" data-edit-task>' + escapeHtml(task.title) + '</button>' +
      '<div class="task-badges"><button type="button" class="task-priority priority-' + task.priority.toLowerCase() + '" data-edit-task>' + task.priority + '</button>' + taskCategoryBadge(task) + '</div></div>').join('')
    : '<p class="tk-focus-empty">还没有选择重点任务。点下面的按钮，从已有任务里挑。</p>';

  // 任务统计
  document.getElementById('tkWeekTotal').textContent = String(weekTasks.length);
  document.getElementById('tkWeekDone').textContent = String(weekDone);
  document.getElementById('tkComplRate').textContent = percent + '%';
}

/* 今日重点：只会给已有任务打上/取消 focus 标记 */
function openTaskPicker() {
  const body = document.getElementById('taskPickerList');
  const list = [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed));
  body.innerHTML = list.length
    ? list.map(task => '<label class="task-picker-item"><input type="checkbox" data-picker-task="' + escapeHtml(task.id) + '"' + (task.focus ? ' checked' : '') + ' /><span>' + escapeHtml(task.title) + '</span><small>' + task.priority + (task.completed ? ' · 已完成' : '') + '</small></label>').join('')
    : '<p class="tasks-empty">还没有任务，先去新建一个吧。</p>';
  document.getElementById('taskPickerDialog').showModal();
}
function openTaskStats() {
  const { start, end } = taskWeekRange();
  const weekTasks = tasks.filter(task => task.dueDate && task.dueDate >= start && task.dueDate <= end);
  const done = tasks.filter(task => task.completed).length;
  const cell = (label, value, note) => '<div class="tk-stat"><small>' + label + '</small><b>' + value + '</b><span>' + note + '</span></div>';
  document.getElementById('taskStatsBody').innerHTML =
    cell('本周任务', weekTasks.length, start + ' 至 ' + end) +
    cell('本周已完成', weekTasks.filter(task => task.completed).length, '按截止日期统计') +
    cell('全部任务', tasks.length, done + ' 个已完成') +
    cell('未完成', tasks.length - done, '含已过期与未安排日期') +
    cell('今日重点', tasks.filter(task => task.focus).length, '从已有任务中选择');
  document.getElementById('taskStatsDialog').showModal();
}

/* 等页面结构解析完成再绑定；否则最后几个元素可能还查不到 */
function initTasksPageDom() {
  document.getElementById('tkTabs').addEventListener('click', event => {
    const tab = event.target.closest('[data-tk-filter]');
    if (!tab) return;
    taskFilter = tab.dataset.tkFilter;
    renderTasksPage();
  });
  document.getElementById('tkSort').addEventListener('change', event => {
    taskSortMode = event.target.value === 'priority' ? 'priority' : 'due';
    renderTasksPage();
  });
  document.getElementById('tasksPageList').addEventListener('click', event => {
    const head = event.target.closest('[data-tk-group]');
    if (!head) return;
    const key = head.dataset.tkGroup;
    taskGroupsCollapsed[key] = !taskGroupsCollapsed[key];
    renderTasksPage();
  });
  document.getElementById('tkFocusEdit').addEventListener('click', openTaskPicker);
  document.getElementById('taskPickerList').addEventListener('change', event => {
    const picker = event.target.closest('[data-picker-task]');
    if (!picker) return;
    const task = tasks.find(item => item.id === picker.dataset.pickerTask);
    if (!task) return;
    task.focus = picker.checked;
    saveTasks();
    renderTasks();
  });
  ['taskPickerClose', 'taskPickerDone'].forEach(id => document.querySelector('#' + id).addEventListener('click', () => document.getElementById('taskPickerDialog').close()));
  // 这个按钮用 #id 选择器在部分 Chromium 上会查不到（解析期索引问题），改用属性选择器更稳
  // 「查看详情」用事件委托挂在任务页容器上，避免依赖单个元素的 id 查找
  document.querySelector('.tasks-page').addEventListener('click', event => {
    if (event.target.closest('[data-open-task-stats]')) openTaskStats();
  });
  document.getElementById('taskStatsClose').addEventListener('click', () => document.getElementById('taskStatsDialog').close());
  ['taskPickerDialog', 'taskStatsDialog'].forEach(id => document.querySelector('#' + id).addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  }));
  renderTasksPage();
}
// 浏览器解析完页面后，最后几个元素的 id 索引要等 load 才稳定，所以放到 load 再绑定
if (document.readyState === 'complete') initTasksPageDom();
else window.addEventListener('load', initTasksPageDom, { once: true });

document.querySelector('#taskForm').addEventListener('submit', event => {
  event.preventDefault();
  const title = document.querySelector('#taskTitleInput').value.trim();
  if (!title) {
    document.querySelector('#taskTitleInput').focus();
    return;
  }
  const priority = document.querySelector('#taskPriorityInput').value;
  const category = document.querySelector('#taskCategoryInput').value;
  const dueDate = document.querySelector('#taskDueInput').value;
  const existing = tasks.find(task => task.id === editingTaskId);
  if (existing) {
    existing.title = title;
    existing.priority = priority;
    existing.category = category;
    existing.dueDate = dueDate;
  } else {
    tasks.push({ id: newId(), title, priority, category, dueDate, completed: false, focus: false, seq: Math.max(-1, ...tasks.map(task => task.seq)) + 1 });
  }
  saveTasks();
  renderTasks();
  document.querySelector('#taskDialog').close();
  show(existing ? '任务已更新' : '任务已创建');
});

document.querySelector('#deleteTask').addEventListener('click', () => {
  if (!editingTaskId) return;
  const target = tasks.find(task => task.id === editingTaskId);
  if (target && !confirm('删除任务「' + target.title + '」？此操作无法撤销。')) return;
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

/* 今日重点：标题、描述可直接编辑，进度可拖动，都会自动保存 */
const FOCUS_KEY = 'atelier-focus';
function readFocus() {
  try {
    const saved = JSON.parse(localStorage.getItem(FOCUS_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return null;
    return {
      title: typeof saved.title === 'string' ? saved.title : '',
      desc: typeof saved.desc === 'string' ? saved.desc : '',
      progress: Math.min(100, Math.max(0, Math.round(Number(saved.progress)) || 0))
    };
  } catch {
    return null;
  }
}
function setFocusProgress(value) {
  const amount = Math.min(100, Math.max(0, Math.round(Number(value)) || 0));
  document.querySelector('#focusProgress').value = String(amount);
  document.querySelector('#focusProgressBar').style.width = amount + '%';
  document.querySelector('#focusProgressLabel').textContent = amount + '% 完成';
}
function saveFocus() {
  localStorage.setItem(FOCUS_KEY, JSON.stringify({
    title: document.querySelector('#focusTitle').textContent.trim(),
    desc: document.querySelector('#focusDesc').textContent.trim(),
    progress: Number(document.querySelector('#focusProgress').value)
  }));
}
function applyFocus() {
  const saved = readFocus();
  if (saved) {
    document.querySelector('#focusTitle').textContent = saved.title;
    document.querySelector('#focusDesc').textContent = saved.desc;
  }
  setFocusProgress(saved ? saved.progress : document.querySelector('#focusProgress').value);
}
['focusTitle', 'focusDesc'].forEach(id => document.querySelector('#' + id).addEventListener('input', saveFocus));
document.querySelector('#focusProgress').addEventListener('input', event => {
  setFocusProgress(event.target.value);
  saveFocus();
});
applyFocus();

/* ---------- 专注模式 ----------
   计时器用“结束时间戳”计算剩余时间：切到别的页面、浏览器后台降频、刷新页面都不会走偏。
   只有完整走完的专注才会写入记录；暂停不算时间；重置会放弃本次，不计入统计。
   记录/设置/计时器状态都存在 localStorage；成就由记录数量实时计算。 */
const FM_SESSIONS_KEY = 'atelier-focus-sessions';
const FM_TIMER_KEY = 'atelier-focus-timer';
const FM_SETTINGS_KEY = 'atelier-focus-settings';
const FM_MODES = { pomodoro: { label: 'Pomodoro', minutes: 25 }, deep: { label: 'Deep Work', minutes: 50 }, custom: { label: 'Custom', minutes: 30 } };
const FM_RING = 2 * Math.PI * 140;
const FM_ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill="currentColor"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4.2L16.3 4.5a2.1 2.1 0 013 3L8 18.8zM14.5 6.3l3.2 3.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  plant: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21v-8" stroke="#6E9A6C" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M12 13c0-4-3-6.5-7.5-6.5C4.5 10.5 7 13 12 13zM12 15c0-3.4 2.4-5.8 7-5.8 0 3.6-2.4 5.8-7 5.8z" fill="#7FAE7C"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.6 6.4 19.8l1.3-6.2L3 9.3l6.3-.7z" fill="#EFB94A"/></svg>',
  crown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5l4.6 4 4.4-7 4.4 7 4.6-4L19.5 19h-15z" fill="#EDB547"/><rect x="4.5" y="19.5" width="15" height="1.8" rx=".9" fill="#E3A63A"/></svg>',
  botanical: '<svg viewBox="0 0 120 150" aria-hidden="true"><g fill="none" stroke="#B88F98" stroke-width="1.4" stroke-linecap="round"><path d="M62 148C60 112 66 84 80 52"/><path d="M62 120C48 112 38 100 34 84"/><path d="M64 100C80 92 92 80 96 64"/><path d="M70 78C60 68 52 58 50 44"/><path d="M76 62C88 56 98 46 102 32"/></g><g fill="#D8B2BA" opacity=".85"><circle cx="80" cy="50" r="5"/><circle cx="74" cy="44" r="4"/><circle cx="86" cy="42" r="4.5"/><circle cx="102" cy="30" r="5"/><circle cx="96" cy="24" r="3.6"/><circle cx="108" cy="26" r="3.6"/><circle cx="50" cy="42" r="4.6"/><circle cx="44" cy="48" r="3.6"/><circle cx="34" cy="82" r="4.2"/><circle cx="96" cy="62" r="4.4"/><circle cx="90" cy="68" r="3.4"/></g><g fill="#C9A4AB" opacity=".7"><ellipse cx="42" cy="104" rx="7" ry="3.6" transform="rotate(-35 42 104)"/><ellipse cx="86" cy="104" rx="7" ry="3.6" transform="rotate(30 86 104)"/><ellipse cx="54" cy="130" rx="6" ry="3.2" transform="rotate(-30 54 130)"/></g></svg>'
};
const FM_ACHIEVEMENTS = [
  { id: 'beginner', name: 'Beginner', need: 1, icon: 'plant', tone: 'green' },
  { id: 'consistent', name: 'Consistent', need: 5, icon: 'star', tone: 'yellow' },
  { id: 'master', name: 'Focus Master', need: 25, icon: 'crown', tone: 'beige' }
];

function fmReadJson(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return value === null || value === undefined ? fallback : value; } catch { return fallback; }
}
function fmClampMinutes(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 1 && number <= 240 ? number : fallback;
}
function loadFmSessions() {
  const saved = fmReadJson(FM_SESSIONS_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter(item => item && typeof item === 'object' && Number.isFinite(Date.parse(item.completedAt)) && Number(item.actualSec) > 0)
    .map(item => ({
      id: item.id || newId(),
      taskId: typeof item.taskId === 'string' ? item.taskId : null,
      taskTitle: typeof item.taskTitle === 'string' ? item.taskTitle : '',
      mode: FM_MODES[item.mode] ? item.mode : 'custom',
      plannedMin: Number(item.plannedMin) || Math.round(Number(item.actualSec) / 60),
      actualSec: Math.round(Number(item.actualSec)),
      startedAt: typeof item.startedAt === 'string' ? item.startedAt : item.completedAt,
      completedAt: item.completedAt
    }));
}
function loadFmSettings() {
  const saved = fmReadJson(FM_SETTINGS_KEY, {});
  return {
    mode: saved && FM_MODES[saved.mode] ? saved.mode : 'pomodoro',
    customMin: fmClampMinutes(saved && saved.customMin, 30),
    taskId: saved && typeof saved.taskId === 'string' ? saved.taskId : null
  };
}
function loadFmTimer() {
  const idle = { status: 'idle', durationSec: 0, endsAt: null, remainingSec: 0, taskId: null, taskTitle: '', mode: 'pomodoro', startedAt: null };
  const saved = fmReadJson(FM_TIMER_KEY, null);
  if (!saved || typeof saved !== 'object') return idle;
  const duration = Math.round(Number(saved.durationSec));
  if (!(duration > 0)) return idle;
  const base = { ...idle, durationSec: duration, taskId: typeof saved.taskId === 'string' ? saved.taskId : null, taskTitle: typeof saved.taskTitle === 'string' ? saved.taskTitle : '', mode: FM_MODES[saved.mode] ? saved.mode : 'custom', startedAt: typeof saved.startedAt === 'string' ? saved.startedAt : null };
  if (saved.status === 'running' && Number.isFinite(Number(saved.endsAt))) return { ...base, status: 'running', endsAt: Number(saved.endsAt) };
  if (saved.status === 'paused' && Number(saved.remainingSec) > 0) return { ...base, status: 'paused', remainingSec: Math.min(duration, Math.round(Number(saved.remainingSec))) };
  return idle;
}

let fmSessions = loadFmSessions();
let fmSettings = loadFmSettings();
let fmTimer = loadFmTimer();

function fmSave() {
  localStorage.setItem(FM_SESSIONS_KEY, JSON.stringify(fmSessions));
  localStorage.setItem(FM_SETTINGS_KEY, JSON.stringify(fmSettings));
  localStorage.setItem(FM_TIMER_KEY, JSON.stringify(fmTimer));
}
function fmMinutes() { return fmSettings.mode === 'custom' ? fmSettings.customMin : FM_MODES[fmSettings.mode].minutes; }
function fmActive() { return fmTimer.status !== 'idle'; }
function fmDuration() { return fmActive() ? fmTimer.durationSec : fmMinutes() * 60; }
function fmRemaining(now = Date.now()) {
  if (fmTimer.status === 'running') return Math.max(0, Math.ceil((fmTimer.endsAt - now) / 1000));
  if (fmTimer.status === 'paused') return fmTimer.remainingSec;
  return fmMinutes() * 60;
}
function fmClock(seconds) {
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}
function fmFormatTotal(seconds) {
  if (seconds <= 0) return '0';
  if (seconds < 3600) return Math.max(1, Math.round(seconds / 60)) + 'm';
  return (+(seconds / 3600).toFixed(1)) + 'h';
}
function fmDayKey(iso) { return toDateKey(new Date(iso)); }
function fmCurrentTask() {
  return tasks.find(item => item.id === fmSettings.taskId) || tasks.find(item => !item.completed) || null;
}

function fmStart() {
  const task = fmCurrentTask();
  const duration = fmMinutes() * 60;
  fmTimer = { status: 'running', durationSec: duration, endsAt: Date.now() + duration * 1000, remainingSec: 0, taskId: task ? task.id : null, taskTitle: task ? task.title : '', mode: fmSettings.mode, startedAt: new Date().toISOString() };
  fmSave();
  fmRender();
}
function fmPause() {
  fmTimer = { ...fmTimer, status: 'paused', remainingSec: Math.max(1, fmRemaining()), endsAt: null };
  fmSave();
  fmRender();
}
function fmResume() {
  fmTimer = { ...fmTimer, status: 'running', endsAt: Date.now() + fmTimer.remainingSec * 1000, remainingSec: 0 };
  fmSave();
  fmRender();
}
function fmReset() {
  if (fmActive() && !confirm('重置会放弃本次专注，不会计入统计。确定吗？')) return;
  fmTimer = loadFmTimerIdle();
  fmSave();
  fmRender();
}
function loadFmTimerIdle() {
  return { status: 'idle', durationSec: 0, endsAt: null, remainingSec: 0, taskId: null, taskTitle: '', mode: 'pomodoro', startedAt: null };
}
// 完整走完才记录；completedAt 取计时器本来的结束时刻（页面关着时结束也能正确记入当天）
function fmComplete() {
  const finishedAt = new Date(fmTimer.endsAt || Date.now()).toISOString();
  const task = tasks.find(item => item.id === fmTimer.taskId);
  fmSessions.push({ id: newId(), taskId: fmTimer.taskId, taskTitle: task ? task.title : fmTimer.taskTitle, mode: fmTimer.mode, plannedMin: Math.round(fmTimer.durationSec / 60), actualSec: fmTimer.durationSec, startedAt: fmTimer.startedAt || finishedAt, completedAt: finishedAt });
  const before = fmSessions.length - 1;
  fmTimer = loadFmTimerIdle();
  fmSave();
  const unlocked = FM_ACHIEVEMENTS.find(item => item.need === fmSessions.length && before < item.need);
  show(unlocked ? '专注完成！解锁成就「' + unlocked.name + '」' : '专注完成！已记录到 Focus History');
  fmRender();
}
function fmTick() {
  if (fmTimer.status === 'running' && Date.now() >= fmTimer.endsAt) { fmComplete(); return; }
  if (fmTimer.status === 'running') fmRenderTimer();
}

function fmRenderTimer() {
  const total = fmDuration();
  const left = fmRemaining();
  const fraction = total > 0 ? Math.min(1, left / total) : 1;
  const bar = document.querySelector('#fmRingBar');
  const dot = document.querySelector('#fmRingDot');
  document.querySelector('#fmTime').textContent = fmClock(left);
  bar.style.strokeDasharray = String(FM_RING);
  bar.style.strokeDashoffset = String(FM_RING * (1 - fraction));
  const angle = fraction * 2 * Math.PI;
  dot.setAttribute('cx', (160 + 140 * Math.sin(angle)).toFixed(2));
  dot.setAttribute('cy', (160 - 140 * Math.cos(angle)).toFixed(2));
  const start = document.querySelector('#fmStart');
  const label = fmTimer.status === 'running' ? 'Pause' : fmTimer.status === 'paused' ? 'Resume' : 'Start Focus';
  const icon = fmTimer.status === 'running' ? FM_ICONS.pause : FM_ICONS.play;
  const markup = '<span class="fm-ico">' + icon + '</span>' + label;
  if (start.dataset.state !== fmTimer.status) { start.innerHTML = markup; start.dataset.state = fmTimer.status; }
  document.querySelector('#fmReset').hidden = !fmActive();
  document.querySelector('#fmRingDot').style.display = left > 0 ? '' : 'none';
  document.querySelectorAll('[data-fm-mode]').forEach(pill => {
    const selected = pill.dataset.fmMode === fmSettings.mode;
    pill.classList.toggle('is-selected', selected);
    pill.setAttribute('aria-checked', String(selected));
    pill.classList.toggle('is-locked', fmActive());
  });
  document.querySelector('#fmLockHint').hidden = !fmActive();
  const input = document.querySelector('#fmCustomInput');
  input.disabled = fmActive();
  if (document.activeElement !== input) input.value = String(fmSettings.customMin);
  document.querySelector('#fmCustomSmall').textContent = 'Set Time';
  const badge = document.querySelector('#fmNavBadge');
  badge.hidden = !fmActive();
  badge.textContent = fmActive() ? fmClock(left) : '';
}

function fmRenderTask() {
  const box = document.querySelector('#fmTaskCard');
  if (!box) return;
  const task = fmCurrentTask();
  const title = '<h2 class="fm-card-title"><span class="fm-ico fm-spark">' + FM_ICONS.sparkle + '</span>Current Task</h2>';
  const row = task
    ? '<div class="fm-task-box' + (task.completed ? ' is-done' : '') + '"><button type="button" class="fm-task-check" data-fm-toggle-task aria-pressed="' + task.completed + '" aria-label="' + (task.completed ? '取消完成：' : '标记完成：') + escapeHtml(task.title) + '"></button><span class="fm-task-name">' + escapeHtml(task.title) + '</span><button type="button" class="fm-edit" data-fm-edit aria-label="更换任务和专注时长"><span class="fm-ico">' + FM_ICONS.pencil + '</span></button></div>'
    : '<div class="fm-task-box fm-task-empty"><span class="fm-task-name">还没有任务可以选择</span><button type="button" class="fm-pill-btn" data-add-task>＋ 新建任务</button></div>';
  box.innerHTML = title + row +
    '<button type="button" class="fm-time-row" data-fm-edit><span class="fm-ico">' + FM_ICONS.clock + '</span>Time: ' + fmMinutes() + ' min</button>' +
    '<div class="fm-quote"><p>“Small steps lead to big changes.”</p><span class="fm-botanical">' + FM_ICONS.botanical + '</span></div>';
}

function fmRenderHistory() {
  const totals = new Map();
  fmSessions.forEach(item => totals.set(fmDayKey(item.completedAt), (totals.get(fmDayKey(item.completedAt)) || 0) + item.actualSec));
  const days = [];
  for (let offset = 4; offset >= 0; offset -= 1) {
    const day = new Date();
    day.setDate(day.getDate() - offset);
    days.push({ key: toDateKey(day), date: day, today: offset === 0 });
  }
  const peak = Math.max(3 * 3600, ...days.map(day => totals.get(day.key) || 0));
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
  document.querySelector('#fmDays').innerHTML = days.map(day => {
    const seconds = totals.get(day.key) || 0;
    const percent = seconds ? Math.max(6, Math.round((seconds / peak) * 100)) : 0;
    const label = String(day.date.getMonth() + 1).padStart(2, '0') + '/' + String(day.date.getDate()).padStart(2, '0');
    return '<div class="fm-day' + (day.today ? ' is-today' : '') + '"><div class="fm-day-bar" role="img" aria-label="' + label + ' 专注 ' + fmFormatTotal(seconds) + '"><span style="height:' + percent + '%"></span></div><b>' + weekday.format(day.date) + '</b><small>' + label + '</small><strong>' + fmFormatTotal(seconds) + '</strong></div>';
  }).join('');
}

function fmRenderAchievements() {
  const count = fmSessions.length;
  document.querySelector('#fmBadges').innerHTML = FM_ACHIEVEMENTS.map(item => {
    const unlocked = count >= item.need;
    return '<div class="fm-badge' + (unlocked ? ' is-unlocked' : ' is-locked') + '" title="' + (unlocked ? '已解锁' : '进度 ' + count + '/' + item.need) + '"><span class="fm-badge-icon tone-' + item.tone + '">' + FM_ICONS[item.icon] + '</span><b>' + item.name + '</b><small>' + item.need + (item.need === 1 ? ' session' : ' sessions') + '</small>' +
      (unlocked ? '' : '<em>' + count + '/' + item.need + '</em>') + '</div>';
  }).join('');
}

function fmRender() {
  fmRenderTimer();
  fmRenderTask();
  fmRenderHistory();
  fmRenderAchievements();
}

/* ----- 弹窗：任务与时长 / 统计 / 全部记录 / 全部成就 ----- */
function fmOpenTaskDialog() {
  if (fmActive()) { show('专注进行中，结束或重置后才能更换任务和时长'); return; }
  const current = fmCurrentTask();
  const ordered = [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed));
  const select = document.querySelector('#fmTaskSelect');
  select.innerHTML = ordered.length
    ? ordered.map(item => '<option value="' + escapeHtml(item.id) + '"' + (current && item.id === current.id ? ' selected' : '') + '>' + escapeHtml(item.title) + (item.completed ? '（已完成）' : '') + '</option>').join('')
    : '<option value="">还没有任务，先去「任务」页新建一个</option>';
  select.disabled = !ordered.length;
  document.querySelector('#fmTaskMinutes').value = String(fmMinutes());
  document.querySelector('#fmTaskError').hidden = true;
  document.querySelector('#fmTaskDialog').showModal();
  document.querySelector('#fmTaskMinutes').focus();
}
function fmSaveTaskDialog(event) {
  event.preventDefault();
  const minutes = fmClampMinutes(document.querySelector('#fmTaskMinutes').value, 0);
  if (!minutes) { document.querySelector('#fmTaskError').hidden = false; return; }
  const selected = document.querySelector('#fmTaskSelect').value;
  if (selected) fmSettings.taskId = selected;
  if (minutes === 25) fmSettings.mode = 'pomodoro';
  else if (minutes === 50) fmSettings.mode = 'deep';
  else { fmSettings.mode = 'custom'; fmSettings.customMin = minutes; }
  fmSave();
  fmRender();
  document.querySelector('#fmTaskDialog').close();
  show('已更新当前任务和专注时长');
}
function fmDayLabel(key) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(dateFromKey(key));
}
function fmStreak() {
  const days = new Set(fmSessions.map(item => fmDayKey(item.completedAt)));
  const day = new Date();
  if (!days.has(toDateKey(day))) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (days.has(toDateKey(day))) { streak += 1; day.setDate(day.getDate() - 1); }
  return streak;
}
function fmOpenInfo(kind) {
  const title = document.querySelector('#fmInfoTitle');
  const eyebrow = document.querySelector('#fmInfoEyebrow');
  const body = document.querySelector('#fmInfoBody');
  const sum = list => list.reduce((all, item) => all + item.actualSec, 0);
  if (kind === 'stats') {
    const today = toDateKey(new Date());
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
    const todayList = fmSessions.filter(item => fmDayKey(item.completedAt) === today);
    const weekList = fmSessions.filter(item => new Date(item.completedAt) >= weekStart);
    eyebrow.textContent = 'FOCUS STATS'; title.textContent = 'Focus Stats';
    const cell = (label, value, note) => '<div class="fm-stat"><small>' + label + '</small><b>' + value + '</b><span>' + note + '</span></div>';
    body.innerHTML = '<div class="fm-stat-grid">' +
      cell('Today', fmFormatTotal(sum(todayList)), todayList.length + ' sessions') +
      cell('Last 7 days', fmFormatTotal(sum(weekList)), weekList.length + ' sessions') +
      cell('All time', fmFormatTotal(sum(fmSessions)), fmSessions.length + ' sessions') +
      cell('Streak', fmStreak() + (fmStreak() === 1 ? ' day' : ' days'), '连续有专注记录的天数') + '</div>';
  } else if (kind === 'history') {
    eyebrow.textContent = 'FOCUS HISTORY'; title.textContent = 'All Focus History';
    if (!fmSessions.length) { body.innerHTML = '<p class="fm-info-empty">还没有完成的专注记录。完整完成一次专注后会出现在这里。</p>'; }
    else {
      const groups = new Map();
      [...fmSessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).forEach(item => {
        const key = fmDayKey(item.completedAt);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });
      body.innerHTML = [...groups.entries()].map(([key, list]) =>
        '<section class="fm-group"><header><b>' + fmDayLabel(key) + '</b><span>' + fmFormatTotal(sum(list)) + ' · ' + list.length + ' sessions</span></header>' +
        list.map(item => {
          const time = new Date(item.completedAt);
          return '<div class="fm-row"><time>' + String(time.getHours()).padStart(2, '0') + ':' + String(time.getMinutes()).padStart(2, '0') + '</time><span>' + escapeHtml(item.taskTitle || '未选择任务') + '</span><small>' + FM_MODES[item.mode].label + ' · ' + Math.round(item.actualSec / 60) + ' min</small></div>';
        }).join('') + '</section>').join('');
    }
  } else {
    eyebrow.textContent = 'FOCUS ACHIEVEMENTS'; title.textContent = 'All Achievements';
    body.innerHTML = FM_ACHIEVEMENTS.map(item => {
      const done = Math.min(item.need, fmSessions.length);
      return '<div class="fm-ach-row' + (done >= item.need ? ' is-unlocked' : '') + '"><span class="fm-badge-icon tone-' + item.tone + '">' + FM_ICONS[item.icon] + '</span><div><b>' + item.name + '</b><small>完成 ' + item.need + ' 次完整专注' + (done >= item.need ? ' · 已解锁' : '') + '</small><div class="fm-ach-bar"><span style="width:' + Math.round(done / item.need * 100) + '%"></span></div></div><em>' + done + '/' + item.need + '</em></div>';
    }).join('');
  }
  document.querySelector('#fmInfoDialog').showModal();
}

function fmSetMode(mode) {
  if (!FM_MODES[mode] || mode === fmSettings.mode) return;
  if (fmActive()) { show('专注进行中，结束或重置后才能切换模式'); return; }
  fmSettings.mode = mode;
  fmSave();
  fmRender();
}

document.querySelector('#fmStart').addEventListener('click', () => {
  if (fmTimer.status === 'running') fmPause();
  else if (fmTimer.status === 'paused') fmResume();
  else fmStart();
});
document.querySelector('#fmReset').addEventListener('click', fmReset);
document.querySelector('#focusmode').addEventListener('click', event => {
  const mode = event.target.closest('[data-fm-mode]');
  if (mode) { fmSetMode(mode.dataset.fmMode); if (mode.dataset.fmMode === 'custom' && !fmActive()) document.querySelector('#fmCustomInput').focus(); return; }
  if (event.target.closest('[data-fm-toggle-task]')) {
    const task = fmCurrentTask();
    if (!task) return;
    task.completed = !task.completed;
    fmSettings.taskId = task.id;
    fmSave();
    saveTasks();
    renderTasks();
    return;
  }
  if (event.target.closest('[data-fm-edit]')) { fmOpenTaskDialog(); return; }
  const open = event.target.closest('[data-fm-open]');
  if (open) fmOpenInfo(open.dataset.fmOpen);
});
document.querySelector('#focusmode').addEventListener('keydown', event => {
  const mode = event.target.closest && event.target.closest('[data-fm-mode]');
  if (mode && event.target === mode && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); fmSetMode(mode.dataset.fmMode); }
});
document.querySelector('#fmCustomInput').addEventListener('input', event => {
  const minutes = fmClampMinutes(event.target.value, 0);
  if (!minutes || fmActive()) return;
  fmSettings.customMin = minutes;
  fmSettings.mode = 'custom';
  fmSave();
  fmRenderTimer();
  fmRenderTask();
});
document.querySelector('#fmCustomInput').addEventListener('change', event => {
  event.target.value = String(fmSettings.customMin);
});
document.querySelector('#fmTaskForm').addEventListener('submit', fmSaveTaskDialog);
['fmTaskClose', 'fmTaskCancel'].forEach(id => document.querySelector('#' + id).addEventListener('click', () => document.querySelector('#fmTaskDialog').close()));
document.querySelector('#fmInfoClose').addEventListener('click', () => document.querySelector('#fmInfoDialog').close());
['fmTaskDialog', 'fmInfoDialog'].forEach(id => document.querySelector('#' + id).addEventListener('click', event => {
  if (event.target === event.currentTarget) event.currentTarget.close();
}));
setInterval(fmTick, 250);

/* 左下角的励志短语：可以直接编辑，自动保存 */
const SIDE_QUOTE_KEY = 'atelier-side-quote';
const SIDE_QUOTE_DEFAULT = '“Make room for what matters.”';
function readSideQuote() {
  try {
    const saved = localStorage.getItem(SIDE_QUOTE_KEY);
    return typeof saved === 'string' && saved.trim() ? saved : SIDE_QUOTE_DEFAULT;
  } catch { return SIDE_QUOTE_DEFAULT; }
}
function saveSideQuote() {
  const box = document.querySelector('#sideQuote');
  const text = box.innerText.replace(/\n+/g, ' ').trim();
  try { localStorage.setItem(SIDE_QUOTE_KEY, text || SIDE_QUOTE_DEFAULT); } catch { /* 存不进去也不影响使用 */ }
}
document.querySelector('#sideQuote').addEventListener('focus', event => { if (event.target.innerText.trim() === SIDE_QUOTE_DEFAULT) { document.execCommand('selectAll', false, null); } });
document.querySelector('#sideQuote').addEventListener('input', saveSideQuote);
document.querySelector('#sideQuote').addEventListener('blur', event => {
  const box = event.target;
  box.innerText = box.innerText.replace(/\n+/g, ' ').trim() || SIDE_QUOTE_DEFAULT;
  saveSideQuote();
});
document.querySelector('#sideQuote').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.target.blur(); }
});
document.querySelector('#sideQuote').innerText = readSideQuote();

function show(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1900);
}

updateDateLine();
setInterval(updateDateLine, 60000);

apply();
renderCalendar();
renderTasks();
renderNotes();
renderTravelStats();
fmTick();
fmRender();
document.querySelector('#dashboard').classList.add('active');

