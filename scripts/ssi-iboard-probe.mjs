#!/usr/bin/env node
/**
 * SSI iBoard WebSocket PROBE (verification only — NOT a production adapter)
 *
 * Purpose: verify whether the SSI iBoard realtime WebSocket provides live
 * market data for Vietnamese stocks (HPG) from the current network.
 *
 * This probe:
 *  - connects to wss://iboard.ssi.com.vn/ (the SSI web board service)
 *  - logs EVERY raw frame received (text + binary) with a receive timestamp
 *  - tries a few candidate subscribe messages (init / join / sub) and logs the
 *    server's responses — it does NOT assume any message format is correct.
 *
 * Safety:
 *  - read-only, no trading endpoints, no orders
 *  - no secrets involved
 *  - exits automatically after RUN_MS
 *
 * Usage:
 *   node scripts/ssi-iboard-probe.mjs [HPG] [RUN_MS]
 */

import WebSocket from 'ws';

const SYMBOL = (process.argv[2] || 'HPG').toUpperCase();
const RUN_MS = Number(process.argv[3] || 20000);
const WS_URL = process.env.SSI_WS_URL || 'wss://iboard.ssi.com.vn/';

const startedAt = new Date().toISOString();
console.log(`[probe] start=${startedAt}`);
console.log(`[probe] url=${WS_URL} symbol=${SYMBOL} runMs=${RUN_MS}`);

const seen = new Set();

function stamp() {
  return new Date().toISOString();
}

function frameText(data) {
  try {
    if (Buffer.isBuffer(data)) return `[binary ${data.length}B] ${data.toString('utf8')}`;
    if (typeof data === 'string') return data;
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

const ws = new WebSocket(WS_URL, {
  headers: {
    Origin: 'https://iboard.ssi.com.vn',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  },
  handshakeTimeout: 10000,
});

ws.on('open', () => {
  console.log(`[event] open ${stamp()}`);
  // Probe A: init (common first handshake in the iBoard protocol)
  setTimeout(() => {
    console.log(`[send] ${JSON.stringify({ m: 'init' })}`);
    ws.send(JSON.stringify({ m: 'init' }));
  }, 500);

  // Probe B: join list
  setTimeout(() => {
    const msg = { m: 'join', list: [SYMBOL] };
    console.log(`[send] ${JSON.stringify(msg)}`);
    ws.send(JSON.stringify(msg));
  }, 2500);

  // Probe C: sub (alternative subscribe shape seen in some clients)
  setTimeout(() => {
    const msg = { m: 'sub', list: [SYMBOL], o: 0 };
    console.log(`[send] ${JSON.stringify(msg)}`);
    ws.send(JSON.stringify(msg));
  }, 5000);
});

ws.on('message', (data, isBinary) => {
  const t = stamp();
  const text = isBinary ? `[binary] ${data.toString('utf8')}` : frameText(data);
  // Dedupe identical frames to avoid flooding the log
  const key = text.slice(0, 200);
  if (seen.has(key)) return;
  seen.add(key);

  // Highlight anything that mentions our symbol
  if (text.toUpperCase().includes(SYMBOL)) {
    console.log(`[recv:${SYMBOL}] ${t} ${text}`);
  } else {
    console.log(`[recv] ${t} ${text.slice(0, 500)}`);
  }
});

ws.on('error', (err) => {
  console.log(`[error] ${stamp()} ${err.message}`);
});

ws.on('close', (code, reason) => {
  console.log(`[close] ${stamp()} code=${code} reason=${reason.toString()}`);
  summarize();
  process.exit(0);
});

function summarize() {
  console.log('--- PROBE SUMMARY ---');
  console.log(`uniqueFrames=${seen.size}`);
  const hasSymbol = [...seen].some((s) => s.toUpperCase().includes(SYMBOL));
  console.log(`framesContainingSymbol=${hasSymbol ? 'YES' : 'NO'}`);
  console.log(`probeEnd=${new Date().toISOString()}`);
}

// Auto-close after RUN_MS so the probe never hangs.
setTimeout(() => {
  console.log(`[timeout] ${stamp()} closing after runMs=${RUN_MS}`);
  try {
    ws.close(1000, 'probe timeout');
  } catch {
    process.exit(0);
  }
}, RUN_MS);