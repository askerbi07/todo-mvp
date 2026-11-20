# To-Do List · MVP architecture

## A. Architecture Decision Record (ADR) Summary

**Decision: use vanilla HTML, CSS and JavaScript with `localStorage`.** Persistence means that a person can refresh the same page in the same browser profile and see the last successfully saved list. Assume a modern browser, one active tab, a small list, and no requirement to recover data after the user clears site storage.

| Option | Where a change goes | What must run | Trade-off |
|---|---|---|---|
| Browser only | Replace one JSON value in origin-scoped storage | Static files | No network request; capacity and availability depend on the browser. No cross-device access. |
| Minimal backend | HTTP API writes a SQLite database on a persistent volume | Static client, server process and durable disk | Central data survives client storage loss, but requires API validation, failure handling and deployment. Without user identity it would be a shared list. |

- Refresh persistence needs neither a server nor a shared database.
- One snapshot is simple to validate on load and save after each accepted change. Synchronous writes are acceptable for this small list.
- A form and one list need no framework, package install, transpiler or build pipeline.
- Classic deferred scripts run from a file or a static host. Use HTTP(S) for predictable persistence: browsers do not guarantee consistent `localStorage` behavior for `file:` URLs.

## B. High-Level Architecture

```text
index.html + styles.css                 (shell and layout)
         |
         v
form submit / list change or click
         |
         v
app.js  -- current tasks + intent --> model.js
  |     <-- next tasks or no-op ----- (immutable transitions)
  |
  +-- 1. adopt next tasks in memory
  +-- 2. storage.js: serialize and attempt one localStorage write
  +-- 3. view.js: tasks -> escaped list markup (pure)
  +-- 4. replace list contents; report save result; restore focus
```

**Startup:** deferred scripts execute in document order. The controller loads once through storage, which uses the model to validate the entire snapshot. The controller renders the result and binds listeners once. The in-memory array is authoritative until reload; the DOM is never read back as a task database. A failed save does not roll back a visible action. The next accepted change retries with the *whole current list*.

## C. File & Folder Structure

```text
.
├── index.html             # Static semantic shell and ordered entry scripts
├── styles.css             # Responsive layout, wrapping, focus and completion styles
├── js/
│   ├── model.js           # Task validation and immutable list operations
│   ├── storage.js         # Snapshot I/O and recovery policy
│   ├── view.js            # Pure list-to-markup projection
│   └── app.js             # Startup, event wiring, state ownership and DOM writes
└── docs/
    └── ARCHITECTURE.md    # This implementation contract
```

## D. Data Model

| Task field | Type | Contract |
|---|---|---|
| `id` | string | Exactly 32 lowercase hex characters; unique within the list; never changes. Generate 16 random bytes with `crypto.getRandomValues`, encode each as two hex digits, retry on collision. |
| `text` | string | Plain single-line text. Trim with JS `trim()` before adding. Stored value must equal its trimmed form, contain no CR/LF and have length 1–200 inclusive in JS UTF-16 code units. Duplicate descriptions are valid. |
| `completed` | boolean | Initially `false`; toggling flips only this field. |

No timestamp: insertion order is the display order, oldest first. Append on add; do not reorder on toggle. The version lives in the **key** `simple-todo.tasks.v1`; the **value** is a JSON-encoded array, not an object with a `tasks` property:

```json
[
  {"id":"1259fcaa7a654dd282040b0251436e87","text":"Buy milk","completed":false}
]
```

Missing key and `[]` both mean an empty list. Require every entry to be a non-null object with exactly the three specified own fields. Reject the entire snapshot on bad shape, invalid field, duplicate ID or invalid JSON; do not quietly display a partial list. Do not delete the bad value at startup. Replace it only when a subsequent user change saves successfully.

## E. Module Contracts

**Linkage:** use classic scripts with `defer`, no `async`, `type="module"`, imports, fetches or inline handlers. Each JS file is a strict-mode IIFE. `model.js` initializes `window.Todo = { model: ... }`; `storage.js` and `view.js` attach `storage` and `view` respectively. `app.js` runs last. Namespace initialization is the only global setup. Type notation below documents JS, not TypeScript source.

