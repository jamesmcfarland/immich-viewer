#!/bin/sh
set -eu

PORT_VALUE="${PORT:-8080}"
HOST_VALUE="${HOST:-0.0.0.0}"
REFRESH_MINUTES_VALUE="${REFRESH_MINUTES:-10}"
SLIDE_SECONDS_VALUE="${SLIDE_SECONDS:-8}"
TRANSITION_MS_VALUE="${TRANSITION_MS:-1200}"
SHUFFLE_VALUE="${SHUFFLE:-true}"
IMAGE_SOURCE_VALUE="${IMAGE_SOURCE:-preview}"
IMAGE_FIT_VALUE="${IMAGE_FIT:-contain}"
BACKGROUND_VALUE="${BACKGROUND:-#000000}"
SHOW_CAPTION_VALUE="${SHOW_CAPTION:-false}"
SHOW_DATE_VALUE="${SHOW_DATE:-false}"

if [ -z "${IMMICH_BASE_URL:-}" ] || [ -z "${IMMICH_API_KEY:-}" ] || [ -z "${IMMICH_ALBUM_ID:-}" ]; then
  echo "Missing required environment variables: IMMICH_BASE_URL, IMMICH_API_KEY, IMMICH_ALBUM_ID" >&2
  exit 1
fi

cat > /app/config.json <<EOF
{
  "server": {
    "host": "${HOST_VALUE}",
    "port": ${PORT_VALUE}
  },
  "immich": {
    "baseUrl": "${IMMICH_BASE_URL}",
    "apiKey": "${IMMICH_API_KEY}",
    "albumId": "${IMMICH_ALBUM_ID}"
  },
  "slideshow": {
    "refreshMinutes": ${REFRESH_MINUTES_VALUE},
    "slideSeconds": ${SLIDE_SECONDS_VALUE},
    "transitionMs": ${TRANSITION_MS_VALUE},
    "shuffle": ${SHUFFLE_VALUE},
    "imageSource": "${IMAGE_SOURCE_VALUE}",
    "imageFit": "${IMAGE_FIT_VALUE}",
    "background": "${BACKGROUND_VALUE}",
    "showCaption": ${SHOW_CAPTION_VALUE},
    "showDate": ${SHOW_DATE_VALUE}
  }
}
EOF

exec node /app/server.js
