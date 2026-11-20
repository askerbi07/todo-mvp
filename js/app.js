(function () {
  'use strict';

  const form = document.getElementById('task-form');
  const input = document.getElementById('task-text');
  const feedback = document.getElementById('feedback');
  const storageStatus = document.getElementById('storage-status');
  const list = document.getElementById('task-list');
  const model = window.Todo.model;

  let tasks = [];

  function paint() {
    list.innerHTML = window.Todo.view.render(tasks);
  }

  function commit(next) {
    if (next === tasks) return;
    tasks = next;
    storageStatus.textContent = window.Todo.storage.save(tasks);
    feedback.textContent = '';
    paint();
  }

  function onSubmit(event) {
    event.preventDefault();
    const next = model.add(tasks, input.value);
    if (next === tasks) {
      feedback.textContent = 'Enter 1–200 characters of task text.';
      input.focus();
      return;
    }
    commit(next);
    input.value = '';
    input.focus();
  }

  function onListAction(event) {
    if (!(event.target instanceof Element)) return;
    const toggle = event.type === 'change';
    const selector = toggle ? 'input[data-action="toggle"]' : 'button[data-action="delete"]';
    const control = event.target.closest(selector);
    if (!control || !list.contains(control)) return;
    const id = control.closest('li[data-id]')?.dataset.id;
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) return;
    commit(toggle ? model.toggle(tasks, id) : model.remove(tasks, id));
    const focusIndex = Math.min(index, tasks.length - 1);
    const nextControl = list.children[focusIndex]?.querySelector(selector);
    (nextControl || input).focus();
  }

  const loaded = window.Todo.storage.load();
  tasks = loaded.tasks;
  storageStatus.textContent = loaded.warning;
  paint();

  form.addEventListener('submit', onSubmit);
  list.addEventListener('change', onListAction);
  list.addEventListener('click', onListAction);
})();
