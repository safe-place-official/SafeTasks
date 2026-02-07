// SafeTasks: полностью статический менеджер задач с аналитикой.

const STORAGE_KEY = "safetasks-data";

const defaultState = {
  tasks: [],
  schedule: [],
  achievements: {
    unlocked: [],
  },
  ui: {
    theme: "dark",
  },
  filters: {
    query: "",
  },
  pomodoro: {
    mode: "focus",
    remaining: 25 * 60,
    running: false,
  },
  xp: {
    total: 0,
  },
  modules: {
    pomodoro: true,
    xp: true,
    achievements: true,
    stats: true,
    heatmap: true,
  },
};

let SafeTasksState = loadState();
let pomodoroInterval = null;

const elements = {
  taskForms: document.querySelectorAll(".task-form"),
  countLabels: document.querySelectorAll("[data-count]"),
  taskLists: {
    daily: {
      pending: document.getElementById("daily-task-list"),
      completed: document.getElementById("daily-completed-list"),
    },
    weekly: {
      pending: document.getElementById("weekly-task-list"),
      completed: document.getElementById("weekly-completed-list"),
    },
    monthly: {
      pending: document.getElementById("monthly-task-list"),
      completed: document.getElementById("monthly-completed-list"),
    },
    yearly: {
      pending: document.getElementById("yearly-task-list"),
      completed: document.getElementById("yearly-completed-list"),
    },
  },
  streakCount: document.getElementById("streak-count"),
  completionRate: document.getElementById("completion-rate"),
  periodSelect: document.getElementById("period-select"),
  dailyChart: document.getElementById("daily-chart"),
  weeklyChart: document.getElementById("weekly-chart"),
  achievementList: document.getElementById("achievement-list"),
  xpLevel: document.getElementById("xp-level"),
  xpTotal: document.getElementById("xp-total"),
  xpNext: document.getElementById("xp-next"),
  xpProgressBar: document.getElementById("xp-progress-bar"),
  heatmapGrid: document.getElementById("heatmap-grid"),
  scheduleForm: document.getElementById("schedule-form"),
  scheduleDay: document.getElementById("schedule-day"),
  scheduleTime: document.getElementById("schedule-time"),
  schedulePlace: document.getElementById("schedule-place"),
  scheduleTask: document.getElementById("schedule-task"),
  scheduleList: document.getElementById("schedule-list"),
  pomodoroTime: document.getElementById("pomodoro-time"),
  pomodoroState: document.getElementById("pomodoro-state"),
  pomodoroProgress: document.getElementById("pomodoro-progress"),
  pomodoroStart: document.getElementById("pomodoro-start"),
  pomodoroPause: document.getElementById("pomodoro-pause"),
  pomodoroReset: document.getElementById("pomodoro-reset"),
  tabButtons: document.querySelectorAll(".tab-button"),
  screens: document.querySelectorAll(".screen"),
  moduleToggles: document.querySelectorAll("[data-module-toggle]"),
  exportButton: document.getElementById("export-data"),
  importInput: document.getElementById("import-data"),
  statsTab: document.getElementById("tab-stats"),
  pomodoroTab: document.getElementById("tab-pomodoro"),
  todayDate: document.getElementById("today-date"),
  globalSearch: document.getElementById("global-search"),
  clearSearch: document.getElementById("clear-search"),
  themeToggle: document.getElementById("theme-toggle"),
  quickTaskForm: document.getElementById("quick-task-form"),
  activeTotal: document.getElementById("active-total"),
  dueToday: document.getElementById("due-today"),
  overdueCount: document.getElementById("overdue-count"),
  focusScore: document.getElementById("focus-score"),
  priorityList: document.getElementById("priority-list"),
  upcomingList: document.getElementById("upcoming-list"),
  activityList: document.getElementById("activity-list"),
  focusBlocks: document.getElementById("focus-blocks"),
  focusType: document.getElementById("focus-type"),
  focusTip: document.getElementById("focus-tip"),
};

// --------- Helpers ---------

function xpForType(type) {
  const map = {
    daily: 10,
    weekly: 30,
    monthly: 100,
    yearly: 100,
  };
  return map[type] || 0;
}