### `index.html` — DOM interface; no exports

Input: browser navigation. Output: a `main` with `h1`, form `#task-form`, visible label for single-line input `#task-text` (`maxlength="200"`), submit button **Add**, `p#feedback[role=status]`, `p#storage-status[role=status]`, and `ul#task-list`, in that order (input and Add inside form). `#feedback` is for input errors; storage warnings have their own node so one cannot erase the other. No `required` attribute: let the controller handle blank submissions consistently. Set `lang="en"`, charset, title and viewport. Effects: loads relative `./styles.css`, then scripts in order `model`, `storage`, `view`, `app` from `./js/`.

### `styles.css` — presentation interface; no exports

Input: shell selectors above and `.task-row`, `.task-text`, `.is-done`, `.empty` from G. Output: centered fluid main (max width 40rem), padded page, legible type, visible keyboard focus, completed text struck through. Row layout: label and Delete button; allow label and text to shrink (`min-width: 0`) and break long words (`overflow-wrap: anywhere`). Wrap form controls on narrow screens. Effects: presentation only; never hide checkboxes or focus indicators.

### `js/model.js` — `Todo.model`

- `isTaskList(value: unknown): boolean` — total validator for decoded JSON under D; no coercion, mutation or I/O. Use a local `Set` for IDs.
- `add(tasks: Task[], raw: string): Task[]` — trim, validate text, return original reference on invalid input; otherwise append a fresh incomplete task to a new array. Only nondeterminism is ID generation. No storage or DOM access.
- `toggle(tasks: Task[], id: string): Task[]` — if found, return a new array with a new object for the flipped task; reuse unaffected tasks. Missing ID: return original reference.
- `remove(tasks: Task[], id: string): Task[]` — if found, return new array without that ID; otherwise return original reference.

All transitions accept valid `tasks` as a precondition. No other module changes task fields or array elements.

### `js/storage.js` — `Todo.storage`

- `load(): {tasks: Task[], warning: string}` — read only this key. Return validated tasks and an empty warning on success; otherwise follow G. Never write during load.
- `save(tasks: Task[]): string` — given valid state, overwrite only this key. Return empty string on success or a user-facing warning on failure. Both operations are synchronous; no throwing for blocked storage, parse errors or quota exhaustion.

### `js/view.js` — `Todo.view`

- `render(tasks: Task[]): string` — return only the HTML **inside** the list. For an empty list, return one inert empty-state `li`. Otherwise emit one row per task as in G. Deterministic; no DOM, persistence, listeners, mutation or random IDs. `escapeText` is private.

### `js/app.js` — controller; no exports

Inputs: DOM contract, `Todo` modules and native events. Outputs: visible list, status text and focus. Effects: single private `tasks` binding, storage calls, listeners and DOM writes. Private interfaces:

- `paint(): void` — set `list.innerHTML = Todo.view.render(tasks)`; no other string may reach that sink. Set feedback/status via `textContent` only.
- `commit(next: Task[]): void` — identical reference: no effect. Otherwise adopt `next`, call `save`, assign returned string to storage status (including empty string), clear input feedback and paint once.
- `onSubmit(event: SubmitEvent): void` — prevent navigation, call `add`; if unchanged, show `Enter 1–200 characters of task text.`, focus input and keep its value. Otherwise commit, clear input, focus input.
- `onListAction(event: Event): void` — use G. Restore focus after replacement to the toggled checkbox, or after delete to the next row’s Delete button (previous if last; input if list empty).

On startup, bind shell nodes once, call `load`, assign state and storage warning, paint, then attach submit and delegated list handlers. No save on boot, rejected input or stale ID. No router, timers or cross-tab synchronization.

### `docs/ARCHITECTURE.md` — handoff contract; no exports

Input: developer or agent reads this file. Output: implementation instructions and acceptance criteria. No runtime side effects; not loaded by the app.

