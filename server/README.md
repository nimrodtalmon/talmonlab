# talmonlab.bgu.ac.il — how the server works

A Windows machine at BGU (132.72.116.76). Ports 80 and 443 are open to the
internet; logging in needs the BGU VPN and Remote Desktop, but day-to-day changes
do not: **the server follows this repo.**

Status: <https://talmonlab.bgu.ac.il/status/> (apps up or down, deployed commit,
last restart, missing secrets, recent log).

## How it works

Every 5 minutes (and at boot) the task `talmonlab-reconcile` runs
[`reconcile.ps1`](reconcile.ps1) as SYSTEM. It pulls this repo into `C:\sites\root`
and then makes the server match it:

- **Home page** (`/`): `index.html` of this repo, served as static files, with section pages in subfolders (`grassroots/`, `research/`; shared `style.css`). A subfolder name must not clash with an app name.
- **Apps** ([`apps.json`](apps.json)): each is cloned to `C:\sites\<name>` and kept at
  its GitHub version. When the code changes it is reinstalled (Python:
  `requirements.txt` into `.venv`; otherwise the app's `build` script from this
  folder) and restarted. An app that is down is restarted. Each app runs from the
  generated `C:\sites\run-<name>.ps1` as the boot-time task `<name>-run`, listening
  only on 127.0.0.1:`port`. An app removed from `apps.json` is stopped (its files stay).
- **Caddy** (Windows service `caddy`) is the only thing facing the internet. It gets
  the HTTPS certificate by itself and routes `/<name>/…` to each app with the prefix
  stripped, so an app sees `/` but must link with its prefix (BGULAB: `BASE_PATH`;
  the GLP pages use relative links). The Caddyfile is generated from `apps.json`
  and checked before Caddy is restarted.
- **Logs**: `C:\sites\logs\reconcile.log` and `C:\sites\logs\<name>.log`.
- **Secrets** never enter this repo: `C:\sites\secrets\<name>.ps1` (lines like
  `$env:KEY = '...'`), readable only by Administrators and SYSTEM. An app lists the
  names it needs under `secrets`; the status page shows the missing ones.

## Add an app

Add an entry to `apps.json` and push; it is live at `/<name>` within about 5 minutes.

```json
{ "name": "demo", "repo": "https://github.com/nimrodtalmon/demo.git", "port": 4401,
  "env": { "BASE_PATH": "/demo" },
  "start": ".\\.venv\\Scripts\\uvicorn app:app --host 127.0.0.1 --port 4401" }
```

- `start` runs in the app's folder (or `workdir`); it must listen on 127.0.0.1:`port`.
- `branch` (optional): follow that branch alone, in a shallow clone, as for big repositories. The `/gas` app is GAS, the GLP app store, from the GLP repository (`servers/gas`), built by `build-gas.ps1`; it follows the `talmonlab-deploy` branch of nimrodtalmon/GLP until Udi's main has GAS and its contracts. A change of `repo` or `branch` moves the old clone aside (`<name>.old-<time>`) and clones afresh.
- `aliases` (optional): old names of the app; `/<alias>/…` redirects to `/<name>/…` (GAS was `/glp`).
- Ports in use: 4101 lab, 4201 cdw, 4401 gas (4301 was glp), 4601 gasrelay (the relay of GAS phones not near each other, server/gasrelay), 4701 downloads (the GAS apps to download, the GLP fork's branch gas-downloads, served by its serve.py; 4501 was udpcheck, which showed that inbound UDP never reaches talmonlab through BGU's network; Caddy still runs without HTTP/3). 4801 cgraph (Contribution Graph, repo nimrodtalmon/cgraph; Python standard library only, data in `C:\sites\cgraph-data`). 5001 gcv (GCV, Grassroots Contracts Verifier: Lean-verified properties of grassroots contracts, repo nimrodtalmon/GFV, `app/server.py`, Python standard library only; on first start it downloads Lean 4.32 into `C:\sites\gcv-data` and builds each contract's Lean project there; alias /gfv, its old name on port 4901). 5101 gas2 (GAS2: every contract of Udi's GLP main down the cascade to a mini-app of the Grassroots Super-App, with live runs; the GLP fork's branch GAS2, `servers/gas2/server.py`, Python standard library only, plus Git, Dart and Git's bash with perl; it keeps two working copies of GLP main in `C:\sites\gas2-data` and rebuilds hourly). 5201 gas2web (GAS2 on the web, for iPhones: each person's super-app on the server, over the relay; the same branch, `servers/gas2/device/bin/web.dart`, the device tree of gas2's live build, data in `C:\sites\gas2web-data`). Take the next free hundred.
- Only an app that needs secrets requires one login, to write `C:\sites\secrets\<name>.ps1`.
- The first run of a heavy app (e.g. CDW downloads models) can take several minutes.

## One-time setup

Caddy as a service, Git, Python, Dart in `C:\tools\dart-sdk`, then
[`bootstrap.ps1`](bootstrap.ps1). Notes: interactive PowerShell blocks scripts
(run `Set-ExecutionPolicy Bypass -Scope Process -Force` first in a window);
Windows Defender flags `dart compile exe` output, so GAS runs with `dart bin\server.dart`.
