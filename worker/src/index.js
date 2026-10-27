import { DurableObject } from "cloudflare:workers";

const ROOM_CAP = 8;
const ROOM_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ALLOWED_ORIGINS = new Set([
  "https://siddharthbhaumik.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsHeaders(request) {
  const headers = {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
  const origin = request?.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function isAllowedOrigin(request) {
  const origin = request?.headers.get("Origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function json(data, status = 200, request = null) {
  return Response.json(data, { status, headers: corsHeaders(request) });
}

function withCors(response, request) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(request))) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function randomToken() {
  return crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
}

function randomCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function publicRoom(room) {
  return {
    code: room.code,
    name: room.name,
    hostId: room.hostId,
    players: room.players.map(({ id, nickname, isHost }) => ({ id, nickname, isHost })),
    playerCount: room.players.length,
    playerCap: ROOM_CAP,
    createdAt: room.createdAt,
    gameId: room.gameId ?? null,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "playblox-worker", roomCap: ROOM_CAP }, 200, request);
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Send a valid JSON body." }, 400, request); }
      const hostName = cleanText(body.hostName, 18);
      const partyName = cleanText(body.partyName, 28) || (hostName ? hostName + "'s Party" : "");
      if (!hostName) return json({ error: "A nickname is required." }, 400, request);

      // A code collision is very unlikely, but creation retries rather than overwriting a room.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const stub = env.PARTY_ROOMS.get(env.PARTY_ROOMS.idFromName(code));
        const response = await stub.fetch("https://party-room.internal/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(request.headers.get("Origin") ? { "Origin": request.headers.get("Origin") } : {}),
          },
          body: JSON.stringify({ code, hostName, partyName }),
        });
        if (response.status === 201) return withCors(response, request);
        if (response.status !== 409) return withCors(response, request);
      }
      return json({ error: "Couldn't create a room right now. Please try again." }, 503, request);
    }

    const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(join|leave|ws))?$/i);
    if (!match) return json({ error: "Not found." }, 404, request);
    const code = match[1].toUpperCase();
    const action = match[2] || "";
    const stub = env.PARTY_ROOMS.get(env.PARTY_ROOMS.idFromName(code));

    if (!action && request.method === "GET") return withCors(await stub.fetch("https://party-room.internal/room", request), request);
    if (action === "join" && request.method === "POST") return withCors(await stub.fetch("https://party-room.internal/join", request), request);
    if (action === "leave" && request.method === "POST") return withCors(await stub.fetch("https://party-room.internal/leave", request), request);
    if (action === "ws" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      if (!isAllowedOrigin(request)) return json({ error: "This website origin is not allowed." }, 403, request);
      return stub.fetch("https://party-room.internal/ws" + url.search, request);
    }
    return json({ error: "Method not allowed." }, 405, request);
  },
};

