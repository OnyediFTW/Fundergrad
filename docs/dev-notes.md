# Dev notes

## Why plain scripts and not ES modules
Browsers block module imports from `file://`, so `index.html` would only work through a server.
Plain `<script>` tags, loaded in order (`sources.js`, `events.js`, `game.js`), work on a double-click.

## Testing tools
Add `#dev` to the end of the address. A small "Testing" bar appears in the bottom-right corner with
buttons for week back, week forward, money in (green flash), and money out (red flash).
The keys `[` `]` `=` `-` do the same. The money buttons only change what is on screen, not the ledger.
Stepping weeks with these tools skips that week's event, so use them for looking, not for playing.

## Checks used while building
- Data check: 14 events, every source key resolves, every choice has an effects list.
- Smoke test: `game.js` runs in a fake DOM and plays all 14 weeks without errors, including the chart preview, Scorecard meters, and the overdraft warning.
- Not yet checked: how it looks in a real browser. Open it and look.

## Build steps
1. Plan, event data, sources
2. Layout and weekly ledger skeleton
2b. Cash chart with live preview (replaced the radar)
3. Event cards and choice effects (done)
4. Hint engine, overdraft fee, card interest
5. Cash GPA, results screen, Rewind
6. Tutorial arrows and sources screen
7. Polish, README, demo link
