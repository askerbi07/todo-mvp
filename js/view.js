(function () {
  'use strict';

  function escapeText(value) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return value.replace(/[&<>"']/g, (ch) => entities[ch]);
  }

  function render(tasks) {
    if (tasks.length === 0) return '<li class="empty">No tasks yet.</li>';
    return tasks.map((task) => {
      const text = escapeText(task.text);
      return `<li class="task-row${task.completed ? ' is-done' : ''}" data-id="${task.id}">
        <label><input type="checkbox" data-action="toggle"${task.completed ? ' checked' : ''}>
          <span class="task-text">${text}</span></label>
        <button type="button" data-action="delete" aria-label="Delete: ${text}">Delete</button>
      </li>`;
    }).join('');
  }

  window.Todo.view = { render };
})();
