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

function loadIdeas() {
  try {
    const saved = JSON.parse(localStorage.getItem('atelier-ideas') || '[]');
    const colors = new Set(['peach', 'mint', 'mist', 'cream']);
    return Array.isArray(saved) ? saved
      .filter(note => note && typeof note === 'object' && typeof note.text === 'string')
      .map(note => ({
        id: typeof note.id === 'string' && note.id ? note.id : newId(),
        text: note.text,
        pinned: Boolean(note.pinned),
        color: colors.has(note.color) ? note.color : 'peach'
      })) : [];
  } catch {
    return [];
  }
}

function saveIdeas() {
  localStorage.setItem('atelier-ideas', JSON.stringify(ideas));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
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

  const ordered = [...ideas].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  list.innerHTML = ordered.map(note => `
    <article class="sticky-note note-tone-${note.color}" data-idea-id="${escapeHtml(note.id)}">
      <textarea aria-label="编辑灵感便签">${escapeHtml(note.text)}</textarea>
      <footer><button type="button" class="idea-pin" data-pin-idea aria-pressed="${note.pinned}" aria-label="${note.pinned ? '取消置顶' : '置顶'}">${note.pinned ? '已置顶' : '置顶'}</button><select data-idea-color aria-label="便签颜色"><option value="peach" ${note.color === 'peach' ? 'selected' : ''}>桃色</option><option value="mint" ${note.color === 'mint' ? 'selected' : ''}>薄荷</option><option value="mist" ${note.color === 'mist' ? 'selected' : ''}>雾蓝</option><option value="cream" ${note.color === 'cream' ? 'selected' : ''}>奶油</option></select><button type="button" class="delete-idea" aria-label="删除这张便签">删除</button></footer>
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
      ? places.map(place => '<button class="travel-place" type="button" data-focus-destination="' + escapeHtml(place.id) + '"><b>' +
        escapeHtml(place.name) + '</b><small>' + escapeHtml(place.country || '未填写国家') + '</small></button>').join('')
      : '<p class="travel-list-empty">' + TRAVEL_EMPTY_TEXT[status] + '</p>';
  });
  document.querySelector('#travelEmpty').hidden = travelDestinations.length > 0;
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

document.querySelector('#addDestination').addEventListener('click', () => openTravelDialog());
document.querySelector('#addDestinationEmpty').addEventListener('click', () => openTravelDialog());
document.querySelector('.travel-stats').addEventListener('click', event => {
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
    if (destination && confirm('删除「' + destination.name + '」？此操作无法撤销。')) {
      travelDestinations = travelDestinations.filter(item => item.id !== id);
      saveTravelDestinations();
      renderTravelStats();
      renderTravelMarkers();
      if (travelMap) travelMap.closePopup();
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
  const pinIdea = event.target.closest('[data-pin-idea]');
  if (pinIdea) {
    const note = ideas.find(item => item.id === pinIdea.closest('[data-idea-id]').dataset.ideaId);
    if (!note) return;
    note.pinned = !note.pinned;
    saveIdeas();
    renderIdeas();
    return;
  }
  const deleteButton = event.target.closest('.delete-idea');
  if (deleteButton) {
    const card = deleteButton.closest('[data-idea-id]');
    if (!confirm('删除这张灵感便签？此操作无法撤销。')) return;
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
  ideas.unshift({ id: newId(), text, pinned: false, color: 'peach' });
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
document.querySelector('#ideasList').addEventListener('change', event => {
  if (!event.target.matches('[data-idea-color]')) return;
  const note = ideas.find(item => item.id === event.target.closest('[data-idea-id]').dataset.ideaId);
  if (!note) return;
  note.color = event.target.value;
  saveIdeas();
  renderIdeas();
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

function show(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1900);
}

updateDateLine();
setInterval(updateDateLine, 60000);

apply();
renderIdeas();
renderCalendar();
renderTasks();
renderNotes();
renderTravelStats();
document.querySelector('#dashboard').classList.add('active');

