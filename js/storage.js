(function () {
  'use strict';

  const KEY = 'simple-todo.tasks.v1';

  function load() {
    let raw;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch {
      return { tasks: [], warning: 'Storage unavailable. Changes may not survive refresh.' };
    }
    if (raw === null) return { tasks: [], warning: '' };
    try {
      const tasks = JSON.parse(raw);
      if (window.Todo.model.isTaskList(tasks)) return { tasks, warning: '' };
    } catch { /* Invalid JSON uses the same recovery path as an invalid shape. */ }
    return { tasks: [], warning: 'Saved list is invalid. Your next saved change will replace it.' };
  }

  function save(tasks) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(tasks));
      return '';
    } catch {
      return 'Change is in memory only. It may be lost on refresh.';
    }
  }

  window.Todo.storage = { load, save };
})();
