const http = require('http');
const { WebSocketServer } = require('ws');
const lib = require('tiktok-live-connector');

// Works with both the new (v2) and old (v1) versions of the library
const Connection = lib.TikTokLiveConnection || lib.WebcastPushConnection;
const CHAT_EVENT = lib.WebcastEvent ? lib.WebcastEvent.CHAT : 'chat';

const USERNAME = process.env.TIKTOK_USERNAME;
const PORT = process.env.PORT || 8080;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const RECENT_MS = 30 * 60 * 1000; // viewer must have commented in the last 30 min
const MAX_POINTS = 1000;          // safety check only, not a scoring cap
const recentCommenters = new Map(); // viewer name -> time of last comment

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

// Month label in Malaysia time (UTC+8), e.g. "2026-11"
function currentMonth() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

async function saveScore(user, game, points, win) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/scores', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SECRET_KEY,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      viewer_name: user,
      game: game,
      points: points,
      is_win: win === true,
      month: currentMonth(),
    }),
  });
  if (!res.ok) {
    console.log('Save failed:', res.status, await res.text());
  }
}

// Games send: { type: "score", user: "ali123", game: "Family Feud", points: 36 }
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!m || m.type !== 'score') return;

    const user = String(m.user || '').toLowerCase().slice(0, 60);
    const game = String(m.game || '').slice(0, 60);
    const points = m.points;

    if (!user || !game) return;
    if (!Number.isInteger(points) || points < 1 || points > MAX_POINTS) return;

    const last = recentCommenters.get(user);
    if (!last || Date.now() - last > RECENT_MS) return; // not a real recent commenter

    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return;
    saveScore(user, game, points, m.win === true).catch((e) => console.log('Save error:', e.message));
  });
});

function startTikTok() {
  const tiktok = new Connection(USERNAME, {});

  tiktok.connect()
    .then(() => console.log('Connected to live'))
    .catch((err) => {
      console.log('Not connected, retrying in 15s:', err && err.message ? err.message : err);
      setTimeout(startTikTok, 15000);
    });

  tiktok.on(CHAT_EVENT, (data) => {
    const user = data.user ? data.user.uniqueId : data.uniqueId;
    if (user) recentCommenters.set(String(user).toLowerCase(), Date.now());
    broadcast({ user: user, comment: data.comment });
  });

  tiktok.on('disconnected', () => {
    console.log('Disconnected, retrying in 15s');
    setTimeout(startTikTok, 15000);
  });
}

server.listen(PORT, () => {
  console.log('Relay on port ' + PORT);
  console.log('Saving scores to Supabase: ' + (SUPABASE_URL && SUPABASE_SECRET_KEY ? 'ON' : 'OFF (variables missing)'));
});
startTikTok();
