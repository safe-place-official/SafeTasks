const STORAGE_KEY = "safetasks-minimal";

const elements = {
  form: document.getElementById("task-form"),
  input: document.getElementById("task-input"),
  list: document.getElementById("task-list"),
  count: document.getElementById("task-count"),
  empty: document.getElementById("empty-state"),
};

let tasks = loadTasks();

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function formatCount(count) {
  if (count === 1) {
    return "1 задача";
  }
  if (count > 1 && count < 5) {
    return `${count} задачи`;
  }
  return `${count} задач`;
}

function renderTasks() {
  elements.list.innerHTML = "";
  tasks.forEach((task) => {
    const item = document.createElement("li");
    item.className = "task-item";
    if (task.completed) {
      item.classList.add("is-complete");
    }

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.dataset.id = task.id;
    checkbox.className = "task-toggle";

    const title = document.createElement("span");
    title.textContent = task.title;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "task-remove";
    remove.textContent = "Удалить";
    remove.dataset.id = task.id;

    item.append(checkbox, title, remove);
    elements.list.append(item);
  });

  elements.count.textContent = formatCount(tasks.length);
  elements.empty.hidden = tasks.length > 0;
}

function addTask(title) {
  tasks.unshift({
    id: crypto.randomUUID(),
    title,
    completed: false,
  });
  saveTasks();
  renderTasks();
}

function toggleTask(id) {
  tasks = tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed } : task,
  );
  saveTasks();
  renderTasks();
}

function removeTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  saveTasks();
  renderTasks();
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = elements.input.value.trim();
  if (!title) {
    return;
  }
  addTask(title);
  elements.input.value = "";
  elements.input.focus();
});

elements.list.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (target.classList.contains("task-remove")) {
    removeTask(target.dataset.id);
  }
});

elements.list.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  if (target.classList.contains("task-toggle")) {
    toggleTask(target.dataset.id);
  }
});

renderTasks();