function normalizeState(rawState) {
  const base = structuredClone(defaultState);
  const xpFromTasks = Array.isArray(rawState?.tasks)
    ? rawState.tasks.reduce((total, task) => (task.completed ? total + xpForType(task.type) : total), 0)
    : 0;
  const normalized = {
    ...base,
    ...rawState,
    achievements: {
      unlocked: Array.isArray(rawState?.achievements?.unlocked) ? rawState.achievements.unlocked : [],
    },
    ui: {
      ...base.ui,
      ...(rawState?.ui || {}),
    },
    filters: {
      ...base.filters,
      ...(rawState?.filters || {}),
    },
    pomodoro: {
      ...base.pomodoro,
      ...(rawState?.pomodoro || {}),
    },
    xp: {
      total: Number.isFinite(rawState?.xp?.total) ? Number(rawState.xp.total) : xpFromTasks,
    },
    modules: {
      ...base.modules,
      ...(rawState?.modules || {}),
    },
  };
  normalized.tasks = Array.isArray(rawState?.tasks)
    ? rawState.tasks.map((task) => ({
        ...task,
        priority: task.priority || "medium",
        tags: Array.isArray(task.tags) ? task.tags : [],
      }))
    : [];
  normalized.schedule = Array.isArray(rawState?.schedule) ? rawState.schedule : [];
  return normalized;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return normalizeState({});
  }
  try {
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.error("Не удалось прочитать localStorage:", error);
    return normalizeState({});
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SafeTasksState));
}

function updateState(updater) {
  const draft = structuredClone(SafeTasksState);
  const updated = typeof updater === "function" ? updater(draft) || draft : updater;
  SafeTasksState = normalizeState(updated);
  syncAchievements(SafeTasksState);
  saveState();
  render();
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
}

function dueDateForType(type) {
  const now = new Date();
  if (type === "daily") {
    return endOfDay(now).toISOString();
  }
  if (type === "weekly") {
    const day = now.getDay() || 7;
    const end = new Date(now);
    end.setDate(now.getDate() + (7 - day));
    return endOfDay(end).toISOString();
  }
  if (type === "monthly") {
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return endOfDay(end).toISOString();
  }
  const end = new Date(now.getFullYear(), 11, 31);
  return endOfDay(end).toISOString();
}

function typeLabel(type) {
  const map = {
    daily: "Дневная",
    weekly: "Недельная",
    monthly: "Месячная",
    yearly: "Годовая",
  };
  return map[type] || "Задача";
}

function priorityLabel(priority) {
  const map = {
    high: "Высокий приоритет",
    medium: "Средний приоритет",
    low: "Низкий приоритет",
  };
  return map[priority] || "Средний приоритет";
}

function priorityRank(priority) {
  const map = {
    high: 0,
    medium: 1,
    low: 2,
  };
  return map[priority] ?? 1;
}