## F. Implementation Plan (Step-by-Step)

Save this document first. In OpenCode, run the following prompts in order from the repository root. Each quoted block is a complete prompt; each implementation step creates just one file of at most 100 lines, without placeholders or changes to earlier files.

- [ ] **1 · Shell**
  > Read docs/ARCHITECTURE.md sections C and E. Create only index.html (≤100 lines). Implement the exact semantic shell, IDs, labels, input limit, live status nodes, stylesheet and deferred classic script paths/order. No inline JS or CSS. Verify all references against C before finishing.
- [ ] **2 · Layout**
  > Read docs/ARCHITECTURE.md sections E, G and H. Create only styles.css (≤100 lines). Style the specified shell and the exact row markup from G. Use fluid widths, wrap the form and long text, keep Delete reachable at 320px, visibly strike completed text and preserve keyboard focus outlines. No fonts or other external assets.
- [ ] **3 · Model**
  > Read docs/ARCHITECTURE.md sections D and E. Create only js/model.js (≤100 lines). Implement the exact namespace, validator and three transitions. Share the text validation logic between add and snapshot validation without trimming invalid stored text into validity. Check ID uniqueness on generation and load. Verify the no-op reference contract; do not touch storage or DOM.
- [ ] **4 · Persistence**
  > Read docs/ARCHITECTURE.md sections D, E and G. Create only js/storage.js (≤100 lines). Use G's storage implementation inside its specified wrapper and expose exactly load and save on Todo.storage. Keep localStorage access inside try blocks. Verify that reading a malformed snapshot performs no write.
- [ ] **5 · View**
  > Read docs/ARCHITECTURE.md sections D, E and G. Create only js/view.js (≤100 lines). Wrap G's render and escapeText in a strict IIFE, exposing only render on Todo.view. Preserve selectors and escaping, render actual checkbox checked state, and verify render([]) returns an inert li. No DOM access.
- [ ] **6 · Controller**
  > Read docs/ARCHITECTURE.md sections B, E and G. Create only js/app.js (≤100 lines) in a strict IIFE. Bind the exact DOM IDs, initialize from load, implement paint, commit and onSubmit, and integrate G's delegated handler and listeners. Preserve warning, no-op and focus rules. Verify boot has one load and zero saves, and each accepted action has exactly one save attempt and one paint.
- [ ] **7 · Acceptance gate (no code)**
  > Read docs/ARCHITECTURE.md section H. Review the six runtime files against the contracts; run the manual checklist if a browser is available. Report each case as passed, failed or not run. For failures name the owning file and the observed difference. Do not modify files or claim unexecuted tests passed.

## G. Critical Code Snippets

These are module bodies or controller excerpts; use the wrappers from E. Only the controller writes rendered HTML into the DOM.

### Snapshot boundary (`storage.js`)

```js
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
```

### Delegation (`app.js`)

`list` and `input` are the persistent shell elements; `model` is `window.Todo.model`. Listen for native checkbox **change**, not both click and change for the same action.

```js
function onListAction(event) {
  if (!(event.target instanceof Element)) return;
  const toggle = event.type === 'change';
  const selector = toggle ? 'input[data-action="toggle"]' : 'button[data-action="delete"]';
  const control = event.target.closest(selector);
  if (!control || !list.contains(control)) return;
  const id = control.closest('li[data-id]')?.dataset.id;
  const index = tasks.findIndex(task => task.id === id);
  if (index < 0) return;
  commit(toggle ? model.toggle(tasks, id) : model.remove(tasks, id));
  const focusIndex = Math.min(index, tasks.length - 1);
  const nextControl = list.children[focusIndex]?.querySelector(selector);
  (nextControl || input).focus();
}
list.addEventListener('change', onListAction);
list.addEventListener('click', onListAction);
```

### Pure render (`view.js`)

`id` is safe in a quoted attribute because D restricts it to hex at **both** creation and load. Task text is never markup. A wrapping label supplies the checkbox’s accessible name without constructing a DOM ID.

