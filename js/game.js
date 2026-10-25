/* Fundergrad: game logic (build step 3)
 *
 * How a week works:
 *   1. The event card (a "modal") opens. You pick a choice.
 *   2. The choice's effects apply right away: cash, card balance, stress, recurring
 *      charges, payments scheduled for later weeks. You see what happened and why it matters.
 *   3. You split the week's budget with the sliders. The chart previews where you will end up.
 *   4. "Lock in this week": pay arrives (green), bills and spending leave (red), week advances.
 *
 * Rules (step 4):
 *   - Overdraft: if your cash is below $0 when the week ends, your savings cover the gap first
 *     (overdraft protection). Only what savings cannot cover costs you a $35 fee and more stress.
 *   - Card: carry a balance and it grows by about 22% a year (charged weekly). A "Pay down card"
 *     slider appears whenever you owe money.
 *   - Stress: skipping food, transport, or school supplies raises it; a calm week lowers it.
 *   - Coach: a rules-based helper that reads your numbers (never a chatbot) and gives up to three hints.
 *
 * The end (step 5):
 *   - After week 14 the results screen shows your Cash GPA, how it was graded, what shaped your
 *     semester, and three personal "if-then" moves.
 *   - Rewind replays the same semester with a $500 buffer so you can see what a cushion changes.
 *   - A Sources screen (left rail, or the results screen) lists every link. Nothing opens by itself.
 *
 * The tutorial (step 6): after Start, a guided tour spotlights each part of the screen with an
 * arrow and a short text box. The Tutorial button in the left rail replays it any time.
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
  var OVERDRAFT_FEE = 35;    // sourced: CFPB (see docs/sources.md)
  var CARD_APR = 22;         // sourced: Federal Reserve G.19, about 22% (see docs/sources.md)

  // Each slider is one place your week's money can go.
  var CATEGORIES = [
    { key: 'food',      label: 'Food off the meal plan', floor: 35, max: 120 },
    { key: 'transport', label: 'Getting around',         floor: 15, max: 80 },
    { key: 'school',    label: 'School supplies',        floor: 10, max: 80 },
    { key: 'social',    label: 'Social',                 floor: 0,  max: 120 },
    { key: 'card',      label: 'Pay down card',          floor: 0,  max: 150, hidden: true },
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
  // A function, so Rewind and Play again can start a clean run.
  function newState(buffer) {
    var startCash = START_CASH + (buffer || 0);
    return {
      week: 1,
      cash: startCash,
      savings: 0,
      cardDebt: 0,
      stress: 2,                       // 0 (calm) to 8 (overloaded)
      alloc: { food: 40, transport: 20, school: 15, social: 45, card: 0, save: 50 },
      ledger: [],                      // newest first: { week, label, amount }
      history: [{ week: 0, cash: startCash }],   // cash at the end of each week, for the chart
      activeTab: 'thisWeek',
      done: false,
      busy: false,                     // true while the pay/spend animation plays

      // Rules tracking
      feesPaid: 0,                     // total overdraft fees
      interestPaid: 0,                 // total card interest added to your balance
      saveZeroWeeks: 0,                // weeks in a row with nothing saved
      totalSaved: 0,                   // everything you set aside over the semester
      stressLog: [],                   // stress at the end of each week, for the results screen
      traps: [],                       // costly decisions, for the results screen
      wins: [],                        // good decisions, for the results screen

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

      // Results
      buffer: buffer || 0,             // extra starting cash on a Rewind run
      resultsShown: false,
      lastMoves: [],
    };
  }

  var state = newState(0);
  var runLog = [];                     // one entry per finished run, for the Rewind comparison

  // ---------- Small helpers ----------
  function $(id) { return document.getElementById(id); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function money(n) {
    var rounded = Math.round(n);
    return (rounded < 0 ? '\u2212' : '') + '$' + Math.abs(rounded).toLocaleString('en-US');
  }
  function signed(n) { return (n > 0 ? '+' : '\u2212') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US'); }
  function cents(n) { return '$' + Math.abs(n).toFixed(2); }
  // Small non-whole amounts (like card interest) keep their cents so they do not round to $0.
  function signedExact(n) {
    if (Math.abs(n) < 10 && n % 1 !== 0) return (n > 0 ? '+' : '\u2212') + cents(n);
    return signed(n);
  }
  function round2(n) { return Math.round(n * 100) / 100; }
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
      clamp(100 - state.cardDebt / 5 - state.feesPaid - state.interestPaid * 2, 0, 100),   // Control: no card debt, fees, or interest
      clamp(100 - state.stress * 12, 0, 100),             // Calm
    ];
  }

  // ---------- Cash chart ----------
  // Where you will end this week if you lock in now. Hidden while the lock-in animation plays.
  function previewPoint() {
    var last = state.history[state.history.length - 1];
    if (state.done || state.busy || last.week >= EVENTS.length) return null;
    var week = last.week + 1;
    var raw = state.cash + payThisWeek() + scheduledNet(week) - recurringTotal() - allocTotal();
    // Savings (including this week's deposit) cover a shortfall before the bank charges a fee.
    var covered = raw < 0 ? Math.min(state.savings + state.alloc.save, -raw) : 0;
    var after = raw + covered;
    var overdraft = after < 0;
    return { week: week, raw: raw, covered: covered, overdraft: overdraft, cash: overdraft ? after - OVERDRAFT_FEE : after };
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
      var bad = pv.overdraft;
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
      out.push('<text class="c-preview-label' + (bad ? ' bad' : '') + '" x="' + labelX.toFixed(1) + '" y="' + labelY.toFixed(1) + '" text-anchor="' + anchor + '">Ends at ' + money(pv.cash) + (bad ? ' (with overdraft fee)' : pv.covered > 0 ? ' (savings cover ' + money(pv.covered) + ')' : '') + '</text>');
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
      row.id = 'row-' + c.key;
      if (c.hidden) { row.hidden = true; row.style.display = 'none'; }

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
      note.textContent = c.floor > 0 ? 'Most weeks need at least ' + money(c.floor)
        : c.key === 'card' ? 'Interest keeps adding until the balance is paid off' : ' ';

      row.appendChild(top);
      row.appendChild(input);
      row.appendChild(note);
      host.appendChild(row);
    });
  }

  function renderControls() {
    var ev = currentEvent();

    // The "Pay down card" slider only shows while you owe money.
    var owes = state.cardDebt > 0.005;
    state.alloc.card = owes ? Math.min(state.alloc.card, Math.ceil(state.cardDebt / 5) * 5) : 0;
    var cardRow = $('row-card');
    if (cardRow) { cardRow.hidden = !owes; cardRow.style.display = owes ? '' : 'none'; }
    var cardSlider = $('slider-card');
    if (cardSlider) cardSlider.max = String(Math.max(5, Math.min(150, Math.ceil(state.cardDebt / 5) * 5)));

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
    renderCoach();
    if (state.activeTab === 'sources') renderTabs();   // keep the hints list live as you drag
  }

  // ---------- Money stats ----------
  function renderMoney() {
    $('cashValue').textContent = money(state.cash);
    $('savingsValue').textContent = money(state.savings);
    $('cardValue').textContent = money(state.cardDebt);
    $('stressValue').textContent = state.stress + ' / 8';
  }

  // ---------- Coach: rules-based hints ----------
  // Every hint comes from a rule that reads your numbers. Nothing here calls an AI.
  var LOOKAHEAD = {
    4:  'Fall Break is two weeks away. Staying on campus adds about $40 in food and going home runs about $90, so set a little aside now.',
    10: 'Thanksgiving is two weeks away. Travel can run $30 to $140, so plan for it now.',
    11: 'A winter coat, gifts, and club dues all land in Week 13. Setting aside a little each week keeps that from hitting at once.',
  };

  function computeHints() {
    var hints = [];
    if (state.done || state.eventPending) return hints;
    var pv = previewPoint();
    function add(kind, text) { hints.push({ kind: kind, text: text }); }

    // 1. Overdraft or a thin cushion
    if (pv && pv.overdraft) {
      var gap = Math.ceil((-pv.raw - pv.covered) / 5) * 5;
      add('danger', 'This plan would push your account below $0 and cost a ' + money(OVERDRAFT_FEE) + ' overdraft fee' +
        (pv.covered > 0 ? ', even after ' + money(pv.covered) + ' from savings' : '') + '. Trim about ' + money(gap) + ' from spending this week.');
    } else if (pv && pv.covered > 0) {
      add('warn', 'This plan dips below $0, so ' + money(pv.covered) + ' would come out of your savings. That avoids the ' + money(OVERDRAFT_FEE) + ' fee, but your savings will not be there for the next surprise.');
    } else if (pv && pv.raw < WEEKLY_NEEDS) {
      add('warn', 'You would end the week with less than one week of expenses (' + money(WEEKLY_NEEDS) + ') in cash. One surprise could trigger a ' + money(OVERDRAFT_FEE) + ' fee.');
    }

    // 2. Card balance
    if (state.cardDebt > 0.5 && state.alloc.card === 0) {
      var weekly = round2(state.cardDebt * CARD_APR / 100 / 52);
      if (state.flags.payInFull) {
        add('warn', 'You planned to pay the card off in full. Putting ' + money(state.cardDebt) + ' toward it this week would clear it.');
      } else {
        add('warn', 'You owe ' + money(state.cardDebt) + ' on your card at about ' + CARD_APR + '% APR. That adds about ' + cents(weekly) + ' a week, and it keeps growing until the balance is paid off.');
      }
    }

    // 3. Essentials below the usual minimum
    var low = [];
    CATEGORIES.forEach(function (c) {
      if (c.floor > 0 && state.alloc[c.key] < c.floor) low.push(c.label.toLowerCase() + ' (usually ' + money(c.floor) + ')');
    });
    if (low.length) add('warn', 'You are below the usual minimum for ' + low.join(' and ') + '. Cutting essentials tends to raise stress.');

    // 4. Saving habit
    if (state.saveZeroWeeks >= 2 && state.alloc.save === 0) {
      add('tip', 'You have not saved in ' + state.saveZeroWeeks + ' weeks. Even $10 a week builds a cushion for when a surprise hits.');
    }

    // 5. Social spending is the biggest line
    if (state.alloc.social >= 70) {
      add('tip', 'Social is ' + money(state.alloc.social) + ' this week. Fun counts, but check it against your cushion.');
    }

    // 6. Known costs coming up
    if (LOOKAHEAD[state.week]) add('tip', LOOKAHEAD[state.week]);

    // 7. Subscriptions
    var subs = state.recurring.subs;
    if (subs && subs.perWeek >= 8) {
      var left = EVENTS.length - state.week + 1;
      add('tip', 'Your subscriptions cost ' + money(subs.perWeek) + ' a week. Over the rest of the semester that is about ' + money(subs.perWeek * left) + '.');
    }

    if (hints.length === 0) {
      if (state.cash >= WEEKLY_NEEDS && state.cardDebt < 0.5) {
        add('good', 'You are on track: more than a week of expenses in cash and nothing building up on the card.');
      } else {
        add('tip', 'Drag a slider and watch the chart. The dashed line shows where this week would end.');
      }
    }
    return hints.slice(0, 4);
  }

  function ensureCoach() {
    if ($('coach')) return;
    var box = document.createElement('div');
    box.id = 'coach';
    box.className = 'coach';
    box.hidden = true;
    var label = document.createElement('span');
    label.className = 'coach-label';
    label.textContent = 'Coach';
    var text = document.createElement('p');
    text.id = 'coachText';
    box.appendChild(label);
    box.appendChild(text);
    $('controls').appendChild(box);
  }

  function renderCoach() {
    var box = $('coach');
    if (!box) return;
    var hints = computeHints();
    if (!hints.length) { box.hidden = true; box.style.display = 'none'; return; }
    box.hidden = false;
    box.style.display = '';
    box.className = 'coach ' + hints[0].kind;
    $('coachText').textContent = hints[0].text;
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
        stat('Overdraft fees paid', money(state.feesPaid)) +
        stat('Card interest paid', cents(state.interestPaid)) +
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
            '<span class="' + kind + '">' + signedExact(row.amount) + '</span></li>';
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
      var tabHints = computeHints();
      html += '<h3 class="panel-title">Coach</h3>' +
        (tabHints.length
          ? '<ul class="hint-list">' + tabHints.map(function (h) {
              return '<li class="hint ' + h.kind + '">' + escapeHtml(h.text) + '</li>';
            }).join('') + '</ul>'
          : '<p class="panel-lede">The coach has hints once you are budgeting for the week.</p>') +
        '<h3 class="panel-title" style="margin-top:16px">' + escapeHtml(ev.lesson) + '</h3>' +
        '<p class="panel-lede">' + escapeHtml(ev.takeaway) + '</p>' + sourceLinks(ev);
    } else {
      html += '<p class="panel-lede">The semester is finished.</p>' +
        '<button class="primary" type="button" data-action="results">See your results</button>';
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
    if (choice.trap) state.traps.push(choice.trap);
    if (choice.win) state.wins.push(choice.win);
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
    var save = state.alloc.save;
    var cardPay = Math.min(state.alloc.card, state.cardDebt);
    var spend = allocTotal() - save - state.alloc.card;
    var pay = payThisWeek();

    // Skipping essentials raises stress; a calm week lowers it.
    var shortfalls = 0;
    CATEGORIES.forEach(function (c) { if (c.floor > 0 && state.alloc[c.key] < c.floor) shortfalls += 1; });
    shortfalls = Math.min(2, shortfalls);
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
      if (cardPay > 0.005) {
        state.cash -= cardPay;
        state.cardDebt = round2(state.cardDebt - cardPay);
        net -= cardPay;
        addLedger(weekPlayed, 'Card payment', -cardPay);
      }
      if (net) flashMoney(net);

      if (save > 0) {
        state.cash -= save;
        state.savings += save;
        addLedger(weekPlayed, 'Moved to savings', -save);
      }
      state.totalSaved += save;
      state.saveZeroWeeks = save === 0 ? state.saveZeroWeeks + 1 : 0;

      // Interest grows on whatever you still owe on the card.
      if (state.cardDebt > 0.005) {
        var interest = round2(state.cardDebt * CARD_APR / 100 / 52);
        if (interest > 0) {
          state.cardDebt = round2(state.cardDebt + interest);
          state.interestPaid = round2(state.interestPaid + interest);
          addLedger(weekPlayed, 'Card interest (added to your card balance)', -interest);
        }
      }

      // Overdraft protection: savings cover a shortfall before the bank charges anything.
      if (state.cash < 0 && state.savings > 0) {
        var cover = Math.min(state.savings, -state.cash);
        state.savings -= cover;
        state.cash += cover;
        addLedger(weekPlayed, 'Covered from savings (overdraft protection)', cover);
        toast('Your account dipped below $0, so ' + money(cover) + ' moved over from savings.');
      }

      // Overdraft: still below $0 when the week ends costs a fee.
      if (state.cash < 0) {
        state.cash -= OVERDRAFT_FEE;
        state.feesPaid += OVERDRAFT_FEE;
        state.stress = clamp(state.stress + 1, 0, 8);
        addLedger(weekPlayed, 'Overdraft fee', -OVERDRAFT_FEE);
        toast('Overdraft: your account went below $0 and the bank charged a ' + money(OVERDRAFT_FEE) + ' fee.');
        setTimeout(function () { flashMoney(-OVERDRAFT_FEE); }, 450);
      }

      state.stress = shortfalls > 0 ? clamp(state.stress + shortfalls, 0, 8) : clamp(state.stress - 1, 0, 8);
      state.stressLog.push(state.stress);

      state.history.push({ week: weekPlayed, cash: state.cash });
      state.busy = false;
      renderMoney();
      renderChart();
      renderTabs();

      if (state.done) {
        setTimeout(showResults, 900);   // let the last chart point land first
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
      startTour(openEvent);   // the tutorial runs first, then the Week 1 event card opens
    }, 520);
  }

  // ---------- Cash GPA ----------
  function gradeLetter(gpa) {
    var table = [[3.85, 'A'], [3.5, 'A-'], [3.15, 'B+'], [2.85, 'B'], [2.5, 'B-'], [2.15, 'C+'], [1.85, 'C'], [1.5, 'C-'], [1.0, 'D']];
    for (var i = 0; i < table.length; i++) { if (gpa >= table[i][0]) return table[i][1]; }
    return 'F';
  }

  // Five parts, each scored 0 to 100, weighted into a 0.0 to 4.0 GPA.
  function computeResults() {
    var net = state.cash + state.savings - state.cardDebt;
    var avgStress = state.stressLog.length
      ? state.stressLog.reduce(function (a, b) { return a + b; }, 0) / state.stressLog.length
      : state.stress;

    var parts = [
      { key: 'buffer', name: 'Cushion', weight: 30, score: clamp(net / 10, 0, 100),
        note: 'You finished with ' + money(state.cash) + ' in cash and ' + money(state.savings) + ' saved' +
          (state.cardDebt > 0.5 ? ', and you owe ' + money(state.cardDebt) + ' on the card.' : '.') },
      { key: 'fees', name: 'Fees and interest', weight: 25, score: clamp(100 - state.feesPaid * 1.2 - state.interestPaid * 3, 0, 100),
        note: (state.feesPaid || state.interestPaid)
          ? 'You paid ' + money(state.feesPaid) + ' in overdraft fees and ' + cents(state.interestPaid) + ' in card interest.'
          : 'No overdraft fees and no card interest. That is money you kept.' },
      { key: 'saving', name: 'Saving habit', weight: 20, score: clamp(state.totalSaved / 4, 0, 100),
        note: 'You set aside ' + money(state.totalSaved) + ' over the semester. A good target is about $400.' },
      { key: 'calm', name: 'Stress', weight: 15, score: clamp(100 - avgStress * 12.5, 0, 100),
        note: 'Your average stress was ' + avgStress.toFixed(1) + ' out of 8.' },
      { key: 'traps', name: 'Traps avoided', weight: 10, score: clamp(100 - state.traps.length * 34, 0, 100),
        note: state.traps.length ? state.traps.join('. ') + '.' : 'You steered clear of every trap.' },
    ];

    var total = parts.reduce(function (sum, p) { return sum + p.score * p.weight / 100; }, 0);
    var gpa = Math.round(total * 0.04 * 10) / 10;
    return { parts: parts, gpa: gpa, letter: gradeLetter(gpa) };
  }

  function gpaMessage(gpa) {
    if (gpa >= 3.5) return 'You would graduate with honors in money. Your habits held up under pressure.';
    if (gpa >= 2.85) return 'A solid semester: a couple of expensive lessons, and now you know how to avoid them.';
    if (gpa >= 2.0) return 'A rough few weeks, which is exactly what practice is for. Your moves below fix the biggest ones.';
    return 'This semester hit hard, and it cost you nothing real. Rewind it with a buffer and see what changes.';
  }

  // If-then moves (implementation intentions): a plan made in advance beats willpower in the moment.
  var MOVES = {
    card:   'If I carry a card balance, then I pay more than the interest every week until it is gone.',
    buffer: 'If my cash drops under about $540 (four weeks of basics), then I pause wants like social and delivery until it is back up.',
    fees:   'If my balance drops under $50, then I stop spending for the week. A $35 overdraft fee is never worth a $12 takeout.',
    saving: 'If it is payday, then I move a small amount to savings first, even $10.',
    calm:   'If money gets tight, then I cut wants like social and delivery before I cut food or school supplies.',
    traps:  'If something says free trial, pay in 4, or a stranger sends me a check, then I wait 48 hours and check the source first.',
  };
  var FILLER_MOVES = [
    'If a friend asks to borrow money, then I lend only what I can afford to lose.',
    'If a big cost is coming (travel, textbooks), then I save a little each week ahead of time.',
    'If I see a great deal, then I wait 48 hours before I buy.',
  ];

  function buildMoves(res) {
    var picks = [];
    if (state.cardDebt > 0.5) picks.push('card');
    res.parts.slice().sort(function (a, b) { return a.score - b.score; }).forEach(function (p) {
      if (p.score < 85 && picks.length < 3 && picks.indexOf(p.key) === -1) picks.push(p.key);
    });
    var moves = picks.slice(0, 3).map(function (k) { return MOVES[k]; });
    FILLER_MOVES.forEach(function (f) { if (moves.length < 3) moves.push(f); });
    return moves;
  }

  // ---------- Overlays: results and sources ----------
  function ensureOverlay(id, bodyId, label) {
    if ($(id) && $(bodyId)) return;
    var overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = id;
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', label);
    var sheet = document.createElement('div');
    sheet.className = 'sheet';
    var bodyEl = document.createElement('div');
    bodyEl.id = bodyId;
    sheet.appendChild(bodyEl);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
  }

  function showResults() {
    var res = computeResults();
    if (!state.resultsShown) {
      state.resultsShown = true;
      runLog.push({ label: state.buffer ? 'With a ' + money(state.buffer) + ' buffer' : 'First run', gpa: res.gpa });
    }
    state.lastMoves = buildMoves(res);

    var html = '<p class="modal-week">Semester complete' + (state.buffer ? '  \u00B7  Rewind with a ' + money(state.buffer) + ' buffer' : '') + '</p>' +
      '<h2 class="modal-title" id="resultsTitle">Your Cash GPA</h2>' +
      '<div class="gpa-row"><div class="gpa-big">' + res.gpa.toFixed(1) + '</div>' +
      '<div><div class="gpa-grade">' + res.letter + '</div><p class="gpa-msg">' + escapeHtml(gpaMessage(res.gpa)) + '</p></div></div>';

    if (runLog.length >= 2) {
      var now = runLog[runLog.length - 1];
      var before = runLog[runLog.length - 2];
      var diff = Math.round((now.gpa - before.gpa) * 10) / 10;
      html += '<p class="compare">' + escapeHtml(before.label) + ': ' + before.gpa.toFixed(1) + '. This run: ' + now.gpa.toFixed(1) +
        (diff !== 0 ? '  (' + (diff > 0 ? '+' : '\u2212') + Math.abs(diff).toFixed(1) + ')' : '  (no change)') + '</p>';
      html += '<p class="compare-note">Rewind keeps the same events and prices. The buffer is a head start, and your choices still decide where you end up.</p>';
    }

    html += '<h3 class="modal-sub">How it was graded</h3><ul class="grades">' + res.parts.map(function (p) {
      var v = Math.round(p.score);
      return '<li class="grade"><span class="g-name">' + escapeHtml(p.name) + ' <small>' + p.weight + '%</small></span>' +
        '<span class="g-bar"><span class="g-fill" style="width:' + v + '%"></span></span>' +
        '<span class="g-num">' + v + '</span>' +
        '<span class="g-note">' + escapeHtml(p.note) + '</span></li>';
    }).join('') + '</ul>';

    if (state.wins.length || state.traps.length) {
      html += '<h3 class="modal-sub">What shaped your semester</h3><ul class="shape">' +
        state.wins.map(function (w) { return '<li class="win">' + escapeHtml(w) + '</li>'; }).join('') +
        state.traps.map(function (t) { return '<li class="trap">' + escapeHtml(t) + '</li>'; }).join('') + '</ul>';
    }

    html += '<h3 class="modal-sub">Your first three moves</h3><ol class="moves">' +
      state.lastMoves.map(function (m) { return '<li>' + escapeHtml(m) + '</li>'; }).join('') + '</ol>' +
      '<div class="results-actions">' +
      '<button type="button" class="primary" data-action="rewind">Rewind with a $500 buffer</button>' +
      '<button type="button" class="secondary" data-action="again">Play again from scratch</button>' +
      '<button type="button" class="secondary" data-action="copy">Copy my plan</button>' +
      '<button type="button" class="secondary" data-action="sources">See the sources</button>' +
      '</div>' +
      '<p class="fine-print">Fundergrad is a teaching model with simplified, partly estimated prices. It is not personal financial advice.</p>';

    $('resultsBody').innerHTML = html;
    $('results').hidden = false;
    setAppInert(true);
    focusFirst($('resultsBody'));
  }

  function sourcesHtml() {
    var html = '<p class="modal-week">Every lesson in Fundergrad is backed by a public source.</p>' +
      '<h2 class="modal-title" id="sourcesTitle">Sources</h2>' +
      '<p class="modal-blurb">Prices that are not listed below are game estimates, not published statistics. The overdraft fee, the card interest rate (about 22% APR, from the Federal Reserve G.19 release), and the textbook range are the sourced figures.</p>';
    EVENTS.forEach(function (ev) {
      html += '<h3 class="modal-sub">Week ' + ev.week + ': ' + escapeHtml(ev.lesson) + '</h3>' + sourceLinks(ev);
    });
    var k = SOURCES.NOBEL_KAHNEMAN;
    html += '<h3 class="modal-sub">Behavioral science background</h3><ul class="source-list"><li><a href="' + k.url +
      '" target="_blank" rel="noopener">' + escapeHtml(k.title) + '</a><div class="org">' + escapeHtml(k.org) + '</div></li></ul>' +
      '<div class="modal-actions"><button type="button" class="primary" data-action="close-sources">Close</button></div>';
    return html;
  }

  function openSources() {
    $('sourcesBody').innerHTML = sourcesHtml();
    $('sourcesOverlay').hidden = false;
    setAppInert(true);
    focusFirst($('sourcesBody'));
  }

  function closeSources() {
    $('sourcesOverlay').hidden = true;
    var stillOpen = !$('results').hidden || !$('eventModal').hidden;
    setAppInert(stillOpen);
    if (!$('results').hidden) focusFirst($('resultsBody'));
  }

  function copyPlan() {
    var text = 'My Fundergrad plan\n' + state.lastMoves.map(function (m, i) { return (i + 1) + '. ' + m; }).join('\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast('Plan copied.'); },
        function () { toast('Could not copy automatically. Select the text and copy it.'); }
      );
    } else {
      toast('Could not copy automatically. Select the text and copy it.');
    }
  }

  // Start a clean semester. buffer is extra starting cash (the Rewind run).
  function restart(buffer) {
    $('results').hidden = true;
    $('sourcesOverlay').hidden = true;
    state = newState(buffer);
    buildSliders();
    renderProgress();
    renderControls();
    renderMoney();
    renderTabs();
    setAppInert(false);
    if (buffer) toast('Rewound: the same semester, starting with ' + money(buffer) + ' more in cash.');
    openEvent();
  }

  // ---------- Tutorial: spotlight, arrow, and a short text box ----------
  // Each step points at one part of the screen. Steps without a target are centered cards.
  var TOUR_STEPS = [
    { title: 'Welcome to Fundergrad',
      text: 'This is a fourteen-week college semester where your money choices have real consequences. Make your mistakes here, with fake money, so the real ones cost less. You finish with a Cash GPA.' },
    { target: function () { return $('weekTrack'); }, side: 'bottom', title: 'Your semester',
      text: 'This bar tracks the fourteen weeks. The blue dots mark Fall Break and Thanksgiving, when costs spike.' },
    { target: function () { return $('sliders'); }, side: 'right', title: 'Your weekly budget',
      text: 'These toggles decide where your paycheck goes: food, getting around, school, social, and savings. Where the money goes is the whole game.' },
    { target: function () { return $('available') && $('available').parentNode && $('available').parentNode.parentNode; }, side: 'right', title: 'What is left to spend',
      text: 'Available is what remains of this week\u2019s budget. You cannot lock in a week if you have given out more than you have.' },
    { target: function () { return $('cashWrap') && $('cashWrap').parentNode; }, side: 'bottom', title: 'Your accounts',
      text: 'Cash, savings, your card balance, and stress. A green flash means money in. A red flash means money out.' },
    { target: function () { return $('chartWrap'); }, side: 'left', title: 'Preview before you commit',
      text: 'The blue line is your cash so far. The dashed gold line shows where this week would end if you locked in now. Below $0 is the overdraft zone, which costs a $35 fee.' },
    { target: function () { return $('tabs'); }, side: 'top', title: 'Insight tabs',
      text: 'Scorecard tracks your money health. Account lists every dollar. This week recaps the event. Hints and sources holds the coach\u2019s advice and the sources behind each lesson.' },
    { target: function () { return $('coach'); }, side: 'right', title: 'Your coach',
      text: 'The coach reads your numbers and gives hints. It follows fixed rules, so it is not a chatbot, and its advice is the same every time.' },
    { target: function () { return $('btnLock'); }, side: 'right', title: 'Lock it in',
      text: 'When your plan looks right, lock in the week. Your pay arrives, bills leave, and the next event opens.' },
    { title: 'Ready?',
      text: 'Every week starts with an event: a late paycheck, a dead laptop, a job offer that is too good to be true. Choose carefully, then budget the week. Good luck.' },
  ];

  var tour = { steps: [], index: 0, done: null };

  function rectOf(el) {
    return el.getBoundingClientRect ? el.getBoundingClientRect()
      : { left: 40, top: 40, right: 240, bottom: 100, width: 200, height: 60 };
  }
  function isShown(el) {
    if (!el || el.hidden) return false;
    if (el.style && el.style.display === 'none') return false;
    var r = rectOf(el);
    return r.width > 0 && r.height > 0;
  }

  function ensureTour() {
    if ($('tour') && $('tourCard')) return;
    var root = document.createElement('div');
    root.className = 'tour';
    root.id = 'tour';
    root.hidden = true;
    root.innerHTML =
      '<div class="tour-dim" id="tourDim"></div>' +
      '<div class="tour-spot" id="tourSpot"></div>' +
      '<div class="tour-card" id="tourCard" role="dialog" aria-modal="true" aria-labelledby="tourTitle">' +
        '<span class="tour-arrow" id="tourArrow"></span>' +
        '<p class="tour-step" id="tourStep"></p>' +
        '<h2 class="tour-title" id="tourTitle"></h2>' +
        '<p class="tour-text" id="tourText"></p>' +
        '<div class="tour-actions">' +
          '<button type="button" class="linkish" data-tour="skip">Skip tutorial</button>' +
          '<span class="spacer"></span>' +
          '<button type="button" class="secondary" id="tourBack" data-tour="back">Back</button>' +
          '<button type="button" class="primary" id="tourNext" data-tour="next">Next</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
  }

  function positionTour() {
    if ($('tour').hidden || !tour.steps.length) return;
    var step = tour.steps[tour.index];
    var card = $('tourCard'), spot = $('tourSpot'), arrow = $('tourArrow'), dim = $('tourDim');
    var vw = (typeof window !== 'undefined' && window.innerWidth) || 1200;
    var vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
    var cw = card.offsetWidth || 340;
    var ch = card.offsetHeight || 230;
    var el = step.target ? step.target() : null;

    if (!el) {                                   // centered card, no arrow
      dim.style.display = '';
      spot.style.display = 'none';
      arrow.style.display = 'none';
      card.style.left = Math.max(12, (vw - cw) / 2) + 'px';
      card.style.top = Math.max(12, (vh - ch) / 2 - 20) + 'px';
      return;
    }

    var r = rectOf(el);
    var pad = 6;
    dim.style.display = 'none';
    spot.style.display = '';
    spot.style.left = (r.left - pad) + 'px';
    spot.style.top = (r.top - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px';
    spot.style.height = (r.height + pad * 2) + 'px';

    var gap = 20;
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    function placeFor(side) {
      if (side === 'right')  return { x: r.right + gap, y: cy - ch / 2 };
      if (side === 'left')   return { x: r.left - gap - cw, y: cy - ch / 2 };
      if (side === 'bottom') return { x: cx - cw / 2, y: r.bottom + gap };
      return { x: cx - cw / 2, y: r.top - gap - ch };                       // top
    }
    function fits(p) { return p.x >= 8 && p.y >= 8 && p.x + cw <= vw - 8 && p.y + ch <= vh - 8; }

    var opposite = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' };
    var order = [step.side, opposite[step.side], 'bottom', 'top', 'right', 'left'];
    var side = null, pos = null;
    for (var i = 0; i < order.length; i++) {
      var p = placeFor(order[i]);
      if (fits(p)) { side = order[i]; pos = p; break; }
    }

    if (!side) {                                  // nothing fits: tuck the card inside the target, no arrow
      card.style.left = clamp(r.right - cw - 16, 8, vw - cw - 8) + 'px';
      card.style.top = clamp(r.top + 16, 8, vh - ch - 8) + 'px';
      arrow.style.display = 'none';
      return;
    }

    pos.x = clamp(pos.x, 8, vw - cw - 8);
    pos.y = clamp(pos.y, 8, vh - ch - 8);
    card.style.left = pos.x + 'px';
    card.style.top = pos.y + 'px';

    // The arrow sits on the card edge that faces the target and points at it.
    arrow.style.display = '';
    if (side === 'bottom' || side === 'top') {
      arrow.className = 'tour-arrow ' + (side === 'bottom' ? 'a-up' : 'a-down');
      arrow.style.left = clamp(cx - pos.x - 7, 16, cw - 30) + 'px';
      arrow.style.top = (side === 'bottom' ? -8 : ch - 6) + 'px';
    } else {
      arrow.className = 'tour-arrow ' + (side === 'right' ? 'a-left' : 'a-right');
      arrow.style.top = clamp(cy - pos.y - 7, 16, ch - 30) + 'px';
      arrow.style.left = (side === 'right' ? -8 : cw - 6) + 'px';
    }
  }

  function renderTourStep() {
    var step = tour.steps[tour.index];
    var total = tour.steps.length;
    var last = tour.index === total - 1;
    $('tourStep').textContent = 'Step ' + (tour.index + 1) + ' of ' + total;
    $('tourTitle').textContent = step.title;
    $('tourText').textContent = step.text;
    $('tourBack').style.visibility = tour.index === 0 ? 'hidden' : 'visible';
    $('tourNext').textContent = last ? (tour.done ? 'Start Week 1' : 'Got it') : 'Next';
    var el = step.target ? step.target() : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    positionTour();
    if (typeof $('tourNext').focus === 'function') $('tourNext').focus();
  }

  function startTour(done) {
    ensureTour();
    // Skip any step whose target is not on screen right now (for example, no coach hint yet).
    tour.steps = TOUR_STEPS.filter(function (st) { return !st.target || isShown(st.target()); });
    tour.index = 0;
    tour.done = done || null;
    $('tour').hidden = false;
    setAppInert(true);
    renderTourStep();
  }

  function endTour() {
    $('tour').hidden = true;
    setAppInert(false);
    var done = tour.done;
    tour.done = null;
    if (done) done();
  }

  function nextTour() {
    if (tour.index >= tour.steps.length - 1) endTour();
    else { tour.index += 1; renderTourStep(); }
  }
  function backTour() {
    if (tour.index > 0) { tour.index -= 1; renderTourStep(); }
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

  // The rail Tutorial button lives in index.html. Build it here if that file is an older copy.
  function ensureTutorialButton() {
    if ($('btnTutorial')) return;
    var menu = $('btnMenu');
    if (!menu || !menu.parentNode) return;
    var btn = document.createElement('button');
    btn.className = 'rail-btn';
    btn.id = 'btnTutorial';
    btn.type = 'button';
    btn.innerHTML = '<span class="rail-icon" aria-hidden="true">?</span><span>Tutorial</span>';
    menu.parentNode.appendChild(btn);
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
    ensureOverlay('results', 'resultsBody', 'Your results');
    ensureOverlay('sourcesOverlay', 'sourcesBody', 'Sources');
    ensureCoach();
    ensureTour();
    ensureTutorialButton();
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

    // Keep keyboard focus inside whichever overlay is on top. Escape closes the Sources screen.
    function topOverlay() {
      var ids = ['tour', 'sourcesOverlay', 'results', 'eventModal'];
      for (var i = 0; i < ids.length; i++) {
        var el = $(ids[i]);
        if (el && !el.hidden) return el;
      }
      return null;
    }
    document.addEventListener('keydown', function (e) {
      var overlay = topOverlay();
      if (!overlay) return;
      if (overlay.id === 'tour') {
        if (e.key === 'Escape') { endTour(); return; }
        if (e.key === 'ArrowRight') { nextTour(); return; }
        if (e.key === 'ArrowLeft') { backTour(); return; }
      }
      if (e.key === 'Escape' && overlay.id === 'sourcesOverlay') { closeSources(); return; }
      if (e.key !== 'Tab' || typeof overlay.querySelectorAll !== 'function') return;
      var items = overlay.querySelectorAll('button:not([disabled]), a[href]');
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
      var action = node && node.getAttribute && node.getAttribute('data-action');
      if (action === 'open' && state.eventPending) {
        $('eventModal').hidden = false;
        setAppInert(true);
        renderModal();
      } else if (action === 'results' && state.done) {
        showResults();
      }
    });

    // The left-rail Sources button opens the full Sources screen. It only opens when you ask.
    $('btnSources').addEventListener('click', openSources);

    $('tour').addEventListener('click', function (e) {
      var node = closestWith(e.target, '[data-tour]');
      var name = node && node.getAttribute && node.getAttribute('data-tour');
      if (name === 'next') nextTour();
      else if (name === 'back') backTour();
      else if (name === 'skip') endTour();
    });
    $('btnTutorial').addEventListener('click', function () {
      var busy = state.eventPending || state.busy || !$('tour').hidden || !$('results').hidden || !$('sourcesOverlay').hidden;
      if (!busy) startTour(null);
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', positionTour);
    }

    $('results').addEventListener('click', function (e) {
      var node = closestWith(e.target, '[data-action]');
      var action = node && node.getAttribute && node.getAttribute('data-action');
      if (action === 'rewind') restart(500);
      else if (action === 'again') restart(0);
      else if (action === 'copy') copyPlan();
      else if (action === 'sources') openSources();
    });

    $('sourcesOverlay').addEventListener('click', function (e) {
      var node = closestWith(e.target, '[data-action]');
      if (node && node.getAttribute && node.getAttribute('data-action') === 'close-sources') closeSources();
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
