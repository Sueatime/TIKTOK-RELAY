const http = require('http');
const { WebSocketServer } = require('ws');
const lib = require('tiktok-live-connector');

// Works with both the new (v2) and old (v1) versions of the library
const Connection = lib.TikTokLiveConnection || lib.WebcastPushConnection;
const CHAT_EVENT = lib.WebcastEvent ? lib.WebcastEvent.CHAT : 'chat';

const USERNAME = process.env.TIKTOK_USERNAME;
const PORT = process.env.PORT || 8080;

// Simple page so the host (and you) can check the relay is awake
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Relay is running');
});

const wss = new WebSocketServer({ server });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
}

function startTikTok() {
  const tiktok = new Connection(USERNAME);

  tiktok.connect()
    .then(() => console.log('Connected to live'))
    .catch((err) => {
      console.log('Not connected, retrying in 15s:', err && err.message ? err.message : err);
      setTimeout(startTikTok, 15000);
    });

  tiktok.on(CHAT_EVENT, (data) => {
    const user = data.user ? data.user.uniqueId : data.uniqueId;
    broadcast({ user: user, comment: data.comment });
  });

  tiktok.on('disconnected', () => {
    console.log('Disconnected, retrying in 15s');
    setTimeout(startTikTok, 15000);
  });
}

server.listen(PORT, () => console.log('Relay on port ' + PORT));
startTikTok();
