# Tourney

Tournament scoring for teams of two: a single-elimination bracket and a points
counter. No build step, no server, no dependencies - open `index.html` in a
browser and it works.

## Run it

Double-click `index.html`, or serve the folder (recommended, keeps saving reliable):

    python -m http.server 5599

then open http://localhost:5599

## What it does

- **Solo or pairs** - each entrant is one person or a team of two, chosen per entry — team name plus both participant names and a photo each.
  Photos are downscaled to 400px JPEG in the browser before being stored.
- **Seeding** — the list order is the seeding. Drag rows to re-seed, or use the
  arrows. `Shuffle` randomizes and clears results.
- **Bracket** — built automatically for the next power of two, with byes handed
  to the top seeds. Click a team to advance it; click again to undo.
- **Points** — a third tab with a counter per team: big running total, `+` / `−`
  buttons with a selectable step (1 / 5 / 10), or type an exact number. Card order
  is your choice: **Line-up** leaves every card where it is, **Top first** ranks by
  score and glides cards into place. The clear leader gets a badge, and totals can
  go negative for penalties. Clicking `+` updates that one card in place — the board
  is never rebuilt, so nothing scrolls or re-animates under your cursor.
- **Darts** - three games on their own page. **501** and **301** count down from a
  typed turn total with a keypad and quick-score buttons; going below zero (or
  landing on one with double out) is a bust and the score stays put. **Mickey Mouse**
  is the marks game: close 20 down to 15 (or 12) plus the bull, three marks each,
  first to close everything wins. Undo covers the last turn, and averages, turn
  counts and an on-a-finish flag show on every player card.
- **MTG** - a Commander life counter. Two to six seats, each panel rotated to face
  its own chair, starting life 20/30/40, and big tap targets at both ends of every
  panel for gaining and losing life. The chips are commander damage from each
  opponent: click to add one (it takes a life with it), right-click to take it back,
  and 21 from a single player knocks you out. Optionally seat your entrants so the
  panels carry their names and photos. Seat colours follow the active theme.
- **Simulate** — fills the remaining matches with random winners, one at a time.
- **Winning a match** — the slot sweeps green, the photos hop, a small burst
  fires from the click, and a glowing token travels the connector line into the
  next round, where the arriving team flashes.
- **Champion** — banner plus a confetti burst when the final is decided.
- **Saving** — everything is kept in `localStorage`, per browser. `Export`
  writes a JSON file; `Import` loads one back (good for moving between machines
  or keeping a backup before a big edit).

## Themes

Nine skins, toggled on the Teams page and remembered with the rest of the state:

- **Aurora** — the default: dark glass, violet/fuchsia/cyan gradients.
- **Grand Prix** — a racing skin: clear sky with a checkered finish-line strip,
  cream panels with hard cartoon outlines, checkered-flag accents, rounds renamed
  to races and matchups to heats, and a kart that drives the winner up the bracket.
  Built from generic racing motifs only — no third-party game artwork or marks.
- **Music** — a record-shop skin, and the only light one: warm paper ground with
  faint groove and grain texture, opaque cream sleeves outlined in ink, album-art
  squares instead of round avatars, Bebas Neue display type, and orange-red/teal
  accents. On the Points tab each team score sits on a **spinning vinyl** whose
  label carries the number; scoring spins the record. Rounds become sets
  (`Set 1`, `Encore`), matchups become tracks, the leader is `NOW PLAYING` with a
  small meter, and the champion is the headliner.
- **Halloween** — candlelit black with pumpkin orange and toxic green, a low moon,
  drifting fog, cobwebbed corners, Creepster display type and a flickering jack-o
  logo. Rounds are haunts, matchups are duels, the winner is the sole survivor, and
  the counter glows like a candle. A bat carries the winner up the bracket.
- **Christmas** — evergreen night with two layers of falling snow, a candy-cane
  striped topbar edge, holly red and mint accents and Mountains of Christmas type.
  Each score hangs in a red **bauble** with a silver cap that swings when you score.
  The final is the Grand Finale and the leader is on the nice list.
- **New Year** — midnight sky with twinkling stars and three fireworks bursting on a
  loop, silver-and-blue deco palette with Cinzel type. Scores are struck on a
  **silver medallion** with a sweeping sheen. The final is the Countdown and the
  winner is the Toast of the Night.

- **MTG** — a card-frame skin: dark table, parchment panels inside dark-wood
  borders, Cinzel serif type, crimson accents, and the five colours of mana as the
  life-counter seats. Rounds are duels and the champion is the Archmage.

- **Darts** — a pub chalkboard: dark slate-green board, cream chalk type in Caveat,
  chalk-line texture and a dartboard hanging behind the content in board red and
  green. Rounds are legs, matches are boards, and the champion gets a Checkout.
- **Beer pong** — a wooden table seen from above, with a rack of red cups at one end
  and blue at the other. Cream cards with hard outlines, Bangers lettering, and
  cup-red accents. Rounds end in the Last Cup and results are Sunk.

## On a phone

The whole app is built to work one-handed:

- Tap targets are at least 44px, inputs are 16px so iOS does not zoom on focus, and
  every control sets `touch-action: manipulation` to kill the double-tap zoom delay.
- The **top bar collapses** with the round chevron on its right: the title and the
  Export/Import buttons fold away, the tabs stay on one scrollable row, and the MTG
  counter grows into the space. On a 375px phone that is 180px down to 70px. The
  choice is remembered.
- The tab strip scrolls sideways instead of stacking, and no page ever scrolls
  horizontally.
- **Long press replaces right-click** - phones have no right-click, so taking a
  commander damage counter or a Mickey Mouse mark back off works by holding the cell.
- The MTG counter keeps its two-column table layout on a phone, sized with `dvh` so
  the seats fill the screen under the browser chrome rather than being cut off.
- Re-seeding entrants uses the arrow buttons on touch; drag and drop is mouse only.

## Keyboard

- `+` / `-` — zoom the bracket
- `Esc` — cancel an in-progress team edit
- `Enter` in any form field — save the team

## Hosting

The site is static with relative paths and no build step, so it drops straight onto
GitHub Pages (or any static host). Push to a repo, then in **Settings -> Pages** set
the source to `main` / root. A `.nojekyll` file is included so Pages serves the
files as-is, and `CNAME` points the site at tourney.dk.

Nothing personal lives in the repo: teams, photos and scores are all held in your
browser localStorage, never in these files. That also means the hosted copy starts
empty even if localhost is full - localStorage is per-origin. Use **Export** on one
and **Import** on the other to move a tournament across.

## Files

- `index.html` — markup
- `styles.css` — design system and all animation
- `app.js` — state, bracket maths, rendering, interactions

## Notes

- Photos live inside `localStorage` as data URLs, which caps out around 5 MB per
  browser — roughly 40-60 photos at the current size. Export to a file if you
  want a bigger or permanent archive.
- The bracket is recomputed from `teams` + `picks` on every render, so editing
  teams mid-tournament can never leave a half-broken tree.