function parseTags(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function matchesQuery(task, query) {
  if (!query) return true;
  const haystack = `${task.title} ${task.type} ${task.tags?.join(" ")}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function dueState(task) {
  if (task.completed) return "none";
  const now = new Date();
  const due = new Date(task.dueDate);
  if (due < now) return "overdue";
  const soon = new Date(now);
  soon.setDate(now.getDate() + 1);
  if (due <= soon) return "due";
  return "none";
}

function compareTasks(a, b) {
  return new Date(a.dueDate) - new Date(b.dueDate);
}

function tasksByType(type) {
  return SafeTasksState.tasks.filter((task) => task.type === type);
}

function getCompletionStats(periodDays) {
  const now = startOfDay(new Date());
  const start = new Date(now);
  start.setDate(start.getDate() - (periodDays - 1));

  const relevant = SafeTasksState.tasks.filter((task) => {
    const created = startOfDay(new Date(task.createdAt));
    return created >= start && created <= now;
  });

  const completed = relevant.filter((task) => task.completed).length;
  const total = relevant.length;
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

// --------- Tasks ---------

function addTask(title, type, options = {}) {
  updateState((draft) => {
    const task = {
      id: crypto.randomUUID(),
      title,
      type,
      createdAt: new Date().toISOString(),
      dueDate: dueDateForType(type),
      completed: false,
      completedAt: null,
      priority: options.priority || "medium",
      tags: Array.isArray(options.tags) ? options.tags : [],
    };
    draft.tasks.push(task);
  });
}

function toggleTask(id) {
  updateState((draft) => {
    const task = draft.tasks.find((item) => item.id === id);
    if (!task) return;
    task.completed = !task.completed;
    task.completedAt = task.completed ? new Date().toISOString() : null;
    const delta = task.completed ? xpForType(task.type) : -xpForType(task.type);
    draft.xp.total = Math.max(0, draft.xp.total + delta);
  });
}

function deleteTask(id) {
  updateState((draft) => {
    const task = draft.tasks.find((item) => item.id === id);
    if (!task || task.completed) return;
    draft.tasks = draft.tasks.filter((item) => item.id !== id);
  });
}

function editTask(id) {
  const task = SafeTasksState.tasks.find((item) => item.id === id);
  if (!task) return;
  const newTitle = prompt("Обнови текст задачи:", task.title);
  if (!newTitle) return;
  const newType = prompt("Тип: daily / weekly / monthly / yearly", task.type);
  const newPriority = prompt("Приоритет: high / medium / low", task.priority);
  const newTags = prompt("Теги через запятую", task.tags.join(", "));
  updateState((draft) => {
    const target = draft.tasks.find((item) => item.id === id);
    if (!target) return;
    const previousType = target.type;
    if (newType && ["daily", "weekly", "monthly", "yearly"].includes(newType)) {
      target.type = newType;
      target.dueDate = dueDateForType(newType);
    }
    target.title = newTitle;
    if (newPriority && ["high", "medium", "low"].includes(newPriority)) {
      target.priority = newPriority;
    }
    if (typeof newTags === "string") {
      target.tags = parseTags(newTags);
    }
    if (target.completed && previousType !== target.type) {
      const delta = xpForType(target.type) - xpForType(previousType);
      draft.xp.total = Math.max(0, draft.xp.total + delta);
    }
  });
}

// --------- Schedule ---------

const dayOrder = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];

function addScheduleEntry(day, time, place, task) {
  updateState((draft) => {
    const entry = {
      id: crypto.randomUUID(),
      day,
      time,
      place,
      task,
    };
    draft.schedule.push(entry);
  });
}

function renderSchedule() {
  if (!elements.scheduleList) return;
  elements.scheduleList.innerHTML = "";
  const sorted = [...SafeTasksState.schedule].sort((a, b) => {
    const dayDiff = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
    if (dayDiff !== 0) return dayDiff;
    return a.time.localeCompare(b.time);
  });

  sorted.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "schedule-item";
    item.innerHTML = `
      <strong>${entry.day} · ${entry.time}</strong>
      <span class="task-title">${entry.task}</span>
      <span class="task-meta">${entry.place}</span>
    `;
    elements.scheduleList.appendChild(item);
  });
}

// --------- Achievements ---------

const achievementCatalog = [
  {
    id: "first_task",
    title: "Первый шаг",
    description: "Создай свою первую задачу.",
    condition: (snapshot) => snapshot.tasks.length >= 1,
  },
  {
    id: "three_done",
    title: "Триумф 3",
    description: "Выполни 3 задачи.",
    condition: (snapshot) => completedTasks(snapshot).length >= 3,
  },
  {
    id: "ten_done",
    title: "Неоновый рывок",
    description: "Выполни 10 задач.",
    condition: (snapshot) => completedTasks(snapshot).length >= 10,
  },
  {
    id: "streak_3",
    title: "Серия 3",
    description: "Собери streak из 3 дней.",
    condition: (snapshot) => calculateStreak(snapshot) >= 3,
  },
];

function completedTasks(snapshot) {
  return snapshot.tasks.filter((task) => task.completed);
}

function syncAchievements(snapshot) {
  achievementCatalog.forEach((achievement) => {
    if (achievement.condition(snapshot) && !snapshot.achievements.unlocked.includes(achievement.id)) {
      snapshot.achievements.unlocked.push(achievement.id);
    }
  });
}

function renderAchievements() {
  elements.achievementList.innerHTML = "";
  achievementCatalog.forEach((achievement) => {
    const item = document.createElement("li");
    item.className = "achievement";
    if (SafeTasksState.achievements.unlocked.includes(achievement.id)) {
      item.classList.add("unlocked");
    }
    item.innerHTML = `
      <strong>${achievement.title}</strong>
      <p class="hint">${achievement.description}</p>
    `;
    elements.achievementList.appendChild(item);
  });
}

// --------- Stats ---------

function calculateStreak(snapshot = SafeTasksState) {
  const completed = completedTasks(snapshot)
    .map((task) => startOfDay(new Date(task.completedAt)))
    .filter(Boolean)
    .sort((a, b) => b - a);

  if (!completed.length) return 0;

  let streak = 0;
  let current = startOfDay(new Date());
  const completedSet = new Set(completed.map((date) => date.toDateString()));

  while (completedSet.has(current.toDateString())) {
    streak += 1;
    current.setDate(current.getDate() - 1);
  }

  return streak;
}

function dailyCompletions(days = 7, snapshot = SafeTasksState) {
  const now = startOfDay(new Date());
  const data = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const count = completedTasks(snapshot).filter((task) => {
      if (!task.completedAt) return false;
      return startOfDay(new Date(task.completedAt)).getTime() === date.getTime();
    }).length;
    data.push({ date, count });
  }
  return data;
}

function weeklyProductivity(weeks = 4, snapshot = SafeTasksState) {
  const now = startOfDay(new Date());
  const data = [];

  for (let i = weeks - 1; i >= 0; i -= 1) {
    const end = new Date(now);
    end.setDate(now.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);

    const tasks = snapshot.tasks.filter((task) => {
      const created = startOfDay(new Date(task.createdAt));
      return created >= start && created <= end;
    });
    const completed = tasks.filter((task) => task.completed).length;
    const rate = tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);
    data.push({ start, end, rate });
  }

  return data;
}

function drawDailyChart() {
  const ctx = elements.dailyChart.getContext("2d");
  const data = dailyCompletions(7);
  ctx.clearRect(0, 0, elements.dailyChart.width, elements.dailyChart.height);

  const max = Math.max(...data.map((item) => item.count), 1);
  const padding = 30;
  const barWidth = (elements.dailyChart.width - padding * 2) / data.length - 10;

  ctx.strokeStyle = "#00ff66";
  ctx.fillStyle = "rgba(0,255,102,0.6)";
  ctx.font = "12px Segoe UI";

  data.forEach((item, index) => {
    const x = padding + index * (barWidth + 10);
    const height = (item.count / max) * (elements.dailyChart.height - padding * 2);
    const y = elements.dailyChart.height - padding - height;
    ctx.fillRect(x, y, barWidth, height);
    ctx.fillText(formatDate(item.date), x, elements.dailyChart.height - 10);
  });
}

function drawWeeklyChart() {
  const ctx = elements.weeklyChart.getContext("2d");
  const data = weeklyProductivity(4);
  ctx.clearRect(0, 0, elements.weeklyChart.width, elements.weeklyChart.height);

  const padding = 30;
  const chartWidth = elements.weeklyChart.width - padding * 2;
  const step = chartWidth / (data.length - 1 || 1);

  ctx.strokeStyle = "#00ff66";
  ctx.lineWidth = 2;
  ctx.beginPath();

  data.forEach((item, index) => {
    const x = padding + index * step;
    const y = elements.weeklyChart.height - padding - (item.rate / 100) * (elements.weeklyChart.height - padding * 2);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    ctx.fillStyle = "#00ff66";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "12px Segoe UI";
    ctx.fillText(`${item.rate}%`, x - 10, y - 10);
  });
  ctx.stroke();
}

// --------- UI ---------

function renderTasks() {
  const query = SafeTasksState.filters.query;
  Object.entries(elements.taskLists).forEach(([type, lists]) => {
    lists.pending.innerHTML = "";
    lists.completed.innerHTML = "";

    const pendingTasks = tasksByType(type)
      .filter((task) => !task.completed)
      .filter((task) => matchesQuery(task, query))
      .sort(compareTasks);
    const completed = tasksByType(type)
      .filter((task) => task.completed)
      .filter((task) => matchesQuery(task, query))
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    pendingTasks.forEach((task) => {
      const item = document.createElement("li");
      const due = dueState(task);
      const dueBadge =
        due === "overdue"
          ? `<span class="badge badge--overdue">Просрочено</span>`
          : due === "due"
            ? `<span class="badge badge--due">Срок сегодня</span>`
            : "";
      const tags = task.tags?.length
        ? task.tags.map((tag) => `<span class="badge badge--tag">#${tag}</span>`).join("")
        : "";
      item.className = "task-item";
      item.innerHTML = `
        <input type="checkbox" aria-label="Выполнено" />
        <div>
          <div class="task-title">${task.title}</div>
          <div class="task-meta">
            <span class="badge">${typeLabel(task.type)}</span>
            <span>до ${formatDateTime(new Date(task.dueDate))}</span>
          </div>
          <div class="badges">
            <span class="badge badge--priority-${task.priority}">${priorityLabel(task.priority)}</span>
            ${dueBadge}
            ${tags}
          </div>
        </div>
        <div class="actions">
          <button class="btn ghost" data-action="edit">Редактировать</button>
          <button class="btn ghost" data-action="delete">Удалить</button>
        </div>
      `;

      const checkbox = item.querySelector("input");
      checkbox.addEventListener("change", () => {
        item.classList.add("fade-complete");
        toggleTask(task.id);
      });

      item.querySelector('[data-action="edit"]').addEventListener("click", () => editTask(task.id));
      item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteTask(task.id));

      lists.pending.appendChild(item);
    });

    completed.forEach((task) => {
      const item = document.createElement("li");
      item.className = "task-item is-locked";
      item.innerHTML = `
        <div>
          <div class="task-title">${task.title}</div>
          <div class="task-meta">
            <span class="badge">${typeLabel(task.type)}</span>
            <span>выполнено ${formatDateTime(new Date(task.completedAt))}</span>
          </div>
        </div>
      `;
      lists.completed.appendChild(item);
    });
  });
}

