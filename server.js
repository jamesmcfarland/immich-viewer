var fs = require('fs');
var http = require('http');
var https = require('https');
var path = require('path');
var url = require('url');

var ROOT = __dirname;
var PUBLIC_DIR = path.join(ROOT, 'public');
var CONFIG_PATH = path.join(ROOT, 'config.json');
var EXAMPLE_CONFIG_PATH = path.join(ROOT, 'config.example.json');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

if (!fs.existsSync(CONFIG_PATH)) {
  fail('Missing config.json. Copy config.example.json to config.json and update it.');
}

var config;

try {
  config = readJson(CONFIG_PATH);
} catch (error) {
  fail('Could not read config.json: ' + error.message);
}

function normalizeConfig(rawConfig) {
  var normalized = rawConfig || {};

  normalized.server = normalized.server || {};
  normalized.server.host = normalized.server.host || '127.0.0.1';
  normalized.server.port = normalized.server.port || 8080;

  normalized.immich = normalized.immich || {};
  normalized.slideshow = normalized.slideshow || {};

  normalized.slideshow.refreshMinutes = normalized.slideshow.refreshMinutes || 10;
  normalized.slideshow.slideSeconds = normalized.slideshow.slideSeconds || 8;
  normalized.slideshow.transitionMs = normalized.slideshow.transitionMs || 1200;
  normalized.slideshow.shuffle = normalized.slideshow.shuffle !== false;
  normalized.slideshow.imageSource = normalized.slideshow.imageSource || 'preview';
  normalized.slideshow.imageFit = normalized.slideshow.imageFit || 'contain';
  normalized.slideshow.background = normalized.slideshow.background || '#000000';
  normalized.slideshow.showCaption = normalized.slideshow.showCaption !== false;

  if (
    normalized.slideshow.imageSource !== 'thumbnail' &&
    normalized.slideshow.imageSource !== 'preview' &&
    normalized.slideshow.imageSource !== 'fullsize'
  ) {
    normalized.slideshow.imageSource = 'preview';
  }

  return normalized;
}

config = normalizeConfig(config);

if (!config.immich.baseUrl || !config.immich.apiKey || !config.immich.albumId) {
  fail('config.json must include immich.baseUrl, immich.apiKey, and immich.albumId.');
}

var immichBaseUrl = String(config.immich.baseUrl).replace(/\/+$/, '');
var albumCache = {
  fetchedAt: 0,
  data: null
};

function sendJson(response, statusCode, body) {
  var payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  });
  response.end(payload);
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  response.end(body);
}

function getContentType(filePath) {
  var ext = path.extname(filePath).toLowerCase();

  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';

  return 'application/octet-stream';
}

function serveFile(response, filePath) {
  fs.readFile(filePath, function (error, data) {
    if (error) {
      sendText(response, 404, 'Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': getContentType(filePath),
      'Content-Length': data.length
    });
    response.end(data);
  });
}

function immichRequest(targetPath, callback) {
  var parsed = url.parse(immichBaseUrl + targetPath);
  var transport = parsed.protocol === 'https:' ? https : http;

  var request = transport.request({
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port,
    path: parsed.path,
    method: 'GET',
    headers: {
      'x-api-key': config.immich.apiKey,
      'Accept': 'application/json'
    }
  }, function (immichResponse) {
    var chunks = [];

    immichResponse.on('data', function (chunk) {
      chunks.push(chunk);
    });

    immichResponse.on('end', function () {
      callback(null, immichResponse, Buffer.concat(chunks));
    });
  });

  request.on('error', function (error) {
    callback(error);
  });

  request.end();
}

function mapAssets(album) {
  var assets = (album && album.assets) || [];
  var items = [];
  var i;
  var asset;
  var caption;
  var takenAt;

  for (i = 0; i < assets.length; i += 1) {
    asset = assets[i];

    if (!asset || asset.type !== 'IMAGE') {
      continue;
    }

    caption = asset.originalFileName || asset.fileCreatedAt || '';
    takenAt =
      asset.exifInfo && asset.exifInfo.dateTimeOriginal ||
      asset.localDateTime ||
      asset.fileCreatedAt ||
      null;

    items.push({
      id: asset.id,
      width: asset.exifInfo && asset.exifInfo.exifImageWidth || null,
      height: asset.exifInfo && asset.exifInfo.exifImageHeight || null,
      caption: caption,
      takenAt: takenAt
    });
  }

  return items;
}

