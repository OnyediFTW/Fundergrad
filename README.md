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

A short guided tutorial runs when you press Start (arrows and text boxes point at each part of the screen). The **Tutorial** button on the left rail replays it any time.

1. Each week an **event card** opens (a late paycheck, a dead laptop, a fake-check job offer). Pick a choice.
2. See **what happened**, **why it matters**, and the **source** behind the lesson.
3. Split the week's money across food, getting around, school, social, and savings. The cash chart previews where you will end up before you commit.
4. **Lock in the week.** Fourteen weeks later, your semester is graded.

## The rules behind the numbers

- **Overdraft:** if your cash is below $0 when the week ends, your savings cover the gap first (overdraft protection). Only what savings cannot cover costs a **$35** fee (CFPB) and more stress.
- **Credit card:** carry a balance and it grows at about **22% APR** (Federal Reserve), charged weekly. A "Pay down card" slider appears whenever you owe money.
- **Stress:** skipping food, transport, or school supplies raises it; a calm week lowers it.
- **Coach:** a rules-based helper that reads your numbers and gives up to four hints. It never calls an AI, so every hint is repeatable and traceable to a rule.

## How the Cash GPA works

Graded from 0.0 to 4.0 across five parts. These weights and targets are game design choices, not published standards.

| Part | Weight | What earns full marks |
|---|---|---|
| Cushion | 30% | Finishing with about $1,000 in cash plus savings, minus any card balance |
| Fees and interest | 25% | No overdraft fees and no card interest |
| Saving habit | 20% | Setting aside about $400 over the semester |
| Stress | 15% | Low average stress across the 14 weeks |
| Traps avoided | 10% | No fake-check scam, no ignored subscriptions, no pay-in-4 impulse buy |

The results screen ends with three personal **if-then moves**, chosen from your weakest parts. **Rewind** replays the same semester with a $500 buffer and shows the GPA difference.

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
- [x] Cash GPA, results screen, Rewind, and a Sources screen
- [x] Guided tutorial with spotlight, arrows, and text boxes
- [ ] Polish and demo link