function renderSummary() {
  elements.countLabels.forEach((label) => {
    const type = label.dataset.type;
    const mode = label.dataset.count;
    const tasks = tasksByType(type);
    const value = mode === "completed" ? tasks.filter((task) => task.completed).length : tasks.filter((task) => !task.completed).length;
    label.textContent = value;
  });
}

function renderStats() {
  if (!SafeTasksState.modules.stats) return;
  elements.streakCount.textContent = calculateStreak();
  const period = Number(elements.periodSelect.value);
  elements.completionRate.textContent = `${getCompletionStats(period)}%`;
  drawDailyChart();
  drawWeeklyChart();
}

function renderDashboard() {
  if (!elements.activeTotal) return;
  const active = SafeTasksState.tasks.filter((task) => !task.completed);
  const overdue = active.filter((task) => dueState(task) === "overdue");
  const dueToday = active.filter((task) => {
    const due = new Date(task.dueDate);
    return dueState(task) !== "overdue" && startOfDay(due).getTime() === startOfDay(new Date()).getTime();
  });
  elements.activeTotal.textContent = active.length;
  elements.dueToday.textContent = dueToday.length;
  elements.overdueCount.textContent = overdue.length;
  elements.focusScore.textContent = `${getCompletionStats(7)}%`;

  if (elements.priorityList) {
    const priorityTasks = active
      .filter((task) => matchesQuery(task, SafeTasksState.filters.query))
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || compareTasks(a, b))
      .slice(0, 5);
    elements.priorityList.innerHTML = "";
    priorityTasks.forEach((task) => {
      const item = document.createElement("li");
      item.className = "task-item";
      item.innerHTML = `
        <div>
          <div class="task-title">${task.title}</div>
          <div class="task-meta">
            <span class="badge badge--priority-${task.priority}">${priorityLabel(task.priority)}</span>
            <span>до ${formatDateTime(new Date(task.dueDate))}</span>
          </div>
        </div>
      `;
      elements.priorityList.appendChild(item);
    });
  }

  if (elements.upcomingList) {
    const upcoming = active
      .filter((task) => matchesQuery(task, SafeTasksState.filters.query))
      .filter((task) => {
        const due = new Date(task.dueDate);
        const now = new Date();
        const week = new Date(now);
        week.setDate(now.getDate() + 7);
        return due >= now && due <= week;
      })
      .sort(compareTasks)
      .slice(0, 6);
    elements.upcomingList.innerHTML = "";
    upcoming.forEach((task) => {
      const item = document.createElement("li");
      item.className = "task-item";
      item.innerHTML = `
        <div>
          <div class="task-title">${task.title}</div>
          <div class="task-meta">
            <span class="badge">${typeLabel(task.type)}</span>
            <span>до ${formatDateTime(new Date(task.dueDate))}</span>
          </div>
        </div>
      `;
      elements.upcomingList.appendChild(item);
    });
  }

  if (elements.activityList) {
    const recent = SafeTasksState.tasks
      .filter((task) => task.completed)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
      .slice(0, 6);
    elements.activityList.innerHTML = "";
    recent.forEach((task) => {
      const item = document.createElement("li");
      item.className = "activity-item";
      item.innerHTML = `
        <strong>${task.title}</strong>
        <span class="hint">${typeLabel(task.type)} · ${formatDateTime(new Date(task.completedAt))}</span>
      `;
      elements.activityList.appendChild(item);
    });
  }

  if (elements.focusBlocks && elements.focusType && elements.focusTip) {
    const blocks = Math.min(Math.max(Math.ceil(active.length / 3), 1), 6);
    elements.focusBlocks.textContent = `${blocks} блока`;
    const typeCount = active.reduce((acc, task) => {
      acc[task.type] = (acc[task.type] || 0) + 1;
      return acc;
    }, {});
    const topType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    elements.focusType.textContent = topType ? typeLabel(topType) : "—";
    elements.focusTip.textContent =
      active.length > 5
        ? "Сократи список: выбери 3 задачи и отметь остальные как фоновые."
        : "Сделай один помодоро для самой важной задачи, затем возьми легкую.";
  }
}