export class PartyRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get("room")) ?? null;
    });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    if (url.pathname === "/create" && request.method === "POST") return this.create(request);
    if (!this.room) return json({ error: "That party doesn't exist or has expired." }, 404, request);
    if (url.pathname === "/room" && request.method === "GET") {
      await this.touch();
      return json({ room: publicRoom(this.room) }, 200, request);
    }
    if (url.pathname === "/join" && request.method === "POST") return this.join(request);
    if (url.pathname === "/leave" && request.method === "POST") return this.leave(request);
    if (url.pathname === "/ws" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      if (!isAllowedOrigin(request)) return json({ error: "This website origin is not allowed." }, 403, request);
      return this.connect(url);
    }
    return json({ error: "Not found." }, 404);
  }

  async create(request) {
    if (this.room) return json({ error: "Code collision." }, 409, request);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400, request); }
    const hostId = crypto.randomUUID();
    const hostToken = randomToken();
    const now = Date.now();
    this.room = {
      code: body.code,
      name: body.partyName,
      hostId,
      players: [{ id: hostId, token: hostToken, nickname: body.hostName, isHost: true, joinedAt: now }],
      gameId: null,
      createdAt: now,
      lastActivityAt: now,
    };
    await this.persistAndSchedule();
    return json({ room: publicRoom(this.room), playerToken: hostToken }, 201, request);
  }

  async join(request) {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Send a valid JSON body." }, 400, request); }
    const nickname = cleanText(body.nickname, 18);
    if (!nickname) return json({ error: "A nickname is required." }, 400, request);

    // Reuse this tab's existing identity when it rejoins the same room.
    const existingToken = typeof body.playerToken === "string" ? body.playerToken : "";
    if (existingToken) {
      const existingPlayer = this.room.players.find((entry) => entry.token === existingToken);
      if (existingPlayer) {
        this.room.lastActivityAt = Date.now();
        await this.persistAndSchedule();
        return json({ room: publicRoom(this.room), playerToken: existingPlayer.token, reused: true }, 200, request);
      }
      return json({ error: "Your saved player session has expired. Please join again." }, 401, request);
    }

    if (this.room.players.length >= ROOM_CAP) return json({ error: "This party is full (8 players maximum)." }, 409, request);
    const id = crypto.randomUUID();
    const playerToken = randomToken();
    this.room.players.push({ id, token: playerToken, nickname, isHost: false, joinedAt: Date.now() });
    this.room.lastActivityAt = Date.now();
    await this.persistAndSchedule();
    this.broadcast({ type: "room-updated", room: publicRoom(this.room) });
    return json({ room: publicRoom(this.room), playerToken }, 201, request);
  }

  async leave(request) {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const player = this.room.players.find((entry) => entry.token === token);
    if (!player) return json({ error: "Invalid player session." }, 401, request);
    this.room.players = this.room.players.filter((entry) => entry.id !== player.id);
    this.room.lastActivityAt = Date.now();
    const playerSocket = this.ctx.getWebSockets().find((socket) => socket.deserializeAttachment()?.playerId === player.id);
    playerSocket?.close(1000, "Player left");
    if (this.room.players.length === 0) {
      this.room.lastActivityAt = Date.now();
      await this.persistAndSchedule();
    } else {
      // The host remains the host for this first version; if they leave, the room closes.
      if (player.isHost) {
        for (const socket of this.ctx.getWebSockets()) socket.close(1000, "Host closed the party");
        this.room = null;
        await this.ctx.storage.deleteAll();
        return json({ ok: true, roomClosed: true }, 200, request);
      }
      await this.persistAndSchedule();
      this.broadcast({ type: "room-updated", room: publicRoom(this.room) });
    }
    return json({ ok: true, roomClosed: !this.room || this.room.players.length === 0 }, 200, request);
  }

  async connect(url) {
    const token = url.searchParams.get("token") || "";
    const player = this.room.players.find((entry) => entry.token === token);
    if (!player) return json({ error: "Invalid player session." }, 401);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: player.id });
    server.send(JSON.stringify({ type: "room-snapshot", room: publicRoom(this.room) }));
    await this.touch();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, message) {
    await this.ready;
    // This first version only broadcasts authoritative room state. Game-specific
    // actions will be added through validated message handlers in later iterations.
    let data;
    try { data = JSON.parse(message); } catch { socket.send(JSON.stringify({ type: "error", message: "Invalid message." })); return; }
    if (data?.type === "ping") {
      this.room.lastActivityAt = Date.now();
      await this.persistAndSchedule();
      socket.send(JSON.stringify({ type: "pong", at: Date.now() }));
    }
    else socket.send(JSON.stringify({ type: "error", message: "That action isn't supported yet." }));
  }

  async webSocketClose(_socket) {
    // Cloudflare manages accepted WebSockets; no in-memory registry is needed.
  }

  async webSocketError(_socket) {
    // Cloudflare manages accepted WebSockets; no in-memory registry is needed.
  }

  broadcast(message) {
    const serialized = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        if (socket.readyState === WebSocket.OPEN) socket.send(serialized);
      } catch {
        // A socket may close while a broadcast is in progress.
      }
    }
  }

  async touch() {
    this.room.lastActivityAt = Date.now();
    await this.persistAndSchedule();
  }

  async persistAndSchedule() {
    await this.ctx.storage.put("room", this.room);
    await this.ctx.storage.setAlarm(Date.now() + ROOM_IDLE_TTL_MS);
  }

  async alarm() {
    await this.ready;
    if (!this.room) return;
    const expiresAt = this.room.lastActivityAt + ROOM_IDLE_TTL_MS;
    if (Date.now() >= expiresAt) {
      for (const socket of this.ctx.getWebSockets()) socket.close(1000, "Party expired");
      this.room = null;
      await this.ctx.storage.deleteAll();
    } else {
      await this.ctx.storage.setAlarm(expiresAt);
    }
  }
}