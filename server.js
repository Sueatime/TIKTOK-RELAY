const http = require('http');
const { WebSocketServer } = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');

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
  const tiktok = new WebcastPushConnection(USERNAME);

  tiktok.connect()
    .then(() => console.log('Connected to live'))
    .catch(() => {
      console.log('Not live yet, retrying in 15s');
      setTimeout(startTikTok, 15000);
    });

  tiktok.on('chat', (data) => {
    broadcast({ user: data.uniqueId, comment: data.comment });
  });

  tiktok.on('disconnected', () => {
    console.log('Disconnected, retrying in 15s');
    setTimeout(startTikTok, 15000);
  });
}

server.listen(PORT, () => console.log('Relay on port ' + PORT));
startTikTok();
