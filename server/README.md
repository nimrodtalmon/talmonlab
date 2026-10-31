# talmonlab.bgu.ac.il — how the server is set up

A Windows machine at BGU (132.72.116.76), reachable from inside via VPN + Remote
Desktop. Ports 80 and 443 are open to the internet. Everything lives in `C:\sites`.

## Pieces

- **Caddy** (`C:\sites\caddy\caddy.exe`, Windows service `caddy`) listens on 80/443,
  gets the HTTPS certificate from Let's Encrypt by itself, and routes by path
  (`Caddyfile`). Apply a change with `Restart-Service caddy`.
- **Home page** (`/`): this repo, cloned to `C:\sites\root`; the task
  `talmonlab-root-pull` pulls it every 5 minutes. Caddy serves it as static files.
- **Apps**, each a repo cloned to `C:\sites\<name>`, listening only on 127.0.0.1:

  | path   | repo                              | port | runtime |
  |--------|-----------------------------------|------|---------|
  | `/lab` | nimrodtalmon/BGULAB               | 4101 | Python (uvicorn), `BASE_PATH=/lab` |
  | `/cdw` | nimrodtalmon/CDW                  | 4201 | Python (waitress), models cached in `C:\sites\cdw-cache` |
  | `/glp` | nimrodtalmon/grassroots-contracts | 4301 | Dart; built into `C:\sites\glp-build` by `build-glp.ps1` |

  Caddy strips the path prefix, so an app sees `/` but must link with its prefix
  (BGULAB does this via `BASE_PATH`; the GLP pages use relative links).

- Per app, two scheduled tasks (SYSTEM), set up by `add-app.ps1`:
  `<name>-run` starts `C:\sites\run-<name>.ps1` at boot; `<name>-update` runs
  `update.ps1` every 5 minutes, which moves the clone to the GitHub version and,
  if it changed, reinstalls (or runs `build-<name>.ps1`) and restarts the app.
  So a push to an app's repo is live within about 5 minutes.
- Logs: `C:\sites\logs\<name>.log` (app) and `C:\sites\logs\update.log`.
- Secrets exist only on the server, in `C:\sites\run-<name>.ps1` (readable by
  Administrators and SYSTEM). The copies here have them blanked.

## Add an app

1. Repo with the app; it must work under its path prefix.
2. On the server: clone to `C:\sites\<name>`, install (`python -m venv .venv`,
   `.\.venv\Scripts\pip install -r requirements.txt`), write `C:\sites\run-<name>.ps1`
   with a free port.
3. Add a `redir` + `handle_path` block to the `Caddyfile`, `Restart-Service caddy`.
4. `. C:\sites\add-app.ps1; Add-App <name> <port>; Start-ScheduledTask <name>-run`.

## Notes

- Interactive PowerShell blocks scripts; run `Set-ExecutionPolicy Bypass -Scope Process -Force`
  first in the window (the tasks pass `-ExecutionPolicy Bypass` themselves).
- Windows Defender flags `dart compile exe` output, so the GLP server runs with
  `dart bin\server.dart` instead.
