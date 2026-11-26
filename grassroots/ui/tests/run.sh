#!/usr/bin/env bash
# The demo's regression tests.  With no --base, serves grassroots/ on :8765 and tests it there.
cd "$(dirname "$0")/.." || exit 1
if [[ " $* " != *" --base "* ]]; then
  (cd .. && python3 -m http.server 8765 >/dev/null 2>&1 &) ; SRV=1; sleep 1
fi
node tests/run.js "$@"; rc=$?
[ -n "$SRV" ] && pkill -f "http.server 8765" 2>/dev/null
exit $rc