function renderXp() {
  if (!SafeTasksState.modules.xp) return;
  const total = SafeTasksState.xp.total;
  const level = Math.floor(total / 500);
  const progress = total % 500;
  elements.xpLevel.textContent = level;
  elements.xpTotal.textContent = total;
  elements.xpNext.textContent = `${500 - progress} XP`;
  elements.xpProgressBar.style.width = `${(progress / 500) * 100}%`;
}

function buildHeatmapData() {
  const days = 365;
  const now = startOfDay(new Date());
  const start = new Date(now);
  start.setDate(now.getDate() - (days - 1));

  const countMap = new Map();
  completedTasks(SafeTasksState).forEach((task) => {
    if (!task.completedAt) return;
    const key = startOfDay(new Date(task.completedAt)).toDateString();
    countMap.set(key, (countMap.get(key) || 0) + 1);
  });

  const data = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = date.toDateString();
    data.push({ date, count: countMap.get(key) || 0 });
  }
  return data;
}

function renderHeatmap() {
  if (!SafeTasksState.modules.heatmap || !elements.heatmapGrid) return;
  elements.heatmapGrid.innerHTML = "";
  const data = buildHeatmapData();
  data.forEach((item) => {
    const cell = document.createElement("div");
    const level = item.count === 0 ? 0 : item.count <= 2 ? 1 : item.count <= 5 ? 2 : 3;
    cell.className = `heatmap-cell level-${level}`;
    cell.title = `${formatDate(item.date)} — выполнено ${item.count} задач`;
    elements.heatmapGrid.appendChild(cell);
  });
}

