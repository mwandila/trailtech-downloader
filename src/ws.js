import http from "node:http";
import crypto from "node:crypto";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/**
 * Minimal zero-dependency RFC6455 WebSocket server:
 *  - verifies Origin (chrome-extension://* / moz-extension://*) so random
 *    web pages cannot drive the engine — same defense IDM uses on port 1001
 *  - text frames (JSON in/out), close, ping/pong
 *  contract: constructor onMessage(jsonText, client); send via client.send(obj)
 */
export class WsServer {
  constructor({ port, host = "127.0.0.1", path = "/", onMessage, log = () => {} }) {
    this.log = log;
    this.onMessage = onMessage;
    this.server = http.createServer((req, res) => {
      res.writeHead(426, { "content-type": "text/plain" });
      res.end("WebSocket endpoint for downloader extension");
    });
    this.server.on("upgrade", (req, socket) => this.#upgrade(req, socket, path));
    this.clients = new Set();
    this.server.listen(port, host, () =>
      log(`engine ipc: ws://${host}:${port}${path}`)
    );
  }

  #upgrade(req, socket, allowedPath) {
    const url = new URL(req.url, "http://localhost");
    const origin = req.headers.origin || "";
    const originOk = /^(chrome|moz)-extension:\/\//.test(origin);
    if (url.pathname !== allowedPath || !originOk) {
      socket.destroy();
      this.log(
        `ipc rejected: remote=${req.socket.remoteAddress} path=${url.pathname} origin=${origin}`
      );
      return;
    }

    const key = req.headers["sec-websocket-key"];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = crypto
      .createHash("sha1")
      .update(key + WS_GUID)
      .digest("base64");

    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const client = { socket, lastBroadcast: new Map() };
    client.send = (obj) => {
      const data = encodeFrame(0x1, JSON.stringify(obj));
      try {
        socket.write(data);
      } catch {}
    };
    this.clients.add(client);

    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const frame = readFrame(buffer);
        if (!frame) break;
        buffer = frame.remainder;
        if (frame.opcode === 0x8) {
          this.#bye(client);
          return;
        }
        if (frame.opcode === 0x9) {
          try {
            socket.write(encodeFrame(0xa, frame.payload));
          } catch {}
        }
        if (frame.opcode === 0x1 && this.onMessage) {
          this.onMessage(frame.payload.toString("utf8"), client);
        }
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => this.#bye(client));
  }

  #bye(client) {
    if (!this.clients.has(client)) return;
    this.clients.delete(client);
    try {
      client.socket.end(encodeFrame(0x8, Buffer.alloc(0)));
      client.socket.destroy();
    } catch {}
  }

  /** Broadcast a JSON object; rate-limit by group name via opts.throttle. */
  broadcast(obj, { throttleGroup, minInterval = 250 } = {}) {
    const frame = encodeFrame(0x1, JSON.stringify(obj));
    for (const c of this.clients) {
      if (c.socket.destroyed) continue;
      if (throttleGroup) {
        const last = c.lastBroadcast.get(throttleGroup) || 0;
        const now = Date.now();
        if (now - last < minInterval) continue;
        c.lastBroadcast.set(throttleGroup, now);
      }
      try {
        c.socket.write(frame);
      } catch {}
    }
  }

  close() {
    for (const c of this.clients) this.#bye(c);
    this.server.close();
  }
}

function encodeFrame(opcode, payload) {
  const p = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = p.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, p]);
}

/** Read one complete frame; returns {opcode, payload, remainder} or null. */
function readFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf.readUInt8(0) & 0x0f;
  const masked = (buf.readUInt8(1) & 0x80) !== 0;
  let len = buf.readUInt8(1) & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    off = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    off = 10;
  }
  const maskLen = masked ? 4 : 0;
  if (buf.length < off + maskLen + len) return null;

  let payload = buf.subarray(off + maskLen, off + maskLen + len);
  if (masked) {
    const key = buf.subarray(off, off + 4);
    const out = Buffer.alloc(len);
    for (let i = 0; i < len; i++) out[i] = payload[i] ^ key[i & 3];
    payload = out;
  }
  return { opcode, payload, remainder: buf.subarray(off + maskLen + len) };
}
