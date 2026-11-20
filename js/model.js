(function () {
  'use strict';

  const ID = /^[0-9a-f]{32}$/;

  function validText(text) {
    return (
      typeof text === 'string' &&
      text.length >= 1 &&
      text.length <= 200 &&
      text === text.trim() &&
      !text.includes('\r') &&
      !text.includes('\n')
    );
  }

  function isTask(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    if (Object.keys(value).length !== 3) return false;
    if (typeof value.id !== 'string' || !ID.test(value.id)) return false;
    if (!validText(value.text)) return false;
    return typeof value.completed === 'boolean';
  }

  function isTaskList(value) {
    if (!Array.isArray(value)) return false;
    const seen = new Set();
    for (const task of value) {
      if (!isTask(task) || seen.has(task.id)) return false;
      seen.add(task.id);
    }
    return true;
  }

  function freshId(tasks) {
    const taken = new Set(tasks.map((task) => task.id));
    for (;;) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (!taken.has(id)) return id;
    }
  }

  function add(tasks, raw) {
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (!validText(text)) return tasks;
    return [...tasks, { id: freshId(tasks), text, completed: false }];
  }

  function toggle(tasks, id) {
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) return tasks;
    const next = tasks.slice();
    next[index] = { ...tasks[index], completed: !tasks[index].completed };
    return next;
  }

  function remove(tasks, id) {
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) return tasks;
    return tasks.filter((task) => task.id !== id);
  }

  window.Todo = { model: { isTaskList, add, toggle, remove } };
})();
