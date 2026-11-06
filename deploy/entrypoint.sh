#!/bin/sh
# The image's entrypoint (survey 16 §3). It starts the app, or the setup stub when SETUP=true.
#
# The app binds all interfaces only because it is started with --listen-all: inside a container,
# the published port needs a non-loopback bind (survey 16 §7 item 10, provisional). The compose file
# publishes the port on 127.0.0.1 only, so the host's loopback is the only way in.
set -eu

if [ "${SETUP:-}" = "true" ]; then
  # The installer's dispenser is a later phase (survey 16 §3, phase:installer). Until then the
  # stub says so and exits cleanly, rather than starting the app in setup mode.
  echo "Setup mode is not built yet." >&2
  exit 0
fi

exec node /app/apps/api/dist/main.js --listen-all "$@"