function fetchAlbum(forceRefresh, callback) {
  var now = Date.now();
  var maxAgeMs = config.slideshow.refreshMinutes * 60 * 1000;

  if (!forceRefresh && albumCache.data && (now - albumCache.fetchedAt) < maxAgeMs) {
    callback(null, albumCache.data);
    return;
  }

  immichRequest('/api/albums/' + encodeURIComponent(config.immich.albumId), function (error, immichResponse, bodyBuffer) {
    var data;

    if (error) {
      callback(error);
      return;
    }

    if (immichResponse.statusCode < 200 || immichResponse.statusCode > 299) {
      callback(new Error('Immich returned HTTP ' + immichResponse.statusCode));
      return;
    }

    try {
      data = JSON.parse(bodyBuffer.toString('utf8'));
    } catch (parseError) {
      callback(parseError);
      return;
    }

    albumCache = {
      fetchedAt: now,
      data: {
        albumId: data.id,
        albumName: data.albumName || 'Album',
        updatedAt: data.updatedAt || null,
        assets: mapAssets(data)
      }
    };

    callback(null, albumCache.data);
  });
}

function proxyThumbnail(assetId, response) {
  var imageSource = config.slideshow.imageSource || 'preview';
  var parsed = url.parse(
    immichBaseUrl +
    '/api/assets/' +
    encodeURIComponent(assetId) +
    '/original?size=' +
    encodeURIComponent(imageSource)
  );
  var transport = parsed.protocol === 'https:' ? https : http;

  var request = transport.request({
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port,
    path: parsed.path,
    method: 'GET',
    headers: {
      'x-api-key': config.immich.apiKey,
      'Accept': 'image/jpeg'
    }
  }, function (immichResponse) {
    if (immichResponse.statusCode < 200 || immichResponse.statusCode > 299) {
      var chunks = [];

      immichResponse.on('data', function (chunk) {
        chunks.push(chunk);
      });

      immichResponse.on('end', function () {
        var errorBody = Buffer.concat(chunks).toString('utf8');

        console.error(
          'Thumbnail request failed for asset ' +
          assetId +
          ' with HTTP ' +
          immichResponse.statusCode +
          (errorBody ? ': ' + errorBody : '')
        );

        sendText(response, immichResponse.statusCode, 'Image request failed');
      });

      return;
    }

    response.writeHead(200, {
      'Content-Type': immichResponse.headers['content-type'] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=300'
    });

    immichResponse.pipe(response);
  });

  request.on('error', function () {
    sendText(response, 502, 'Could not load image');
  });

  request.end();
}

function handleApiConfig(response) {
  sendJson(response, 200, {
    slideshow: config.slideshow
  });
}

function handleApiAlbum(parsedUrl, response) {
  var forceRefresh = parsedUrl.query && parsedUrl.query.refresh === '1';

  fetchAlbum(forceRefresh, function (error, albumData) {
    if (error) {
      sendJson(response, 502, {
        error: 'Could not fetch album',
        details: error.message
      });
      return;
    }

    sendJson(response, 200, albumData);
  });
}

function isSafePublicPath(filePath) {
  return filePath.indexOf(PUBLIC_DIR) === 0;
}

var server = http.createServer(function (request, response) {
  var parsedUrl = url.parse(request.url, true);
  var pathname = parsedUrl.pathname;
  var safePath;
  var filePath;

  if (pathname === '/api/config') {
    handleApiConfig(response);
    return;
  }

  if (pathname === '/api/album') {
    handleApiAlbum(parsedUrl, response);
    return;
  }

  if (pathname.indexOf('/image/') === 0) {
    proxyThumbnail(pathname.slice('/image/'.length), response);
    return;
  }

  safePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!isSafePublicPath(filePath)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  serveFile(response, filePath);
});

server.listen(config.server.port, config.server.host, function () {
  console.log(
    'Immich viewer running at http://' +
    config.server.host +
    ':' +
    config.server.port
  );

  if (fs.existsSync(EXAMPLE_CONFIG_PATH)) {
    console.log('Using config file: ' + CONFIG_PATH);
  }
});