```js
function escapeText(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, ch => entities[ch]);
}
function render(tasks) {
  if (tasks.length === 0) return '<li class="empty">No tasks yet.</li>';
  return tasks.map(task => {
    const text = escapeText(task.text);
    return `<li class="task-row${task.completed ? ' is-done' : ''}" data-id="${task.id}">
      <label><input type="checkbox" data-action="toggle"${task.completed ? ' checked' : ''}>
        <span class="task-text">${text}</span></label>
      <button type="button" data-action="delete" aria-label="Delete: ${text}">Delete</button>
    </li>`;
  }).join('');
}
window.Todo.view = { render };
```

## H. Testing Checklist

Serve the root with `npx serve .` and open the printed address. Use a disposable browser profile on the **same origin and port** throughout. Start with only `simple-todo.tasks.v1` removed in DevTools, then reload. Never clear unrelated keys.

| Check | Action | Expected result |
|---|---|---|
| First load | Open with key absent. | “No tasks yet.”; no warning; key still absent. |
| Empty | Press Add with empty input, then with three spaces. | Input error; focus stays on input; no task or storage write. |
| Add/order | Enter `  Buy milk  ` with Enter, then `Buy milk` with Add. | Two rows, trimmed text, distinct IDs, unchecked; input clears; error clears. |
| Long text | Paste 201 ASCII letters into the empty input, submit, inspect persisted text at 320px width. | Native maxlength admits only 200; saved length 200; long word wraps; Delete visible; no horizontal page scroll. `Todo.model.add([], 'a'.repeat(201))` returns an empty list, not a truncated task. |
| Literal text | Add `<b>milk & "tea"</b>`. | Characters display literally; no bold element; Delete label includes the literal text. |
| Toggle both ways | Use Space on the second checkbox; refresh; click its label. | Only second row becomes checked and struck through; survives refresh; one label click unchecks exactly once. Keyboard focus returns to the toggled control. |
| Delete/refresh | Delete one of the duplicate descriptions; refresh. Delete remaining tasks; refresh again. | Only targeted ID disappears, order and flags preserved; last deletion saves `[]` and shows empty state. |
| Corrupt snapshot | Set the key to `{broken` in DevTools; reload. Repeat with valid JSON `[{"completed":"false"}]`. | Empty list and invalid-list warning; raw key unchanged on load. Add `Recovered`; warning clears, key becomes valid array; refresh shows just `Recovered`. |
| Unavailable write | In DevTools run `Storage.prototype.setItem = () => { throw new Error('test'); }`; add a task. Reload (restores prototype). | Task appears with memory-only warning before refresh; reload restores last successful snapshot, not failed change. |
| File launch | Open `index.html` directly, add/toggle/delete. | Scripts, layout and controls work without fetching modules. Refresh retains successful writes where file storage is supported; blocked access must not crash startup. |

## I. Deployment

1. Commit the tree in C with `index.html` at repository root and push to `main` in a GitHub repository with Pages available.
2. In **Settings → Pages → Build and deployment**, select **Deploy from a branch**, `main`, `/(root)`, and **Save**. No build command, secrets or server configuration.
3. Open the published URL shown in Pages settings. Verify CSS and JS load under the repository subpath; root-absolute `/js/...` paths would incorrectly target the domain root.
4. Add a task, toggle it and refresh on that URL. Local development data does not migrate to the deployed origin. Other apps on the same origin must not reuse `simple-todo.tasks.v1`.

## Handoff Notes for Local LLMs

- Keep classic deferred scripts in dependency order. ES module loading can fail from `file:` even when it works on localhost.
- Never mutate a prior array or task. Use the returned reference to distinguish a real change from a no-op.
- Guard the storage getter as well as parsing and writing. An empty recovery view is not permission to overwrite a saved value on boot.
- Treat saved data as untrusted. Validate the entire array, escape text in every output context shown, and never render raw input.
- Bind listeners to the persistent form and list, not to rows. Repaint replaces row nodes, so restore focus to a live control afterward.
