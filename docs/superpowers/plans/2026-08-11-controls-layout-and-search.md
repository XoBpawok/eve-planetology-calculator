# Перекомпонування панелей контролів + пошук у списках Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Об'єднати панель "Абонплата" в "Комісія продажу" та панель "Пальне" в "Параметри видобутку", розширити панель "Місце розташування" вдвічі з двоколонковим внутрішнім layout, і додати пошук над списками Регіони/Сузір'я/Ресурси.

**Architecture:** Чисто UI-шар. `index.html` — переміщення блоків розмітки між панелями без зміни `id` елементів (нуль змін у логіці `app.js`, що читає їх за ID). `style.css` — нові класи `.panel--span2`, `.panel__columns`, `.panel__divider`, `.checklist-search`. `app.js` — одна нова функція `applyChecklistSearch` + прив'язка `input`-подій на три нові поля пошуку + виклик після кожного `renderChecklistOptions` для контейнерів з пошуком.

**Tech Stack:** Vanilla JS (ES modules), CSS Grid, no build step, no framework. Тести — `node --test` для чистих функцій у `src/*.mjs` (цей план їх не чіпає).

## Global Constraints

- ID елементів (`subscription-enabled`, `subscription-millions`, `fuel-enabled`, `fuel-modules`) НЕ змінюються — `app.js` посилається на них за ID.
- Жодних змін у `src/*.mjs` (optimizer/economics/render/csv) чи їхніх тестах.
- Пошук — суто візуальний фільтр (`display: none`), не знімає чекбокси і не впливає на `checklistValues`/`checkedChecklistValues`.
- Кнопки "Всі"/"Жодного" продовжують діяти на весь список, включно з прихованими пошуком пунктами.
- Дизайн-спек: `docs/superpowers/specs/2026-08-11-controls-layout-and-search-design.md`.

---

## File Structure

- Modify `index.html` — перенести блоки "Абонплата" і "Пальне", обгорнути Регіони/Сузір'я у `.panel__columns`, додати `<input class="checklist-search">` над трьома списками, додати `<hr class="panel__divider">` де потрібно.
- Modify `style.css` — додати `.panel--span2`, `.panel__columns`, `.panel__divider`, `.checklist-search`, оновити mobile-медіа-запит для стеку колонок.
- Modify `app.js` — `applyChecklistSearch`, прив'язка подій, виклики після рендерів.

Немає нових файлів і немає змін у `src/`.

---

### Task 1: HTML — перенесення панелей "Абонплата" і "Пальне"

**Files:**
- Modify: `index.html:16-113`

**Interfaces:**
- Produces: розмітка з тими самими ID (`subscription-enabled`, `subscription-millions`, `fuel-enabled`, `fuel-modules`, `commission-enabled`, `commission-custom`, `planets-count`, `drills-count`) — Task 2/3 (CSS) і подальші кроки app.js покладаються на незмінність цих ID.

- [ ] **Step 1: Перенести вміст "Пальне" в кінець панелі "Параметри видобутку"**

Замінити блок (`index.html:16-26` — панель "Параметри видобутку") і видалити панель "Пальне" (`index.html:103-113`). Новий вміст першої панелі:

```html
    <div class="panel">
      <h2 class="panel__title">Параметри видобутку</h2>
      <div class="field">
        <label for="planets-count">Кількість планет</label>
        <input type="number" id="planets-count" min="1" value="6" />
      </div>
      <div class="field">
        <label for="drills-count">Кількість бурів на планету</label>
        <input type="number" id="drills-count" min="1" value="26" />
      </div>
      <hr class="panel__divider" />
      <label class="toggle">
        <input type="checkbox" id="fuel-enabled" checked />
        <span>Враховувати витрати на пальне</span>
      </label>
      <div class="field">
        <label for="fuel-modules">Кількість модулів (1 або 2)</label>
        <input type="number" id="fuel-modules" min="1" max="2" value="2" />
      </div>
    </div>
```

Панель "Пальне" (окремий `<div class="panel">...</div>` з `<h2 class="panel__title">Пальне</h2>`) видаляється повністю з місця, де вона була (після панелі "Абонплата").

- [ ] **Step 2: Перенести вміст "Абонплата" в кінець панелі "Комісія продажу"**

