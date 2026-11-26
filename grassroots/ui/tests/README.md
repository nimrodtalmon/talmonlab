# Regression tests of the demo

Each flow is walked on a fresh page as Alice, a screenshot at each step, on three devices: desktop
(1400×1000, Chromium), Pixel 7 (Chromium, its emulation) and iPhone 14 (WebKit, its emulation; Chromium with
its viewport and user agent if WebKit is not installed, and the report says which).  First, the checker runs
over every module (`modules/*.ui` with its `.style`): it reads, it covers the contract, its UI style checks.

| Flow | What it walks |
|---|---|
| `home-first-app` | App's Home: an identity, a friend (Carol), the apps she offers; the hint "To Install: it needs that you trust Carol as a developer" and its button; Install; THEN IT to the app's screen; Open Chess |
| `chess` | the hint to New game and its button Make friends; the empty-list hint on Games; New game, THEN IT to the game; a move (e2–e4) and Carol's reply |
| `village-org` | Start an organization from the Orgs landmark; the field labeled "Your role in it"; THEN IT to the organization |
| `groups-post` | New group, THEN IT to the group; a post |
| `help` | the help sheet, from the contract |
| `confirm-ending` | End friendship takes a second tap |
| `real-*` (with `--real`) | App, Friendship and Groups on the real GLP agents (`?real=1`) |

Run, from `grassroots/ui/`:

    bash tests/run.sh                          # local: serves grassroots/ on :8765
    bash tests/run.sh --base https://talmonlab.bgu.ac.il/grassroots/ui/ --real
    node tests/run.js --devices desktop --flows chess --out /tmp/out

Screenshots go to `tests/out/<device>/<flow>/` (or `--out`), with `results.json`; a failed flow leaves
`FAILED.png`.  It needs Node and Playwright (`npm i -g playwright && npx playwright install chromium webkit`).