function renderPomodoro() {
  const minutes = String(Math.floor(SafeTasksState.pomodoro.remaining / 60)).padStart(2, "0");
  const seconds = String(SafeTasksState.pomodoro.remaining % 60).padStart(2, "0");
  elements.pomodoroTime.textContent = `${minutes}:${seconds}`;
  elements.pomodoroState.textContent = SafeTasksState.pomodoro.mode === "focus" ? "Фокус" : "Перерыв";
  const total = SafeTasksState.pomodoro.mode === "focus" ? 25 * 60 : 5 * 60;
  const progress = ((total - SafeTasksState.pomodoro.remaining) / total) * 100;
  elements.pomodoroProgress.style.width = `${progress}%`;
}

function render() {
  applyTheme();
  updateTodayDate();
  if (elements.globalSearch) {
    elements.globalSearch.value = SafeTasksState.filters.query;
  }
  renderTasks();
  renderSummary();
  renderStats();
  renderAchievements();
  renderSchedule();
  renderXp();
  renderHeatmap();
  renderPomodoro();
  renderModuleToggles();
  applyModuleVisibility();
  renderDashboard();
}

function renderModuleToggles() {
  elements.moduleToggles.forEach((toggle) => {
    const moduleName = toggle.dataset.moduleToggle;
    toggle.checked = Boolean(SafeTasksState.modules[moduleName]);
  });
}

