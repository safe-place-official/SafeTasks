// SafeTasks: полностью статический менеджер задач с аналитикой.

const STORAGE_KEY = "safetasks-data";

const defaultState = {
  tasks: [],
  schedule: [],
  achievements: {
    unlocked: [],
  },
  pomodoro: {
    mode: "focus",
    remaining: 25 * 60,
    running: false,
  },
};

const state = loadState();
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
};

// --------- Helpers ---------

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return structuredClone(defaultState);
  }
  try {
    return { ...structuredClone(defaultState), ...JSON.parse(raw) };
  } catch (error) {
    console.error("Не удалось прочитать localStorage:", error);
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function compareTasks(a, b) {
  return new Date(a.dueDate) - new Date(b.dueDate);
}

function tasksByType(type) {
  return state.tasks.filter((task) => task.type === type);
}

function getCompletionStats(periodDays) {
  const now = startOfDay(new Date());
  const start = new Date(now);
  start.setDate(start.getDate() - (periodDays - 1));

  const relevant = state.tasks.filter((task) => {
    const created = startOfDay(new Date(task.createdAt));
    return created >= start && created <= now;
  });

  const completed = relevant.filter((task) => task.completed).length;
  const total = relevant.length;
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

// --------- Tasks ---------

function addTask(title, type) {
  const task = {
    id: crypto.randomUUID(),
    title,
    type,
    createdAt: new Date().toISOString(),
    dueDate: dueDateForType(type),
    completed: false,
    completedAt: null,
  };
  state.tasks.push(task);
  saveState();
  render();
}

function toggleTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.completed = !task.completed;
  task.completedAt = task.completed ? new Date().toISOString() : null;
  saveState();
  render();
}

function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || task.completed) return;
  state.tasks = state.tasks.filter((item) => item.id !== id);
  saveState();
  render();
}

function editTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const newTitle = prompt("Обнови текст задачи:", task.title);
  if (!newTitle) return;
  const newType = prompt("Тип: daily / weekly / monthly / yearly", task.type);
  if (newType && ["daily", "weekly", "monthly", "yearly"].includes(newType)) {
    task.type = newType;
    task.dueDate = dueDateForType(newType);
  }
  task.title = newTitle;
  saveState();
  render();
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
  const entry = {
    id: crypto.randomUUID(),
    day,
    time,
    place,
    task,
  };
  state.schedule.push(entry);
  saveState();
  renderSchedule();
}

function renderSchedule() {
  if (!elements.scheduleList) return;
  elements.scheduleList.innerHTML = "";
  const sorted = [...state.schedule].sort((a, b) => {
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
    condition: () => state.tasks.length >= 1,
  },
  {
    id: "three_done",
    title: "Триумф 3",
    description: "Выполни 3 задачи.",
    condition: () => completedTasks().length >= 3,
  },
  {
    id: "ten_done",
    title: "Неоновый рывок",
    description: "Выполни 10 задач.",
    condition: () => completedTasks().length >= 10,
  },
  {
    id: "streak_3",
    title: "Серия 3",
    description: "Собери streak из 3 дней.",
    condition: () => calculateStreak() >= 3,
  },
];

function completedTasks() {
  return state.tasks.filter((task) => task.completed);
}

function updateAchievements() {
  achievementCatalog.forEach((achievement) => {
    if (achievement.condition() && !state.achievements.unlocked.includes(achievement.id)) {
      state.achievements.unlocked.push(achievement.id);
    }
  });
  saveState();
}

function renderAchievements() {
  elements.achievementList.innerHTML = "";
  achievementCatalog.forEach((achievement) => {
    const item = document.createElement("li");
    item.className = "achievement";
    if (state.achievements.unlocked.includes(achievement.id)) {
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

function calculateStreak() {
  const completed = completedTasks()
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

function dailyCompletions(days = 7) {
  const now = startOfDay(new Date());
  const data = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const count = completedTasks().filter((task) => {
      if (!task.completedAt) return false;
      return startOfDay(new Date(task.completedAt)).getTime() === date.getTime();
    }).length;
    data.push({ date, count });
  }
  return data;
}

function weeklyProductivity(weeks = 4) {
  const now = startOfDay(new Date());
  const data = [];

  for (let i = weeks - 1; i >= 0; i -= 1) {
    const end = new Date(now);
    end.setDate(now.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);

    const tasks = state.tasks.filter((task) => {
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
  Object.entries(elements.taskLists).forEach(([type, lists]) => {
    lists.pending.innerHTML = "";
    lists.completed.innerHTML = "";

    const pendingTasks = tasksByType(type).filter((task) => !task.completed).sort(compareTasks);
    const completed = tasksByType(type)
      .filter((task) => task.completed)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    pendingTasks.forEach((task) => {
      const item = document.createElement("li");
      item.className = "task-item";
      item.innerHTML = `
        <input type="checkbox" aria-label="Выполнено" />
        <div>
          <div class="task-title">${task.title}</div>
          <div class="task-meta">
            <span class="badge">${typeLabel(task.type)}</span>
            <span>до ${formatDateTime(new Date(task.dueDate))}</span>
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
  elements.streakCount.textContent = calculateStreak();
  const period = Number(elements.periodSelect.value);
  elements.completionRate.textContent = `${getCompletionStats(period)}%`;
  drawDailyChart();
  drawWeeklyChart();
}

function renderPomodoro() {
  const minutes = String(Math.floor(state.pomodoro.remaining / 60)).padStart(2, "0");
  const seconds = String(state.pomodoro.remaining % 60).padStart(2, "0");
  elements.pomodoroTime.textContent = `${minutes}:${seconds}`;
  elements.pomodoroState.textContent = state.pomodoro.mode === "focus" ? "Фокус" : "Перерыв";
  const total = state.pomodoro.mode === "focus" ? 25 * 60 : 5 * 60;
  const progress = ((total - state.pomodoro.remaining) / total) * 100;
  elements.pomodoroProgress.style.width = `${progress}%`;
}

function render() {
  updateAchievements();
  renderTasks();
  renderSummary();
  renderStats();
  renderAchievements();
  renderSchedule();
  renderPomodoro();
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
  state.pomodoro.mode = mode;
  state.pomodoro.remaining = mode === "focus" ? 25 * 60 : 5 * 60;
  saveState();
  renderPomodoro();
}

function startPomodoro() {
  if (state.pomodoro.running) return;
  state.pomodoro.running = true;
  pomodoroInterval = setInterval(() => {
    state.pomodoro.remaining -= 1;
    if (state.pomodoro.remaining <= 0) {
      state.pomodoro.running = false;
      clearInterval(pomodoroInterval);
      setPomodoroMode(state.pomodoro.mode === "focus" ? "break" : "focus");
    }
    saveState();
    renderPomodoro();
  }, 1000);
}

function pausePomodoro() {
  state.pomodoro.running = false;
  clearInterval(pomodoroInterval);
  saveState();
  renderPomodoro();
}

function resetPomodoro() {
  pausePomodoro();
  setPomodoroMode(state.pomodoro.mode);
}

// --------- Events ---------

elements.taskForms.forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const titleInput = form.querySelector(".task-title-input");
    const title = titleInput.value.trim();
    if (!title) return;
    addTask(title, form.dataset.taskType);
    titleInput.value = "";
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

elements.pomodoroStart.addEventListener("click", startPomodoro);

elements.pomodoroPause.addEventListener("click", pausePomodoro);

elements.pomodoroReset.addEventListener("click", resetPomodoro);

window.addEventListener("load", () => {
  render();
  if (state.pomodoro.running) {
    startPomodoro();
  }
});