Замінити блок панелі "Комісія продажу" (`index.html:66-89`) і видалити панель "Абонплата" (`index.html:91-101`). Новий вміст:

```html
    <div class="panel">
      <h2 class="panel__title">Комісія продажу</h2>
      <label class="toggle">
        <input type="checkbox" id="commission-enabled" checked />
        <span>Враховувати комісію продажу</span>
      </label>
      <div class="radio-group">
        <label class="radio">
          <input type="radio" name="commission-rate" value="0.08" />
          <span>Контракт (8%)</span>
        </label>
        <label class="radio">
          <input type="radio" name="commission-rate" value="0.13" />
          <span>Ринок (13%)</span>
        </label>
        <label class="radio">
          <input type="radio" name="commission-rate" value="custom" checked />
          <span>Корпорація (%)</span>
        </label>
      </div>
      <div class="field">
        <input type="number" id="commission-custom" min="0" max="100" step="0.1" value="25" />
      </div>
      <hr class="panel__divider" />
      <label class="toggle">
        <input type="checkbox" id="subscription-enabled" checked />
        <span>Враховувати абонплату</span>
      </label>
      <div class="field">
        <label for="subscription-millions">Абонплата (млн ISK / місяць)</label>
        <input type="number" id="subscription-millions" min="0" value="500" />
      </div>
    </div>
```

Після цих двох кроків у `.controls` лишається 4 панелі: "Параметри видобутку" (+пальне), "Місце розташування", "Ресурси", "Комісія продажу" (+абонплата) — у цьому порядку.

- [ ] **Step 3: Візуально перевірити в браузері**

Відкрити `index.html` (напр. `python3 -m http.server` у корені репо й перейти в браузері), переконатись:
- Панелей "Абонплата" і "Пальне" як окремих блоків більше немає.
- "Пальне" видно всередині "Параметри видобутку", "Абонплата" — всередині "Комісія продажу".
- Значення трьох нових інпутів як і раніше впливають на розрахунок (зняти/поставити чекбокс "Враховувати абонплату" чи "Враховувати витрати на пальне" — результат перераховується).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: merge subscription-fee panel into commission, fuel panel into extraction params"
```

---

### Task 2: CSS — роздільник, широка панель "Місце розташування", двоколонковий layout

**Files:**
- Modify: `style.css` (додати нові правила після `.field + .field` — приблизно `style.css:265`; секцію grid-модифікаторів для `.panel` — приблизно після `style.css:212`)
- Modify: `index.html` (панель "Місце розташування", `index.html:28-50` до Task 1 змін — застосувати клас і обгортку)

**Interfaces:**
- Consumes: клас `.panel` (`style.css:195`), `.field` (`style.css:257`), `.field--grow` (`style.css:271`), `.checklist` (`style.css:334`).
- Produces: класи `.panel--span2`, `.panel__columns`, `.panel__divider` — використовуються в `index.html` панелями "Місце розташування", "Параметри видобутку", "Комісія продажу".

- [ ] **Step 1: Додати CSS для роздільника і широкої панелі**

У `style.css`, одразу після блоку `.field + .field { margin-top: 0.1rem; }` (біля `style.css:263-265`), додати:

```css
.panel--span2 {
  grid-column: span 2;
}

.panel__columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