function applyTheme() {
  document.body.dataset.theme = SafeTasksState.ui.theme;
  if (elements.themeToggle) {
    elements.themeToggle.textContent = SafeTasksState.ui.theme === "light" ? "Тема: День" : "Тема: Ночь";
  }
}

function updateTodayDate() {
  if (!elements.todayDate) return;
  elements.todayDate.textContent = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "long",
  }).format(new Date());
}

function applyModuleVisibility() {
  const { modules } = SafeTasksState;
  document.querySelectorAll("[data-module]").forEach((element) => {
    const moduleName = element.dataset.module;
    element.classList.toggle("is-hidden", !modules[moduleName]);
  });

  const statsEnabled = modules.stats || modules.xp || modules.achievements || modules.heatmap;
  if (elements.statsTab) {
    elements.statsTab.classList.toggle("is-hidden", !statsEnabled);
  }
  const statsScreen = document.getElementById("screen-stats");
  if (statsScreen) {
    statsScreen.classList.toggle("is-hidden", !statsEnabled);
  }

  if (elements.pomodoroTab) {
    elements.pomodoroTab.classList.toggle("is-hidden", !modules.pomodoro);
  }

  const active = document.querySelector(".tab-button.is-active");
  if (active?.classList.contains("is-hidden")) {
    switchScreen("dashboard");
  }
}

function validateImport(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    Array.isArray(payload.tasks) &&
    Array.isArray(payload.schedule) &&
    typeof payload.pomodoro === "object" &&
    typeof payload.achievements === "object" &&
    Array.isArray(payload.achievements?.unlocked) &&
    typeof payload.modules === "object" &&
    typeof payload.xp === "object" &&
    typeof payload.xp.total === "number"
  );
}

