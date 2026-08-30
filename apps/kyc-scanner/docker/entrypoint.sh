#!/bin/sh
set -eu

freshclam --stdout || echo "ClamAV signature refresh failed; readiness will remain closed if no usable database is present" >&2
clamd --foreground=true &
exec node src/server.mjs
