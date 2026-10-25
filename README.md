# Fundergrad

**Pilot your college budget.**

Fundergrad is a 14-week money game for college students. Each week you split a paycheck across food, getting around, school, social, and savings, then face a real-world event (textbooks, a delayed paycheck, a fake-check job offer) and make a call. Every lesson links to a government or Nobel Prize source.

Built solo for **HackPSU 2026** in the **FNB Challenge: Trust, Decisions & Financial Confidence** track.

## The problem

People get money advice from everywhere (chatbots, TikTok, family) and it usually arrives as a confident verdict with no practice behind it. Many college students make their first real money decisions with no rehearsal, and the first mistakes (an overdraft fee, a credit card balance, a scam) are the expensive ones.

## The idea

Make the mistakes here first. Fundergrad turns a semester into a game with real prices, then shows what each choice cost and links to the source behind the lesson. A live cash chart shows where your balance will land before you lock in each week, so the consequence of every slider is visible first. The game engine is rules-based and deterministic, so results are repeatable and every number can be traced.

## How it maps to the FNB prompt

- **Information to understanding:** you feel the cost of a choice instead of reading about it.
- **Understanding to confidence:** you finish a full semester, then replay it with a buffer.
- **Confidence to action:** the results screen ends with a short personal plan.
- **Trusted-source validation:** each lesson links to an agency or Nobel Prize page. See `docs/sources.md`.
- **Behavioral science:** loss aversion, mental accounting, and self-control shape the mechanics.

## How to play

1. Each week an **event card** opens (a late paycheck, a dead laptop, a fake-check job offer). Pick a choice.
2. See **what happened**, **why it matters**, and the **source** behind the lesson.
3. Split the week's money across food, getting around, school, social, and savings. The cash chart previews where you will end up before you commit.
4. **Lock in the week.** Fourteen weeks later, your semester is graded.

## The rules behind the numbers

- **Overdraft:** if your cash is below $0 when the week ends, the bank charges **$35** (CFPB) and stress rises.
- **Credit card:** carry a balance and it grows at about **22% APR** (Federal Reserve), charged weekly. A "Pay down card" slider appears whenever you owe money.
- **Stress:** skipping food, transport, or school supplies raises it; a calm week lowers it.
- **Coach:** a rules-based helper that reads your numbers and gives up to four hints. It never calls an AI, so every hint is repeatable and traceable to a rule.

## Run it

No install, no server. Open `index.html` in a browser.

To run the data and smoke checks used during development: `node` is the only requirement (see `docs/dev-notes.md`).

## Project layout

```
index.html        game shell
css/styles.css    look and feel
js/sources.js     every cited source, in one place
js/events.js      the 14 weekly events (edit costs and choices here)
js/game.js        game logic
assets/           logo and images
docs/             plan, source list, event table, dev notes
```

## Honest notes about the numbers

- Sourced figures: textbook cost range (College Board), credit card APR of about 22% (Federal Reserve G.19), overdraft fee of $35 (CFPB).
- Everything else (the $620 textbook set, the $85 concert, the laptop prices, and so on) is a **game estimate** chosen to be plausible, not a published statistic.
- Fundergrad is a teaching model, not personal financial advice.

## Status

- [x] Plan, event data, and source list
- [x] Layout and weekly ledger skeleton
- [x] Cash chart with a live preview as you move the sliders
- [x] Event cards and choice effects
- [x] Overdraft fee, card interest, and a rules-based coach
- [ ] Cash GPA, results screen, Rewind
- [ ] Tutorial arrows and sources screen
- [ ] Polish and demo link