function exportData() {
  const data = JSON.stringify(SafeTasksState, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `safetasks-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!validateImport(parsed)) {
        alert("Некорректная структура данных SafeTasks.");
        return;
      }
      clearInterval(pomodoroInterval);
      updateState(() => normalizeState(parsed));
      if (SafeTasksState.pomodoro.running) {
        updateState((draft) => {
          draft.pomodoro.running = false;
        });
        startPomodoro();
      }
    } catch (error) {
      console.error(error);
      alert("Не удалось прочитать JSON-файл.");
    }
  };
  reader.readAsText(file);
}

function switchScreen(target) {
  elements.tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screen === target);
  });
  elements.screens.forEach((screen) => {
    screen.classList.toggle("is-active", screen.id === `screen-${target}`);
  });
}

// --------- Pomodoro ---------

function setPomodoroMode(mode) {
  updateState((draft) => {
    draft.pomodoro.mode = mode;
    draft.pomodoro.remaining = mode === "focus" ? 25 * 60 : 5 * 60;
    draft.pomodoro.running = false;
  });
}

function startPomodoro() {
  if (SafeTasksState.pomodoro.running) return;
  updateState((draft) => {
    draft.pomodoro.running = true;
  });
  pomodoroInterval = setInterval(() => {
    if (!SafeTasksState.pomodoro.running) return;
    updateState((draft) => {
      draft.pomodoro.remaining -= 1;
      if (draft.pomodoro.remaining <= 0) {
        draft.pomodoro.running = false;
        draft.pomodoro.mode = draft.pomodoro.mode === "focus" ? "break" : "focus";
        draft.pomodoro.remaining = draft.pomodoro.mode === "focus" ? 25 * 60 : 5 * 60;
      }
    });
    if (!SafeTasksState.pomodoro.running) {
      clearInterval(pomodoroInterval);
    }
  }, 1000);
}

function pausePomodoro() {
  updateState((draft) => {
    draft.pomodoro.running = false;
  });
  clearInterval(pomodoroInterval);
}

function resetPomodoro() {
  updateState((draft) => {
    draft.pomodoro.running = false;
    draft.pomodoro.remaining = draft.pomodoro.mode === "focus" ? 25 * 60 : 5 * 60;
  });
  clearInterval(pomodoroInterval);
}

// --------- Events ---------

elements.taskForms.forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const titleInput = form.querySelector(".task-title-input");
    const title = titleInput.value.trim();
    if (!title) return;
    const typeInput = form.querySelector(".task-type-input");
    const priorityInput = form.querySelector(".task-priority-input");
    const tagsInput = form.querySelector(".task-tags-input");
    const type = typeInput?.value || form.dataset.taskType;
    addTask(title, type, {
      priority: priorityInput?.value || "medium",
      tags: parseTags(tagsInput?.value || ""),
    });
    titleInput.value = "";
    if (tagsInput) tagsInput.value = "";
  });
});

elements.scheduleForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const day = elements.scheduleDay.value;
  const time = elements.scheduleTime.value;
  const place = elements.schedulePlace.value.trim();
  const task = elements.scheduleTask.value.trim();
  if (!day || !time || !place || !task) return;
  addScheduleEntry(day, time, place, task);
  elements.scheduleTime.value = "";
  elements.schedulePlace.value = "";
  elements.scheduleTask.value = "";
});

elements.periodSelect.addEventListener("change", renderStats);

elements.tabButtons.forEach((button) => {
  button.addEventListener("click", () => switchScreen(button.dataset.screen));
});

elements.moduleToggles.forEach((toggle) => {
  toggle.addEventListener("change", () => {
    const moduleName = toggle.dataset.moduleToggle;
    updateState((draft) => {
      draft.modules[moduleName] = toggle.checked;
      if (moduleName === "pomodoro" && !toggle.checked) {
        draft.pomodoro.running = false;
        draft.pomodoro.mode = "focus";
        draft.pomodoro.remaining = 25 * 60;
      }
    });
    if (moduleName === "pomodoro" && !toggle.checked) {
      clearInterval(pomodoroInterval);
    }
  });
});

elements.exportButton?.addEventListener("click", exportData);

elements.importInput?.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const confirmed = confirm("Все текущие данные будут заменены");
  if (!confirmed) {
    event.target.value = "";
    return;
  }
  importData(file);
  event.target.value = "";
});

elements.pomodoroStart.addEventListener("click", startPomodoro);

elements.pomodoroPause.addEventListener("click", pausePomodoro);

elements.pomodoroReset.addEventListener("click", resetPomodoro);

elements.globalSearch?.addEventListener("input", (event) => {
  const query = event.target.value.trim();
  updateState((draft) => {
    draft.filters.query = query;
  });
});

elements.clearSearch?.addEventListener("click", () => {
  if (!elements.globalSearch) return;
  elements.globalSearch.value = "";
  updateState((draft) => {
    draft.filters.query = "";
  });
});

elements.themeToggle?.addEventListener("click", () => {
  updateState((draft) => {
    draft.ui.theme = draft.ui.theme === "light" ? "dark" : "light";
  });
});

window.addEventListener("load", () => {
  render();
  if (SafeTasksState.pomodoro.running) {
    startPomodoro();
  }
});