.panel__divider {
  border: none;
  border-top: 1px solid var(--border);
  margin: 0.3rem 0;
}
```

- [ ] **Step 2: Стек колонок на мобільних**

У медіа-запиті `@media (max-width: 640px)` (`style.css:448-454`) додати правило поруч із наявним, щоб `.panel__columns` не стискав дві колонки в вузькі стовпчики на телефоні:

```css
@media (max-width: 640px) {
  #region-select,
  #constellation-select,
  #resource-select {
    max-height: 16rem;
  }

  .panel__columns {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Застосувати класи в `index.html` до панелі "Місце розташування"**

Замінити блок панелі "Місце розташування" (у поточному файлі — `index.html:28-50`; якщо Task 1 вже виконано, знайти цей блок за заголовком `<h2 class="panel__title">Місце розташування</h2>`) на:

```html
    <div class="panel panel--span2">
      <h2 class="panel__title">Місце розташування</h2>
      <div class="panel__columns">
        <div class="field field--grow">
          <div class="checklist-label-row">
            <label>Регіони</label>
            <div class="checklist-actions">
              <button type="button" class="link-btn" data-checklist="region-select" data-action="all">Всі</button>
              <button type="button" class="link-btn" data-checklist="region-select" data-action="none">Жодного</button>
            </div>
          </div>
          <input type="search" class="checklist-search" data-checklist="region-select" placeholder="Пошук…" aria-label="Пошук: Регіони" />
          <div class="checklist" id="region-select" role="group" aria-label="Регіони"></div>
        </div>
        <div class="field field--grow">
          <div class="checklist-label-row">
            <label>Сузір'я</label>
            <div class="checklist-actions">
              <button type="button" class="link-btn" data-checklist="constellation-select" data-action="all">Всі</button>
              <button type="button" class="link-btn" data-checklist="constellation-select" data-action="none">Жодного</button>
            </div>
          </div>
          <input type="search" class="checklist-search" data-checklist="constellation-select" placeholder="Пошук…" aria-label="Пошук: Сузір'я" />
          <div class="checklist" id="constellation-select" role="group" aria-label="Сузір'я"></div>
        </div>
      </div>
    </div>
```

- [ ] **Step 4: Візуально перевірити в браузері**

Перезавантажити сторінку, переконатись:
- Панель "Місце розташування" займає ширину двох звичайних панелей.
- Регіони і Сузір'я відображаються поруч (дві колонки), обидва списки видимо вищі, ніж були раніше (використовують `field--grow`).
- На вузькому вікні (звузити браузер < 640px або DevTools device toolbar) колонки стають одна під одною.
- Поля пошуку поки що нічого не роблять (JS буде в Task 4) — це очікувано на цьому кроці.

- [ ] **Step 5: Commit**

```bash
git add index.html style.css
git commit -m "feat: widen location panel to a two-column layout"
```

---

### Task 3: CSS — стилі поля пошуку `.checklist-search`

**Files:**
- Modify: `style.css` (додати після секції `.checklist-actions`/`.link-btn`, приблизно `style.css:311-332`, перед `.checklist {` на `style.css:334`)
- Modify: `index.html` (панель "Ресурси", `index.html:52-64` до Task 1 змін — додати поле пошуку)

**Interfaces:**
- Consumes: `--bg-field`, `--border`, `--cyan`, `--text` CSS custom properties (вже використовуються в `input[type='number']`, `style.css:285-300`).
- Produces: клас `.checklist-search`, `data-checklist` атрибут (значення = `id` контейнера чекліста) — Task 4 (`app.js`) читає обидва для прив'язки логіки фільтрації.

- [ ] **Step 1: Додати стилі**

У `style.css`, одразу перед `.checklist {` (`style.css:334`), додати:

```css
.checklist-search {
  background: var(--bg-field);
  border: 1px solid var(--border);
  color: var(--text);
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.85rem;
  font-weight: 500;
  padding: 0.3rem 0.5rem;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.checklist-search:focus {
  border-color: var(--cyan);
  box-shadow: 0 0 0 1px var(--cyan);
}

.checklist-search::-webkit-search-cancel-button {
  cursor: pointer;
}
```

- [ ] **Step 2: Додати поле пошуку над списком "Ресурси"**

У `index.html`, у блоці панелі "Ресурси" (заголовок `<h2 class="panel__title">Ресурси</h2>`), між `.checklist-label-row` і `<div class="checklist" id="resource-select" ...>`, вставити:

```html
        <input type="search" class="checklist-search" data-checklist="resource-select" placeholder="Пошук…" aria-label="Пошук: Ресурси для видобутку" />
```

(Поля пошуку для `region-select` і `constellation-select` вже додані в Task 2 Step 3.)

- [ ] **Step 3: Візуально перевірити стилі**

Перезавантажити сторінку, переконатись, що три поля пошуку виглядають консистентно з іншими інпутами (колір фону, рамка, фокус-стан), розташовані одразу над відповідним списком.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "style: add search input styling above region/constellation/resource lists"
```

---

### Task 4: JS — логіка фільтрації списків пошуком

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `els.regionSelect`, `els.constellationSelect`, `els.resourceSelect` (`app.js:50-52`); `renderChecklistOptions(container, ...)` (`app.js:151`); `populateConstellationOptions()` (`app.js:274`); `populateFilterOptions()` (`app.js:290`); `resetFiltersToDefault()` (`app.js:310`); `refreshResourceIcons()` (`app.js:195`); `populatePriceList()` викликається окремо і не чіпає чеклісти — ігнорувати.
- Produces: `applyChecklistSearch(container)` — приймає DOM-контейнер чекліста (напр. `els.regionSelect`), нічого не повертає; ховає/показує `.checklist__item` всередині нього за поточним значенням сусіднього `.checklist-search[data-checklist="<container.id>"]`.

- [ ] **Step 1: Додати `checklistSearch` елементи в `els`**

У `app.js`, в об'єкті `els` (`app.js:47-66`), додати три поля одразу після `resourceSelect`:

```js
  regionSelect: document.getElementById('region-select'),
  constellationSelect: document.getElementById('constellation-select'),
  resourceSelect: document.getElementById('resource-select'),
  regionSearch: document.querySelector('.checklist-search[data-checklist="region-select"]'),
  constellationSearch: document.querySelector('.checklist-search[data-checklist="constellation-select"]'),
  resourceSearch: document.querySelector('.checklist-search[data-checklist="resource-select"]'),
```

- [ ] **Step 2: Написати `applyChecklistSearch`**

У `app.js`, одразу після функції `renderChecklistOptions` (закінчується на `app.js:190`, перед коментарем `// Patches icons...` на `app.js:192`), додати:

```js
// Purely visual: hides checklist rows that don't match the adjacent search
// input, without touching which checkboxes are checked. Re-run after any
// renderChecklistOptions() call on a container that has a search input,
// since that rebuilds the DOM from scratch.
function applyChecklistSearch(container) {
  const search = document.querySelector(`.checklist-search[data-checklist="${container.id}"]`);
  if (!search) return;
  const query = search.value.trim().toLowerCase();
  container.querySelectorAll('.checklist__item').forEach((item) => {
    const label = item.querySelector('.checklist__label').textContent.toLowerCase();
    item.style.display = query && !label.includes(query) ? 'none' : '';
  });
}
```

- [ ] **Step 3: Прив'язати `input`-подію на трьох полях пошуку**

У функції `attachListeners` (`app.js:453-521`), одразу перед `els.filtersResetAll.addEventListener(...)` (`app.js:486`), додати:

```js
  [els.regionSearch, els.constellationSearch, els.resourceSearch].forEach((input) => {
    if (!input) return;
    input.addEventListener('input', () => {
      const container = document.getElementById(input.dataset.checklist);
      applyChecklistSearch(container);
    });
  });
```

- [ ] **Step 4: Повторно застосовувати фільтр після кожної перебудови списку**

Три місця в `app.js`, де `renderChecklistOptions` перебудовує один із трьох контейнерів, повинні викликати `applyChecklistSearch` одразу після:

У `populateConstellationOptions` (`app.js:274-288`) — дві гілки, обидві закінчуються викликом `renderChecklistOptions(els.constellationSelect, ...)`. Змінити функцію на:

```js
function populateConstellationOptions() {
  const selectedRegions = checkedChecklistValues(els.regionSelect);
  const constellations = constellationsForRegions(selectedRegions);
  if (pendingSavedConstellations) {
    const saved = pendingSavedConstellations;
    pendingSavedConstellations = null;
    renderChecklistOptions(els.constellationSelect, constellations, (value) => saved.has(value));
    applyChecklistSearch(els.constellationSelect);
    return;
  }
  const previousValues = checklistValues(els.constellationSelect);
  const previouslyChecked = new Set(checkedChecklistValues(els.constellationSelect));
  // Only items the user explicitly unchecked stay excluded; anything new defaults to checked.
  const previouslyExcluded = new Set(previousValues.filter((v) => !previouslyChecked.has(v)));
  renderChecklistOptions(els.constellationSelect, constellations, (value) => !previouslyExcluded.has(value));
  applyChecklistSearch(els.constellationSelect);
}
```

У `populateFilterOptions` (`app.js:290-308`) — після `renderChecklistOptions(els.regionSelect, ...)` і після виклику `renderChecklistOptions(els.resourceSelect, ...)`. Змінити функцію на:

```js
function populateFilterOptions() {
  const regions = [...new Set(state.rows.map((r) => r.region))].sort();
  const savedRegions = state.savedFilters?.regions ? new Set(state.savedFilters.regions) : null;
  renderChecklistOptions(els.regionSelect, regions, (v) => (savedRegions ? savedRegions.has(v) : true));
  applyChecklistSearch(els.regionSelect);
  if (state.savedFilters?.constellations) {
    pendingSavedConstellations = new Set(state.savedFilters.constellations);
  }
  populateConstellationOptions();
  const resourceNames = [...new Set(state.rows.map((r) => r.resource))].sort();
  const savedResources = state.savedFilters?.resources ? new Set(state.savedFilters.resources) : null;
  const savedLimits = state.savedFilters?.resourceLimits || {};
  renderChecklistOptions(
    els.resourceSelect,
    resourceNames,
    (v) => (savedResources ? savedResources.has(v) : true),
    (v) => state.resourceIcons.get(v),
    (v) => (Object.prototype.hasOwnProperty.call(savedLimits, v) ? savedLimits[v] : null)
  );
  applyChecklistSearch(els.resourceSelect);
}
```

У `resetFiltersToDefault` (`app.js:310-318`) — після кожен з трьох `renderChecklistOptions` calls. Змінити функцію на:

```js
function resetFiltersToDefault() {
  const regions = [...new Set(state.rows.map((r) => r.region))].sort();
  renderChecklistOptions(els.regionSelect, regions, () => true);
  applyChecklistSearch(els.regionSelect);
  const constellations = constellationsForRegions([]);
  renderChecklistOptions(els.constellationSelect, constellations, () => true);
  applyChecklistSearch(els.constellationSelect);
  const resourceNames = [...new Set(state.rows.map((r) => r.resource))].sort();
  renderChecklistOptions(els.resourceSelect, resourceNames, () => true, (v) => state.resourceIcons.get(v), () => null);
  applyChecklistSearch(els.resourceSelect);
  computeAndRender();
}
```

І в `refreshResourceIcons` (`app.js:195-208`) DOM не перебудовується (іконки додаються in-place без очищення `innerHTML`), тож виклик `applyChecklistSearch` там не потрібен — видимість рядків, встановлена попереднім пошуком, не скидається.

- [ ] **Step 5: Запустити наявні тести — переконатись, що нічого не зламано**

Run: `node --test src/*.test.mjs`
Expected: усі тести проходять (PASS) — цей план не чіпає жоден файл у `src/`.

- [ ] **Step 6: Ручна перевірка в браузері**

Перезавантажити сторінку і перевірити:
- Ввести текст у поле пошуку над "Регіони" — список звужується до збігів (case-insensitive substring), інші поля пошуку на це не впливають.
- Зняти чекбокс у прихованому пошуком пункті неможливо (він прихований) — але якщо він вже був checked, то й лишається checked після очищення пошуку (текст стирається → пункт знову з'являється, стан чекбокса збережений).
- Кнопка "Всі" при активному пошуку (частина списку прихована) все одно позначає геть усі пункти регіону/сузір'я/ресурсу, включно з прихованими — перевірити очищенням пошуку одразу після кліку "Всі".
- Зміна регіону (чекбокс) перебудовує список сузір'їв — якщо в полі пошуку сузір'їв щось введено, фільтр лишається застосованим до нового списку.
- "Скинути фільтри" (кнопка у хедері) не ламає відображення списків при активному тексті в пошуку.

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "feat: filter region/constellation/resource checklists by search text"
```

---

## Self-Review Notes

- **Spec coverage:** п.1 (Абонплата→Комісія) — Task 1 Step 2; п.2 (Пальне→Параметри видобутку, за уточненням користувача) — Task 1 Step 1; п.3 (span2 + дві колонки) — Task 2; п.4 (пошук: розмітка+стилі — Task 3, поведінка — Task 4); "Поза межами" (без фільтра систем, без змін у `src/`) — жодна задача цього не порушує.
- **Type consistency:** `applyChecklistSearch(container)` викликається з тим самим сигнатурним контрактом (DOM-елемент контейнера чекліста) у Task 4 Steps 3-4 і визначається в Step 2 — узгоджено. `data-checklist` на трьох `.checklist-search` інпутах (Task 2 Step 3, Task 3 Step 2) відповідає `container.id` трьох чеклістів — узгоджено з тим, як `applyChecklistSearch` і обробник `input` шукають один одного.
- **Placeholder scan:** усі кроки містять повний код без "TBD"/"similar to".
