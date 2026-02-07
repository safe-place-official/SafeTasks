// SafeTasks: полностью статический менеджер задач с аналитикой.

const STORAGE_KEY = "safetasks-data";

const defaultState = {
  tasks: [],
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
  taskForm: document.getElementById("task-form"),
  taskTitle: document.getElementById("task-title"),
  taskType: document.getElementById("task-type"),
  taskList: document.getElementById("task-list"),
  completedCount: document.getElementById("completed-count"),
  pendingCount: document.getElementById("pending-count"),
  streakCount: document.getElementById("streak-count"),
  completionRate: document.getElementById("completion-rate"),
  periodSelect: document.getElementById("period-select"),
  dailyChart: document.getElementById("daily-chart"),
  weeklyChart: document.getElementById("weekly-chart"),
  achievementList: document.getElementById("achievement-list"),
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
  state.tasks = state.tasks.filter((task) => task.id !== id);
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
  elements.taskList.innerHTML = "";
  const sortedTasks = [...state.tasks].sort(compareTasks);
  sortedTasks.forEach((task) => {
    const item = document.createElement("li");
    item.className = "task-item";
    if (task.completed) {
      item.classList.add("completed");
    }
    item.innerHTML = `
      <input type="checkbox" ${task.completed ? "checked" : ""} aria-label="Выполнено" />
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

    elements.taskList.appendChild(item);
  });
}

function renderSummary() {
  elements.completedCount.textContent = completedTasks().length;
  elements.pendingCount.textContent = state.tasks.filter((task) => !task.completed).length;
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

elements.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = elements.taskTitle.value.trim();
  if (!title) return;
  addTask(title, elements.taskType.value);
  elements.taskTitle.value = "";
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
