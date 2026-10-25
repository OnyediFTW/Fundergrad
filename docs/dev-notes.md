# Dev notes

## Why plain scripts and not ES modules
Browsers block module imports from `file://`, so `index.html` would only work through a server.
Plain `<script>` tags, loaded in order (`sources.js`, `events.js`, `game.js`), work on a double-click.

## Testing tools
Add `#dev` to the end of the address. A small "Testing" bar appears in the bottom-right corner with
buttons for week back, week forward, money in (green flash), and money out (red flash).
The keys `[` `]` `=` `-` do the same. These tools only change what is on screen, not the ledger.

## Checks used while building
- Data check: 14 events, every source key resolves, every choice has an effects list.
- Smoke test: `game.js` runs in a fake DOM and plays all 14 weeks without errors.
- Not yet checked: how it looks in a real browser. Open it and look.

## Build steps
1. Plan, event data, sources (this commit)
2. Layout and weekly ledger skeleton
3. Event cards and choice effects
4. Hint engine, overdraft fee, card interest, scheduled payments
5. Cash GPA, results screen, Rewind
6. Tutorial arrows and sources screen
7. Polish, README, demo link
