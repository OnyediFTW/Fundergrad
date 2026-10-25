/* Fundergrad: game logic (build step 3)
 *
 * How a week works:
 *   1. The event card (a "modal") opens. You pick a choice.
 *   2. The choice's effects apply right away: cash, card balance, stress, recurring
 *      charges, payments scheduled for later weeks. You see what happened and why it matters.
 *   3. You split the week's budget with the sliders. The chart previews where you will end up.
 *   4. "Lock in this week": pay arrives (green), bills and spending leave (red), week advances.
 *
 * Still to come (next build steps): overdraft fee, card interest, the hint engine,
 * Cash GPA, results screen, Rewind, tutorial arrows.
 *
 * Testing tools (only when the URL ends in #dev): a small button bar in the corner,
 * plus keys  [ ]  to change week  and  = -  to test the green / red flash.
 * Stepping weeks with the testing tools skips that week's event.
 */
(function () {
  'use strict';

  // ---------- Settings (all tunable; game estimates, see docs/sources.md) ----------
  var WEEKLY_INCOME = 190;   // net pay from a part-time campus job
  var START_CASH = 800;      // summer savings plus refund
  var WEEKLY_NEEDS = 135;    // baseline weekly spending, used for the cushion line and Buffer meter
  var CUSHION = WEEKLY_NEEDS * 4;   // "4 weeks of needs" goal shown on the chart
  var OVERDRAFT_FEE = 35;    // sourced: CFPB (see docs/sources.md); applied in the next build step

  // Each slider is one place your week's money can go.
  var CATEGORIES = [
    { key: 'food',      label: 'Food off the meal plan', floor: 35, max: 120 },
    { key: 'transport', label: 'Getting around',         floor: 15, max: 80 },
    { key: 'school',    label: 'School supplies',        floor: 10, max: 80 },
    { key: 'social',    label: 'Social',                 floor: 0,  max: 120 },
    { key: 'save',      label: 'Save',                   floor: 0,  max: 150 },
  ];

  // Scorecard meters (0 to 100). The white tick on each bar is the healthy target.
  var METER_INFO = [
    { name: 'Buffer',  desc: 'Could your cash cover a rough month?' },
    { name: 'Savings', desc: 'Are you building a cushion?' },
    { name: 'Control', desc: 'Are you avoiding card interest and fees?' },
    { name: 'Calm',    desc: 'How stressful is the semester feeling?' },
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
    history: [{ week: 0, cash: START_CASH }],   // cash at the end of each week, for the chart
    activeTab: 'thisWeek',
    done: false,
    busy: false,                     // true while the pay/spend animation plays

    // Event system
    flags: {},                       // decisions the game remembers, e.g. hasCard
    recurring: {},                   // weekly charges, e.g. subscriptions
    scheduled: [],                   // money that lands in a later week: { week, cash, label }
    outcomes: {},                    // what you chose each week: { choiceId, label, lines }
    eventPending: false,             // true until you pick a choice and continue
    phase: 'choose',                 // modal phase: 'choose' or 'outcome'

    // Delayed paycheck (week 5)
    delayedThisWeek: false,
    coverAmount: 0,                  // budget for a week when pay is delayed
    owedPay: 0,                      // delayed pay that arrives next week
  };

  // ---------- Small helpers ----------
  function $(id) { return document.getElementById(id); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function money(n) {
    var rounded = Math.round(n);
    return (rounded < 0 ? '\u2212' : '') + '$' + Math.abs(rounded).toLocaleString('en-US');
  }
  function signed(n) { return (n > 0 ? '+' : '\u2212') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US'); }
  function currentEvent() { return EVENTS[state.week - 1]; }
  function allocTotal() {
    return CATEGORIES.reduce(function (sum, c) { return sum + state.alloc[c.key]; }, 0);
  }
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function toast(message) {
    var el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 3500);
  }

  // ---------- Week money rules ----------
  function recurringTotal() {
    return Object.keys(state.recurring).reduce(function (sum, id) { return sum + state.recurring[id].perWeek; }, 0);
  }
  function scheduledNet(week) {
    return state.scheduled.reduce(function (sum, s) { return s.week === week ? sum + s.cash : sum; }, 0);
  }
  function payThisWeek() { return (state.delayedThisWeek ? 0 : WEEKLY_INCOME) + state.owedPay; }
  function weekBudget() { return state.delayedThisWeek ? state.coverAmount : WEEKLY_INCOME; }
  function available() { return weekBudget() - allocTotal(); }

  function addLedger(week, label, amount) {
    state.ledger.unshift({ week: week, label: label, amount: amount });
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
    delta.textContent = signed(amount);
    delta.setAttribute('aria-hidden', 'true');
    $('cashWrap').appendChild(delta);
    delta.addEventListener('animationend', function () { delta.remove(); });
  }

  // ---------- Health meters (placeholder formulas; the real ones come with Cash GPA) ----------
  function meters() {
    return [
      clamp((state.cash / CUSHION) * 100, 0, 100),        // Buffer: how much of a 4-week cushion you hold
      clamp((state.savings / 400) * 100, 0, 100),         // Savings
      clamp(100 - state.cardDebt / 5, 0, 100),            // Control: not carrying card debt
      clamp(100 - state.stress * 12, 0, 100),             // Calm
    ];
  }

  // ---------- Cash chart ----------
  // Where you will end this week if you lock in now. Hidden while the lock-in animation plays.
  function previewPoint() {
    var last = state.history[state.history.length - 1];
    if (state.done || state.busy || last.week >= EVENTS.length) return null;
    var week = last.week + 1;
    return {
      week: week,
      cash: state.cash + payThisWeek() + scheduledNet(week) - recurringTotal() - allocTotal(),
    };
  }

  function niceStep(range) {
    var steps = [50, 100, 200, 250, 500, 1000, 2000, 5000];
    for (var i = 0; i < steps.length; i++) {
      if (range / steps[i] <= 6) return steps[i];
    }
    return 10000;
  }

  function renderChart() {
    var svg = $('chart');
    var wrap = $('chartWrap');
    if (!svg || !wrap) return;

    var w = Math.max(360, wrap.clientWidth || 900);
    var h = Math.max(200, wrap.clientHeight || 300);
    var m = { l: 64, r: 30, t: 18, b: 38 };
    var pw = w - m.l - m.r;
    var ph = h - m.t - m.b;
    var weeks = EVENTS.length;
    var pv = previewPoint();

    // Vertical range: always show $0 (the overdraft line) and the cushion goal.
    var values = state.history.map(function (p) { return p.cash; });
    values.push(0, CUSHION, state.cash);
    if (pv) values.push(pv.cash);
    var yMin = Math.min(Math.min.apply(null, values), 0) - 70;
    var yMax = Math.max.apply(null, values) + 90;
    var step = niceStep(yMax - yMin);

    function X(wk) { return m.l + pw * (wk / weeks); }
    function Y(v) { return m.t + ph * (1 - (v - yMin) / (yMax - yMin)); }

    var out = [];
    var bottom = m.t + ph;

    // Overdraft zone below $0
    out.push('<rect class="c-od" x="' + m.l + '" y="' + Y(0).toFixed(1) + '" width="' + pw + '" height="' + (bottom - Y(0)).toFixed(1) + '"></rect>');
    out.push('<text class="c-od-label" x="' + (m.l + 8) + '" y="' + (Y(0) + 17).toFixed(1) + '">Overdraft zone: ' + money(OVERDRAFT_FEE) + ' fee</text>');

    // Grid and dollar labels
    for (var v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
      var gy = Y(v).toFixed(1);
      out.push('<line class="' + (v === 0 ? 'c-zero' : 'c-grid') + '" x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + gy + '" y2="' + gy + '"></line>');
      out.push('<text class="c-tick" x="' + (m.l - 10) + '" y="' + (Number(gy) + 4) + '" text-anchor="end">' + money(v) + '</text>');
    }

    // Week numbers along the bottom
    for (var wk = 1; wk <= weeks; wk++) {
      out.push('<text class="c-tick" x="' + X(wk).toFixed(1) + '" y="' + (h - 14) + '" text-anchor="middle">' + wk + '</text>');
    }
    out.push('<text class="c-tick" x="' + (m.l - 10) + '" y="' + (h - 14) + '" text-anchor="end">Week</text>');

    // 4-week cushion goal
    var cy = Y(CUSHION).toFixed(1);
    out.push('<line class="c-cushion" x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + cy + '" y2="' + cy + '"></line>');
    out.push('<text class="c-cushion-label" x="' + (m.l + pw) + '" y="' + (Number(cy) - 6) + '" text-anchor="end">4-week cushion ' + money(CUSHION) + '</text>');

    // Fall Break and Thanksgiving markers
    EVENTS.forEach(function (ev) {
      if (ev.tag !== 'break') return;
      var mx = X(ev.week).toFixed(1);
      out.push('<line class="c-mark" x1="' + mx + '" x2="' + mx + '" y1="' + m.t + '" y2="' + bottom + '"></line>');
      out.push('<text class="c-mark-label" x="' + mx + '" y="' + (m.t + 12) + '" text-anchor="middle">' + escapeHtml(ev.short || ev.title) + '</text>');
    });

    // Your cash so far
    var path = state.history.map(function (p) { return X(p.week).toFixed(1) + ',' + Y(p.cash).toFixed(1); }).join(' ');
    out.push('<polyline class="c-line" points="' + path + '"></polyline>');
    state.history.forEach(function (p, i) {
      var isLast = i === state.history.length - 1;
      out.push('<circle class="c-dot" cx="' + X(p.week).toFixed(1) + '" cy="' + Y(p.cash).toFixed(1) + '" r="' + (isLast ? 6 : 4) + '"><title>' +
        (p.week === 0 ? 'Start' : 'End of week ' + p.week) + ': ' + money(p.cash) + '</title></circle>');
    });

    // Live preview: where this week ends if you lock in now
    if (pv) {
      var last = state.history[state.history.length - 1];
      var bad = pv.cash < 0;
      var px = X(pv.week);
      var py = Y(pv.cash);
      out.push('<line class="c-preview" x1="' + X(last.week).toFixed(1) + '" y1="' + Y(last.cash).toFixed(1) + '" x2="' + px.toFixed(1) + '" y2="' + py.toFixed(1) + '"></line>');
      out.push('<circle class="c-preview-dot' + (bad ? ' bad' : '') + '" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="7"></circle>');
      var nearTop = py < m.t + 36;
      var anchor, labelX, labelY;
      if (nearTop) {
        // keep the label off the line: put it beside the dot
        if (px > w - 160) { anchor = 'end'; labelX = px - 14; } else { anchor = 'start'; labelX = px + 14; }
        labelY = py + 5;
      } else {
        anchor = px > w - 120 ? 'end' : 'middle';
        labelX = anchor === 'end' ? px - 12 : px;
        labelY = py - 14;
      }
      out.push('<text class="c-preview-label' + (bad ? ' bad' : '') + '" x="' + labelX.toFixed(1) + '" y="' + labelY.toFixed(1) + '" text-anchor="' + anchor + '">Ends at ' + money(pv.cash) + (bad ? ' (overdraft)' : '') + '</text>');
    }

    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.innerHTML = out.join('');

    var summary = 'Your cash by week. Now ' + money(state.cash) + '.' + (pv ? ' Locking in now would end the week at ' + money(pv.cash) + '.' : '');
    svg.setAttribute('aria-label', summary);
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
    $('weeklyBudget').textContent = money(weekBudget());

    var lock = $('btnLock');
    lock.disabled = state.done || state.busy || state.eventPending || left < 0;
    var hint = '';
    if (state.eventPending && !state.done) hint = 'Make this week\u2019s decision first.';
    else if (left < 0) hint = 'You have allocated ' + money(-left) + ' more than this week\u2019s budget.';
    else if (state.delayedThisWeek) hint = 'Your paycheck is late, so this week\u2019s budget is only ' + money(weekBudget()) + '.';
    $('lockHint').textContent = hint;

    renderChart();   // the preview point follows the sliders
  }

  // ---------- Money stats ----------
  function renderMoney() {
    $('cashValue').textContent = money(state.cash);
    $('savingsValue').textContent = money(state.savings);
    $('cardValue').textContent = money(state.cardDebt);
    $('stressValue').textContent = state.stress + ' / 8';
  }

  // ---------- Bottom tabs ----------
  function stat(name, value) {
    return '<div class="stat"><dt>' + name + '</dt><dd>' + value + '</dd></div>';
  }

  function sourceLinks(ev) {
    return '<ul class="source-list">' + ev.sources.map(function (key) {
      var s = SOURCES[key];
      return '<li><a href="' + s.url + '" target="_blank" rel="noopener">' + escapeHtml(s.title) + '</a>' +
        '<div class="org">' + escapeHtml(s.org) + '</div></li>';
    }).join('') + '</ul>';
  }

  // Plain-text credit for the in-game event card. No links, so nothing can open mid-game.
  // The clickable links live in the Hints and sources tab and on the final Sources screen.
  function sourceCredit(ev) {
    var orgs = [];
    ev.sources.forEach(function (key) {
      var org = SOURCES[key].org;
      if (orgs.indexOf(org) === -1) orgs.push(org);
    });
    return '<p class="source-tag">Source: ' + escapeHtml(orgs.join(', ')) + '</p>';
  }

  function outcomeList(lines) {
    return '<ul class="outcome-list">' + lines.map(function (line) {
      var amount = line.amount !== undefined
        ? '<span class="amt ' + line.kind + '">' + signed(line.amount) + (line.note ? ' ' + escapeHtml(line.note) : '') + '</span>'
        : '';
      return '<li><span>' + escapeHtml(line.text) + '</span>' + amount + '</li>';
    }).join('') + '</ul>';
  }

  function renderTabs() {
    var buttons = $('tabs').querySelectorAll('button');
    Array.prototype.forEach.call(buttons, function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-tab') === state.activeTab ? 'true' : 'false');
    });

    var panel = $('tabPanel');
    var html = '';
    var ev = currentEvent();

    if (state.activeTab === 'scorecard') {
      var vals = meters();
      html += '<h3 class="panel-title">Scorecard</h3>' +
        '<p class="panel-lede">Your Cash GPA will live here. For now, these are your running totals and four health meters. The white tick is a healthy target.</p>' +
        '<dl class="stat-grid">' +
        stat('Cash', money(state.cash)) +
        stat('Savings', money(state.savings)) +
        stat('Card balance', money(state.cardDebt)) +
        stat('Stress', state.stress + ' / 8') +
        stat('Weeks played', String(state.history.length - 1) + ' of ' + EVENTS.length) +
        stat('Cash GPA', 'coming soon') +
        '</dl>' +
        '<ul class="meters">' + METER_INFO.map(function (info, i) {
          var v = Math.round(vals[i]);
          return '<li class="meter"><span class="meter-name">' + info.name + '</span>' +
            '<span class="meter-bar"><span class="meter-fill" style="width:' + v + '%"></span><span class="meter-target"></span></span>' +
            '<span class="meter-num">' + v + '</span>' +
            '<span class="meter-desc">' + info.desc + '</span></li>';
        }).join('') + '</ul>';
    } else if (state.activeTab === 'account') {
      html += '<h3 class="panel-title">Account</h3>';
      if (state.ledger.length === 0) {
        html += '<p class="panel-lede">Nothing yet. Every dollar in and out shows up here.</p>';
      } else {
        html += '<ul class="ledger">' + state.ledger.slice(0, 60).map(function (row) {
          var kind = row.amount > 0 ? 'gain' : 'loss';
          return '<li><span>Week ' + row.week + ': ' + escapeHtml(row.label) + '</span>' +
            '<span class="' + kind + '">' + signed(row.amount) + '</span></li>';
        }).join('') + '</ul>';
      }
    } else if (state.activeTab === 'thisWeek' && !state.done) {
      var outcome = state.outcomes[ev.week];
      html += '<h3 class="panel-title">' + escapeHtml(ev.title) + '</h3>';
      if (state.eventPending && state.phase === 'choose') {
        html += '<p class="panel-lede">' + escapeHtml(ev.blurb) + '</p>' +
          '<button class="primary" type="button" data-action="open">Open this week\u2019s event</button>';
      } else if (outcome) {
        html += '<p class="panel-lede">You chose: <strong>' + escapeHtml(outcome.label) + '</strong></p>' +
          outcomeList(outcome.lines) +
          '<p class="panel-lede" style="margin-top:10px">' + escapeHtml(ev.takeaway) + '</p>';
      } else {
        html += '<p class="panel-lede">' + escapeHtml(ev.blurb) + '</p>';
      }
    } else if (state.activeTab === 'sources' && !state.done) {
      html += '<h3 class="panel-title">' + escapeHtml(ev.lesson) + '</h3>' +
        '<p class="panel-lede">' + escapeHtml(ev.takeaway) + '</p>' + sourceLinks(ev);
    } else {
      html += '<p class="panel-lede">The semester is finished. The results screen is the next build step.</p>';
    }
    panel.innerHTML = html;
  }

  // Plain-English lines for decisions the game remembers but that do not move money right away.
  var FLAG_LINES = {
    hasCard: 'You now have a credit card: $500 limit, about 22% APR',
    payInFull: 'Your plan: pay the card off in full every month',
    waitedOnJacket: 'You gave the urge 48 hours to fade',
    borrowedBooks: 'You are borrowing books, so expect to wait for copies',
    borrowedLaptop: 'You are borrowing a laptop with limited hours',
  };

  // ---------- Applying a choice's effects ----------
  // Returns a list of lines for the "What happened" screen.
  function applyEffects(effects, week) {
    var lines = [];
    var cashNet = 0;

    effects.forEach(function (fx) {
      if (fx.type === 'cash') {
        state.cash += fx.amount;
        cashNet += fx.amount;
        addLedger(week, fx.label || 'Event', fx.amount);
        lines.push({ kind: fx.amount > 0 ? 'gain' : 'loss', text: fx.label || 'Event', amount: fx.amount });

      } else if (fx.type === 'card') {
        state.cardDebt += fx.amount;
        lines.push({ kind: 'loss', text: (fx.label || 'Card charge') + ': added to your card balance', amount: fx.amount });

      } else if (fx.type === 'stress') {
        state.stress = clamp(state.stress + fx.amount, 0, 8);
        lines.push({ kind: 'neutral', text: fx.amount > 0 ? 'Your stress goes up' : 'Your stress goes down' });

      } else if (fx.type === 'flag') {
        state.flags[fx.key] = fx.value;
        if (fx.value === true && FLAG_LINES[fx.key]) lines.push({ kind: 'neutral', text: FLAG_LINES[fx.key] });

      } else if (fx.type === 'recurring') {
        if (fx.perWeek > 0) {
          state.recurring[fx.id] = { perWeek: fx.perWeek, label: fx.label };
          lines.push({ kind: 'loss', text: fx.label + ': a weekly charge from now on', amount: -fx.perWeek, note: 'a week' });
        } else {
          delete state.recurring[fx.id];
          lines.push({ kind: 'gain', text: 'Subscriptions cancelled: no more weekly charges' });
        }

      } else if (fx.type === 'scheduled') {
        state.scheduled.push({ week: fx.week, cash: fx.cash, label: fx.label });
        lines.push({ kind: fx.cash > 0 ? 'gain' : 'loss', text: 'Week ' + fx.week + ': ' + fx.label, amount: fx.cash });

      } else if (fx.type === 'coverWeek') {
        state.coverAmount = fx.amount;
        if (fx.from === 'card') {
          state.cardDebt += fx.amount;
          state.cash += fx.amount;
          cashNet += fx.amount;
          addLedger(week, 'The card covers this week (card balance goes up)', fx.amount);
          lines.push({ kind: 'loss', text: 'The card covers this week: added to your card balance', amount: fx.amount });
        } else if (fx.from === 'family') {
          state.cash += fx.amount;
          cashNet += fx.amount;
          addLedger(week, 'Gift from family', fx.amount);
          lines.push({ kind: 'gain', text: 'A gift from family covers this week', amount: fx.amount });
        } else {
          lines.push({ kind: 'neutral', text: 'You cover this week from your balance: ' + money(fx.amount) + ' to spend' });
        }
      }
    });

    if (cashNet) flashMoney(cashNet);
    return lines;
  }

  // ---------- Event modal ----------
  function setAppInert(on) {
    var app = $('app');
    app.inert = !!on;
    app.setAttribute('aria-hidden', on ? 'true' : 'false');
  }

  function focusFirst(container) {
    if (container && typeof container.querySelector === 'function') {
      var first = container.querySelector('button:not([disabled])');
      if (first) first.focus();
    }
  }

  // The small label on the right of each choice button.
  function badgeFor(choice) {
    var cash = 0, card = 0, cover = null, rec = null;
    choice.effects.forEach(function (fx) {
      if (fx.type === 'cash') cash += fx.amount;
      else if (fx.type === 'card') card += fx.amount;
      else if (fx.type === 'coverWeek') cover = fx;
      else if (fx.type === 'recurring') rec = fx;
    });
    if (cash) return { text: signed(cash), kind: cash > 0 ? 'gain' : 'loss' };
    if (card) return { text: money(card) + ' on card', kind: 'loss' };
    if (cover) return { text: money(cover.amount) + ' to spend', kind: 'neutral' };
    if (rec) return { text: money(rec.perWeek) + ' a week', kind: rec.perWeek ? 'loss' : 'gain' };
    return null;
  }

  function renderModal() {
    var ev = currentEvent();
    var html = '<p class="modal-week">Week ' + ev.week + ' of ' + EVENTS.length + '  \u00B7  week of ' + escapeHtml(ev.date) + '</p>' +
      '<h2 class="modal-title" id="eventTitle">' + escapeHtml(ev.title) + '</h2>';

    if (state.phase === 'choose') {
      html += '<p class="modal-blurb">' + escapeHtml(ev.blurb) + '</p><ul class="modal-choices">' +
        ev.choices.map(function (c) {
          var locked = c.requires && !state.flags[c.requires];
          var badge = badgeFor(c);
          return '<li><button type="button" class="choice-btn" data-choice="' + escapeHtml(c.id) + '"' + (locked ? ' disabled' : '') + '>' +
            '<span class="choice-text"><strong>' + escapeHtml(c.label) + '</strong>' +
            '<span>' + escapeHtml(locked ? 'You need the credit card from Week 2 for this one.' : c.detail) + '</span></span>' +
            (badge && !locked ? '<span class="badge ' + badge.kind + '">' + escapeHtml(badge.text) + '</span>' : '') +
            '</button></li>';
        }).join('') + '</ul>';
    } else {
      var outcome = state.outcomes[ev.week];
      html += '<p class="modal-blurb">You chose: <strong>' + escapeHtml(outcome.label) + '</strong></p>' +
        '<h3 class="modal-sub">What happened</h3>' + outcomeList(outcome.lines) +
        '<div class="why"><h3 class="modal-sub">Why it matters</h3><p>' + escapeHtml(ev.takeaway) + '</p>' + sourceCredit(ev) + '</div>' +
        '<div class="modal-actions"><button type="button" class="primary" data-action="continue">Continue to your budget</button></div>';
    }

    $('modalBody').innerHTML = html;
    focusFirst($('modalBody'));
  }

  function openEvent() {
    var ev = currentEvent();
    state.eventPending = true;
    state.phase = 'choose';
    (ev.onEnter || []).forEach(function (fx) {
      if (fx.type === 'delayPaycheck') {
        state.delayedThisWeek = true;
        state.coverAmount = 0;
      }
    });
    renderModal();
    $('eventModal').hidden = false;
    setAppInert(true);
    renderControls();
    renderTabs();
  }

  function chooseOption(id) {
    var ev = currentEvent();
    var choice = null;
    ev.choices.forEach(function (c) { if (c.id === id) choice = c; });
    if (!choice || (choice.requires && !state.flags[choice.requires])) return;
    if (state.phase !== 'choose') return;

    var lines = applyEffects(choice.effects, ev.week);
    if (lines.length === 0) lines.push({ kind: 'neutral', text: 'No money changes hands.' });
    state.outcomes[ev.week] = { choiceId: id, label: choice.label, lines: lines };
    state.phase = 'outcome';
    renderMoney();
    renderModal();
    renderControls();
    renderTabs();
  }

  function continueFromEvent() {
    state.eventPending = false;
    $('eventModal').hidden = true;
    setAppInert(false);
    renderControls();
    renderTabs();
    if (typeof $('btnLock').focus === 'function') $('btnLock').focus();
  }

  // ---------- Turn logic ----------
  function lockIn() {
    if (state.done || state.busy || state.eventPending || available() < 0) return;
    state.busy = true;

    var weekPlayed = state.week;   // the week advances below, so remember which week these entries belong to
    var spend = allocTotal() - state.alloc.save;
    var save = state.alloc.save;
    var pay = payThisWeek();
    var hadOwed = state.owedPay > 0;
    var wasDelayed = state.delayedThisWeek;

    // Pay arrives first.
    if (pay > 0) {
      state.cash += pay;
      addLedger(weekPlayed, hadOwed ? 'Paycheck (including last week\u2019s late pay)' : 'Paycheck', pay);
      flashMoney(pay);
    }
    state.owedPay = wasDelayed ? WEEKLY_INCOME : 0;   // a late paycheck arrives next week
    state.delayedThisWeek = false;
    state.coverAmount = 0;
    renderMoney();

    // Bills and spending leave a beat later.
    setTimeout(function () {
      var net = 0;

      state.scheduled.forEach(function (s) {
        if (s.week !== weekPlayed) return;
        state.cash += s.cash;
        net += s.cash;
        addLedger(weekPlayed, s.label, s.cash);
      });
      state.scheduled = state.scheduled.filter(function (s) { return s.week !== weekPlayed; });

      Object.keys(state.recurring).forEach(function (id) {
        var r = state.recurring[id];
        state.cash -= r.perWeek;
        net -= r.perWeek;
        addLedger(weekPlayed, r.label, -r.perWeek);
      });

      if (spend > 0) {
        state.cash -= spend;
        net -= spend;
        addLedger(weekPlayed, 'Weekly spending', -spend);
      }
      if (net) flashMoney(net);

      if (save > 0) {
        state.cash -= save;
        state.savings += save;
        addLedger(weekPlayed, 'Moved to savings', -save);
      }

      state.history.push({ week: weekPlayed, cash: state.cash });
      state.busy = false;
      renderMoney();
      renderChart();
      renderTabs();

      if (state.done) {
        toast('Semester complete. The results screen is the next build step.');
      } else {
        openEvent();
      }
    }, 650);

    if (state.week >= EVENTS.length) {
      state.done = true;
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
    setTimeout(function () {
      $('start').style.display = 'none';
      // Tutorial arrows come in a later build step; they will open here, before the first event.
      openEvent();
    }, 520);
    setAppInert(false);
  }

  // ---------- Safety net for out-of-date files ----------
  // The event card needs a small block of HTML. If index.html is an older copy without it,
  // build it here so the game still works.
  function ensureModal() {
    if ($('eventModal') && $('modalBody')) return;
    if (typeof console !== 'undefined') console.warn('Fundergrad: index.html is missing the event modal, so it was built by game.js. Copy the latest index.html into your project.');
    var old = $('eventModal');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'eventModal';
    modal.hidden = true;
    var card = document.createElement('div');
    card.className = 'modal-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'eventTitle');
    var bodyEl = document.createElement('div');
    bodyEl.id = 'modalBody';
    card.appendChild(bodyEl);
    modal.appendChild(card);
    document.body.appendChild(modal);
  }

  // If styles.css is an older copy, the event card would show up unstyled below the game.
  // Say so plainly instead of leaving a mystery.
  function checkStyles() {
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return;
    var modal = $('eventModal');
    if (!modal || window.getComputedStyle(modal).position === 'fixed') return;
    var bar = document.createElement('div');
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:50;padding:10px 16px;background:#7a2430;color:#fff;font:14px system-ui,sans-serif;text-align:center';
    bar.textContent = 'Your css/styles.css is out of date, so the event card will look wrong. Copy the latest css/styles.css into your project and refresh.';
    document.body.appendChild(bar);
  }

  // ---------- Wire up ----------
  function closestWith(target, selector) {
    return target && typeof target.closest === 'function' ? target.closest(selector) : target;
  }

  function init() {
    ensureModal();
    checkStyles();
    buildSliders();
    renderProgress();
    renderControls();
    renderMoney();
    renderTabs();
    setAppInert(true);   // the start screen is on top until you press Start

    $('btnStart').addEventListener('click', startGame);
    $('btnLock').addEventListener('click', lockIn);

    // Clicks inside the event modal: choosing an option, or continuing.
    $('eventModal').addEventListener('click', function (e) {
      var node = closestWith(e.target, '[data-choice],[data-action]');
      if (!node || !node.getAttribute) return;
      var choice = node.getAttribute('data-choice');
      var action = node.getAttribute('data-action');
      if (choice) chooseOption(choice);
      else if (action === 'continue') continueFromEvent();
    });

    // Keep keyboard focus inside the modal while it is open.
    document.addEventListener('keydown', function (e) {
      var modal = $('eventModal');
      if (e.key !== 'Tab' || modal.hidden || typeof modal.querySelectorAll !== 'function') return;
      var items = modal.querySelectorAll('button:not([disabled]), a[href]');
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    $('tabs').addEventListener('click', function (e) {
      var tab = e.target.getAttribute && e.target.getAttribute('data-tab');
      if (!tab) return;
      state.activeTab = tab;
      renderTabs();
    });

    // The "Open this week's event" button inside the This week tab.
    $('tabPanel').addEventListener('click', function (e) {
      var node = closestWith(e.target, '[data-action]');
      if (node && node.getAttribute && node.getAttribute('data-action') === 'open' && state.eventPending) {
        $('eventModal').hidden = false;
        setAppInert(true);
        renderModal();
      }
    });

    $('btnSources').addEventListener('click', function () {
      state.activeTab = 'sources';
      renderTabs();
    });
    $('btnMenu').addEventListener('click', function () {
      toast('Menu is coming soon.');
    });

    // Redraw the chart when the window or panel changes size.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () { renderChart(); }).observe($('chartWrap'));
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', renderChart);
    }

    // Testing helpers. Checked on every use, so adding #dev to an open page works too.
    function devOn() { return location.hash === '#dev'; }
    function syncDevBar() { $('devBar').hidden = !devOn(); }
    function stepWeek(delta) {
      state.week = clamp(state.week + delta, 1, EVENTS.length);
      state.done = false;
      state.eventPending = false;
      state.delayedThisWeek = false;
      $('eventModal').hidden = true;
      setAppInert(false);
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
