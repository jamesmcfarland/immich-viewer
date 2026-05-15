# Immich Viewer

Simple self-hosted slideshow for an Immich album.

It keeps the Immich API key on the server, fetches images from a chosen album, and displays them in a lightweight browser page designed to stay compatible with older Chromium builds.
Images are normalized server-side before being sent to the browser so EXIF rotation does not depend on old browser behavior.

## Setup

1. Copy `config.example.json` to `config.json`
2. Fill in:
   - `immich.baseUrl`
   - `immich.apiKey`
   - `immich.albumId`
3. Start the server:

```sh
node server.js
```

4. Open:

```text
http://localhost:8080
```

## Coolify

This project is ready to deploy with Coolify using the `Dockerfile` build pack.

### Deploy steps

1. Push this repo to Git
2. In Coolify, create a new application from that repo
3. Choose the `Dockerfile` build pack
4. Set the port to `8080`
5. Add the runtime environment variables below
6. Deploy

### Required environment variables

- `IMMICH_BASE_URL`
- `IMMICH_API_KEY`
- `IMMICH_ALBUM_ID`

### Optional environment variables

- `PORT` default `8080`
- `HOST` default `0.0.0.0`
- `REFRESH_MINUTES` default `10`
- `SLIDE_SECONDS` default `8`
- `TRANSITION_MS` default `1200`
- `SHUFFLE` default `true`
- `IMAGE_SOURCE` default `preview`
- `IMAGE_FIT` default `contain`
- `BACKGROUND` default `#000000`
- `SHOW_CAPTION` default `false`
- `SHOW_DATE` default `false`

### How it works

- The container builds from `Dockerfile`
- `docker-entrypoint.sh` writes `/app/config.json` from Coolify runtime env vars
- `node /app/server.js` starts the proxy and slideshow app

## Notes

- The API key stays on the server and is never exposed to the browser.
- `slideshow.imageSource` can be `thumbnail`, `preview`, or `fullsize`. `preview` is the best default if the thumbnails look too soft.
- If your album changes, the viewer refreshes it on the interval set in `slideshow.refreshMinutes`.
- Your Immich API key needs permission to read the album and view the assets. In practice, make sure it includes at least `album.read` and `asset.view`.
- `config.json` is now ignored by git so local secrets do not get committed by accident.
