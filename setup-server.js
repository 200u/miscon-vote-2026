'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

function safePath(urlPath) {
  let rel = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/vote') rel = '/vote.html';
  if (rel === '/admin') rel = '/admin.html';
  if (rel === '/result') rel = '/result.html';
  if (rel === '/aggregate') rel = '/aggregate.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^([.][.][/\\])+/, ''));
  return filePath.startsWith(PUBLIC_DIR) ? filePath : null;
}

http.createServer((req, res) => {
  const filePath = safePath(req.url);
  if (!filePath) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=60'
    });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('Optional static setup server only.');
  console.log('Production voting does not use this process.');
  console.log(`Index:     http://localhost:${PORT}/`);
  console.log(`Aggregate: http://localhost:${PORT}/aggregate`);
});
