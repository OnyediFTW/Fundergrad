/* Fundergrad: game skeleton (build step 3)
 *
 * What works now:
 *   - start screen, 14-week progress bar, tabs
 *   - weekly allocation sliders with an "Available" counter
 *   - "Lock in this week": pay arrives (green), spending leaves (red), week advances
 *   - radar chart that moves with your numbers
 *   - This week / Hints and sources tabs read straight from events.js
 *
 * What is NOT here yet (next build steps):
 *   - the event card and choice effects (events.js already has the data)
 *   - the hint engine, overdraft fee, card interest, scheduled payments
 *   - Cash GPA, results screen, Rewind, tutorial arrows
 *
 * Testing tools (only when the URL ends in #dev): a small button bar in the
 * corner, plus keys  [ ]  to change week  and  = -  to test the green / red flash.
 */
(function () {
  'use strict';

  // ---------- Settings (all tunable; game estimates, see docs/sources.md) ----------
  var WEEKLY_INCOME = 190;   // net pay from a part-time campus job
  var START_CASH = 800;      // summer savings plus refund
  var WEEKLY_NEEDS = 135;    // baseline weekly spending, used for the buffer measure

  // Each slider is one place your week's money can go.
  // "floor" is a rough minimum for the week; below it, stress goes up (later build step).
  var CATEGORIES = [
    { key: 'food',      label: 'Food off the meal plan', floor: 35, max: 120 },
    { key: 'transport', label: 'Getting around',         floor: 15, max: 80 },
    { key: 'school',    label: 'School supplies',        floor: 10, max: 80 },
    { key: 'social',    label: 'Social',                 floor: 0,  max: 120 },
    { key: 'save',      label: 'Save',                   floor: 0,  max: 150 },
  ];

  // ---------- State ----------
  var state = {
    week: 1,
    cash: START_CASH,
    savings: 0,
    cardDebt: 0,
    stress: 2,                       // 0 (calm) to 8 (overloaded)
    alloc: { food: 40, transport: 20, school: 15, social: 45, save: 50 },
    ledger: [],                      // newest first: { week, label, amount }
    activeTab: 'thisWeek',
    done: false,
    busy: false,                     // true for a moment while the pay/spend animation plays
  };

  // ---------- Small helpers ----------
  function $(id) { return document.getElementById(id); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function money(n) {
    var rounded = Math.round(n);
    return (rounded < 0 ? '\u2212' : '') + '$' + Math.abs(rounded).toLocaleString('en-US');
  }
  function currentEvent() { return EVENTS[state.week - 1]; }
  function allocTotal() {
    return CATEGORIES.reduce(function (sum, c) { return sum + state.alloc[c.key]; }, 0);
  }
  function available() { return WEEKLY_INCOME - allocTotal(); }

  function toast(message) {
    var el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 3500);
  }

  // ---------- Money flash: green for money in, red for money out ----------
  function flashMoney(amount) {
    if (!amount) return;
    var kind = amount > 0 ? 'gain' : 'loss';
    var value = $('cashValue');
    value.classList.remove('flash-gain', 'flash-loss');
    void value.offsetWidth; // restart the transition
    value.classList.add('flash-' + kind);
    setTimeout(function () { value.classList.remove('flash-' + kind); }, 700);

    var delta = document.createElement('span');
    delta.className = 'delta ' + kind;
    delta.textContent = (amount > 0 ? '+' : '\u2212') + '$' + Math.abs(Math.round(amount));
    delta.setAttribute('aria-hidden', 'true');
    $('cashWrap').appendChild(delta);
    delta.addEventListener('animationend', function () { delta.remove(); });
  }

  // ---------- Radar ----------
  // Four measures, 0 to 100. Corners match the MKTG layout: top-left, top-right, bottom-right, bottom-left.
  var RADAR_ANGLES = [-135, -45, 45, 135];  // degrees; y grows downward on screen
  var TARGET = [70, 70, 70, 70];

  function radarPoint(index, value) {
    var radius = 150 * (clamp(value, 0, 100) / 100);
    var angle = RADAR_ANGLES[index] * Math.PI / 180;
    return { x: 200 + radius * Math.cos(angle), y: 200 + radius * Math.sin(angle) };
  }

  function polygonPoints(values) {
    return values.map(function (v, i) {
      var p = radarPoint(i, v);
      return p.x.toFixed(1) + ',' + p.y.toFixed(1);
    }).join(' ');
  }

  // Placeholder formulas. The real ones come with the Cash GPA step.
  function meters() {
    return [
      clamp((state.cash / (WEEKLY_NEEDS * 4)) * 100, 0, 100),          // Buffer: weeks of needs you could cover
      clamp((state.savings / 400) * 100, 0, 100),                      // Savings
      clamp(100 - state.cardDebt / 5, 0, 100),                         // Control: not carrying card debt
      clamp(100 - state.stress * 12, 0, 100),                          // Calm
    ];
  }

  function renderRadar() {
    var values = meters();
    $('radarYou').setAttribute('points', polygonPoints(values));
    $('radarTarget').setAttribute('points', polygonPoints(TARGET));

    var dots = $('radarDots');
    dots.innerHTML = '';
    values.forEach(function (v, i) {
      var p = radarPoint(i, v);
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', 'r-dot');
      c.setAttribute('cx', p.x.toFixed(1));
      c.setAttribute('cy', p.y.toFixed(1));
      c.setAttribute('r', '5');
      dots.appendChild(c);
    });
  }

  // ---------- Top progress bar ----------
  function renderProgress() {
    var track = $('weekTrack');
    track.innerHTML = '';
    EVENTS.forEach(function (ev, i) {
      var li = document.createElement('li');
      var n = i + 1;
      if (n < state.week || state.done) li.className = 'done';
      else if (n === state.week) li.className = 'current';
      if (ev.tag === 'break') {
        li.classList.add('break');
        li.title = ev.title;
      }
      track.appendChild(li);
    });
    var ev = currentEvent();
    $('weekLabel').textContent = state.done
      ? 'Semester complete'
      : 'Week ' + state.week + ' of ' + EVENTS.length + '  \u00B7  week of ' + ev.date;
  }

  // ---------- Left panel ----------
  function buildSliders() {
    var host = $('sliders');
    host.innerHTML = '';
    CATEGORIES.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'slider-row';

      var top = document.createElement('div');
      top.className = 'slider-top';
      var label = document.createElement('label');
      label.className = 'slider-label';
      label.htmlFor = 'slider-' + c.key;
      label.textContent = c.label;
      var value = document.createElement('span');
      value.className = 'slider-value';
      value.id = 'val-' + c.key;
      top.appendChild(label);
      top.appendChild(value);

      var input = document.createElement('input');
      input.type = 'range';
      input.id = 'slider-' + c.key;
      input.min = '0';
      input.max = String(c.max);
      input.step = '5';
      input.value = String(state.alloc[c.key]);
      input.addEventListener('input', function () {
        state.alloc[c.key] = Number(input.value);
        renderControls();
      });

      var note = document.createElement('div');
      note.className = 'slider-note';
      note.textContent = c.floor > 0 ? 'Most weeks need at least ' + money(c.floor) : ' ';

      row.appendChild(top);
      row.appendChild(input);
      row.appendChild(note);
      host.appendChild(row);
    });
  }

  function renderControls() {
    var ev = currentEvent();
    $('weekTitle').textContent = state.done ? 'Done' : 'Week ' + state.week;
    $('weekDate').textContent = state.done ? '' : 'Week of ' + ev.date + (ev.tag === 'break' ? '  \u00B7  ' + ev.title : '');

    CATEGORIES.forEach(function (c) {
      $('val-' + c.key).textContent = money(state.alloc[c.key]);
      $('slider-' + c.key).value = String(state.alloc[c.key]);
    });

    var left = available();
    var el = $('available');
    el.textContent = money(left);
    el.classList.toggle('over', left < 0);
    $('weeklyBudget').textContent = money(WEEKLY_INCOME);

    var lock = $('btnLock');
    lock.disabled = state.done || left < 0;
    $('lockHint').textContent = left < 0
      ? 'You have allocated ' + money(-left) + ' more than this week\u2019s budget.'
      : '';
  }

  // ---------- Money stats ----------
  function renderMoney() {
    $('cashValue').textContent = money(state.cash);
    $('savingsValue').textContent = money(state.savings);
    $('cardValue').textContent = money(state.cardDebt);
    $('stressValue').textContent = state.stress + ' / 8';
  }

  // ---------- Bottom tabs ----------
  function renderTabs() {
    var buttons = $('tabs').querySelectorAll('button');
    Array.prototype.forEach.call(buttons, function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-tab') === state.activeTab ? 'true' : 'false');
    });

    var panel = $('tabPanel');
    var html = '';
    var ev = currentEvent();

    if (state.activeTab === 'scorecard') {
      html += '<h3 class="panel-title">Scorecard</h3>' +
        '<p class="panel-lede">Your Cash GPA will live here. For now, these are your running totals.</p>' +
        '<dl class="stat-grid">' +
        stat('Cash', money(state.cash)) +
        stat('Savings', money(state.savings)) +
        stat('Card balance', money(state.cardDebt)) +
        stat('Stress', state.stress + ' / 8') +
        stat('Weeks played', String(state.week - 1) + ' of ' + EVENTS.length) +
        stat('Cash GPA', 'coming soon') +
        '</dl>';
    } else if (state.activeTab === 'account') {
      html += '<h3 class="panel-title">Account</h3>';
      if (state.ledger.length === 0) {
        html += '<p class="panel-lede">Nothing yet. Lock in your first week and every dollar in and out shows up here.</p>';
      } else {
        html += '<ul class="ledger">' + state.ledger.slice(0, 40).map(function (row) {
          var kind = row.amount > 0 ? 'gain' : 'loss';
          return '<li><span>Week ' + row.week + ': ' + escapeHtml(row.label) + '</span>' +
            '<span class="' + kind + '">' + (row.amount > 0 ? '+' : '\u2212') + '$' + Math.abs(Math.round(row.amount)) + '</span></li>';
        }).join('') + '</ul>';
      }
    } else if (state.activeTab === 'thisWeek' && !state.done) {
      html += '<h3 class="panel-title">' + escapeHtml(ev.title) + '</h3>' +
        '<p class="panel-lede">' + escapeHtml(ev.blurb) + '</p>' +
        '<ul class="choice-list">' + ev.choices.map(function (c) {
          return '<li><strong>' + escapeHtml(c.label) + '</strong><span>' + escapeHtml(c.detail) + '</span></li>';
        }).join('') + '</ul>' +
        '<p class="panel-lede" style="margin-top:10px">Picking a choice comes in the next build step.</p>';
    } else if (state.activeTab === 'sources' && !state.done) {
      html += '<h3 class="panel-title">' + escapeHtml(ev.lesson) + '</h3>' +
        '<p class="panel-lede">' + escapeHtml(ev.takeaway) + '</p>' +
        '<ul class="source-list">' + ev.sources.map(function (key) {
          var s = SOURCES[key];
          return '<li><a href="' + s.url + '" target="_blank" rel="noopener">' + escapeHtml(s.title) + '</a>' +
            '<div class="org">' + escapeHtml(s.org) + '</div></li>';
        }).join('') + '</ul>';
    } else {
      html += '<p class="panel-lede">The semester is finished. The results screen is the next build step.</p>';
    }
    panel.innerHTML = html;
  }

  function stat(name, value) {
    return '<div class="stat"><dt>' + name + '</dt><dd>' + value + '</dd></div>';
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // ---------- Turn logic (basic ledger only; event choices come next) ----------
  function lockIn() {
    if (state.done || state.busy || available() < 0) return;
    state.busy = true;

    var weekPlayed = state.week;   // the week advances below, so remember which week these entries belong to
    var spend = allocTotal() - state.alloc.save;
    var save = state.alloc.save;

    state.cash += WEEKLY_INCOME;
    state.ledger.unshift({ week: weekPlayed, label: 'Paycheck', amount: WEEKLY_INCOME });
    flashMoney(WEEKLY_INCOME);
    renderMoney();

    // Show the money going out a beat after the money coming in.
    setTimeout(function () {
      if (spend > 0) {
        state.cash -= spend;
        state.ledger.unshift({ week: weekPlayed, label: 'Weekly spending', amount: -spend });
        flashMoney(-spend);
      }
      if (save > 0) {
        state.cash -= save;
        state.savings += save;
        state.ledger.unshift({ week: weekPlayed, label: 'Moved to savings', amount: -save });
      }
      state.busy = false;
      renderMoney();
      renderRadar();
      renderTabs();
    }, 650);

    if (state.week >= EVENTS.length) {
      state.done = true;
      toast('Semester complete. The results screen is the next build step.');
    } else {
      state.week += 1;
    }
    renderProgress();
    renderControls();
    renderTabs();
  }

  // ---------- Start ----------
  function startGame() {
    $('start').classList.add('hide');
    setTimeout(function () { $('start').style.display = 'none'; }, 520);
    // Tutorial arrows come in a later build step; they will open here.
    $('btnLock').focus();
  }

  // ---------- Wire up ----------
  function init() {
    buildSliders();
    renderProgress();
    renderControls();
    renderMoney();
    renderRadar();
    renderTabs();

    $('btnStart').addEventListener('click', startGame);
    $('btnLock').addEventListener('click', lockIn);

    $('tabs').addEventListener('click', function (e) {
      var tab = e.target.getAttribute && e.target.getAttribute('data-tab');
      if (!tab) return;
      state.activeTab = tab;
      renderTabs();
    });

    $('btnSources').addEventListener('click', function () {
      state.activeTab = 'sources';
      renderTabs();
    });
    $('btnMenu').addEventListener('click', function () {
      toast('Menu is coming soon.');
    });

    // Testing helpers. Checked on every use, so adding #dev to an open page works too.
    function devOn() { return location.hash === '#dev'; }
    function syncDevBar() { $('devBar').hidden = !devOn(); }
    function stepWeek(delta) {
      state.week = clamp(state.week + delta, 1, EVENTS.length);
      state.done = false;
      renderProgress(); renderControls(); renderTabs();
    }
    function devAction(name) {
      if (name === 'next') stepWeek(1);
      else if (name === 'prev') stepWeek(-1);
      else if (name === 'gain') flashMoney(50);
      else if (name === 'loss') flashMoney(-50);
    }

    syncDevBar();
    if (typeof window !== 'undefined') window.addEventListener('hashchange', syncDevBar);

    $('devBar').addEventListener('click', function (e) {
      var name = e.target.getAttribute && e.target.getAttribute('data-dev');
      if (name) devAction(name);
    });

    document.addEventListener('keydown', function (e) {
      if (!devOn()) return;
      if (e.key === ']') devAction('next');
      else if (e.key === '[') devAction('prev');
      else if (e.key === '+' || e.key === '=') devAction('gain');
      else if (e.key === '-') devAction('loss');
    });
  }

  init();
})();
