import { DurableObject } from "cloudflare:workers";
import { getServerGame } from "./games/registry.js";

const ROOM_CAP = 8;
const ROOM_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const RECONNECT_GRACE_MS = 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ALLOWED_ORIGINS = new Set([
  "https://siddharthbhaumik.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsHeaders(request) {
  const headers = { "Cache-Control": "no-store", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization", "Vary": "Origin" };
  const origin = request?.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
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
  for (const [name, value] of Object.entries(corsHeaders(request))) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}
function randomToken() { return crypto.randomUUID() + crypto.randomUUID().replaceAll("-", ""); }
function randomCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}
function randomItem(items) {
  return items[crypto.getRandomValues(new Uint32Array(1))[0] % items.length];
}
function publicRoom(room) {
  return {
    code: room.code, name: room.name, hostId: room.hostId,
    players: room.players.map(({ id, nickname, isHost, connected = false, disconnectExpiresAt = null, role = "player" }) => ({
      id, nickname, isHost, role, connected, connectionState: connected ? "connected" : "reconnecting",
      disconnectExpiresAt,
    })),
    playerCount: room.players.length, playerCap: ROOM_CAP, createdAt: room.createdAt,
    gameId: room.gameId ?? null, selectedGameId: room.selectedGameId ?? null, guidePlayerIds: room.guidePlayerIds ?? [], guideReadyPlayerIds: room.guideReadyPlayerIds ?? [], lifecycle: room.lifecycle ?? "lobby", stateVersion: room.stateVersion ?? 0, game: room.gameMetadata ?? null, gameState: room.gameId && getServerGame(room.gameId)?.getPublicState
      ? getServerGame(room.gameId).getPublicState(room.gameState)
      : (room.gameState ?? null), results: room.results ?? null, rematchVotes: room.rematchVotes ?? {}, history: room.history ?? [],
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "playblox-worker", roomCap: ROOM_CAP, reconnectGraceSeconds: RECONNECT_GRACE_MS / 1000 }, 200, request);
    }
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Send a valid JSON body." }, 400, request); }
      const hostName = cleanText(body.hostName, 18);
      const partyName = cleanText(body.partyName, 28) || (hostName ? hostName + "'s Party" : "");
      if (!hostName) return json({ error: "A nickname is required." }, 400, request);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const stub = env.PARTY_ROOMS.get(env.PARTY_ROOMS.idFromName(code));
        const response = await stub.fetch("https://party-room.internal/create", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(request.headers.get("Origin") ? { Origin: request.headers.get("Origin") } : {}) },
          body: JSON.stringify({ code, hostName, partyName }),
        });
        if (response.status === 201) return withCors(response, request);
        if (response.status !== 409) return withCors(response, request);
      }
      return json({ error: "Couldn't create a room right now. Please try again." }, 503, request);
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(.*))?$/i);
    if (!match) return json({ error: "Not found." }, 404, request);
    const code = match[1].toUpperCase(), action = match[2] || "";
    const stub = env.PARTY_ROOMS.get(env.PARTY_ROOMS.idFromName(code));
    if (!action && request.method === "GET") return withCors(await stub.fetch("https://party-room.internal/room", request), request);
    if (action === "join" && request.method === "POST") return withCors(await stub.fetch("https://party-room.internal/join", request), request);
    if (action === "leave" && request.method === "POST") return withCors(await stub.fetch("https://party-room.internal/leave", request), request);
    if (action === "game/select" && request.method === "POST") return withCors(await stub.fetch("https://party-room.internal/game/select", request), request);
    if (action === "game/guide-ready" && request.method === "POST") return withCors(await stub.fetch("https://party-room.internal/game/guide-ready", request), request);
    if (action === "game/start" && request.method === "POST") return withCors(await stub.fetch("https://party-room.internal/game/start", request), request);
    if (action === "game/action" && request.method === "POST") return withCors(await stub.fetch("https://party-room.internal/game/action", request), request);
    if (action === "game/reset" && request.method === "POST") return withCors(await stub.fetch("https://party-room.internal/game/reset", request), request);
    if (action === "game/rematch" && request.method === "POST") return withCors(await stub.fetch("https://party-room.internal/game/rematch", request), request);
    if (action === "game/leave" && request.method === "POST") return withCors(await stub.fetch("https://party-room.internal/game/leave", request), request);
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
    this.ready = ctx.blockConcurrencyWhile(async () => { this.room = (await ctx.storage.get("room")) ?? null; });
  }
  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    if (url.pathname === "/create" && request.method === "POST") return this.create(request);
    if (!this.room) return json({ error: "That party doesn't exist or has expired." }, 404, request);
    if (url.pathname === "/room" && request.method === "GET") {
      await this.touch(); return json({ room: publicRoom(this.room) }, 200, request);
    }
    if (url.pathname === "/join" && request.method === "POST") return this.join(request);
    if (url.pathname === "/leave" && request.method === "POST") return this.leave(request);
    if (url.pathname === "/game/select" && request.method === "POST") return this.selectGame(request);
    if (url.pathname === "/game/guide-ready" && request.method === "POST") return this.guideReady(request);
    if (url.pathname === "/game/start" && request.method === "POST") return this.startGame(request);
    if (url.pathname === "/game/action" && request.method === "POST") return this.gameAction(request);
    if (url.pathname === "/game/reset" && request.method === "POST") return this.resetGame(request);
    if (url.pathname === "/game/rematch" && request.method === "POST") return this.rematch(request);
    if (url.pathname === "/game/leave" && request.method === "POST") return this.leaveGame(request);
    if (url.pathname === "/ws" && request.method === "GET" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      if (!isAllowedOrigin(request)) return json({ error: "This website origin is not allowed." }, 403, request);
      return this.connect(url);
    }
    return json({ error: "Not found." }, 404, request);
  }
  async create(request) {
    if (this.room) return json({ error: "Code collision." }, 409, request);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400, request); }
    const hostId = crypto.randomUUID(), hostToken = randomToken(), now = Date.now();
    this.room = {
      code: body.code, name: body.partyName, hostId,
      players: [{ id: hostId, token: hostToken, nickname: body.hostName, isHost: true, joinedAt: now, connected: false, disconnectExpiresAt: null }],
      gameId: null, selectedGameId: null, gameMetadata: null, lifecycle: "lobby", gameState: null, stateVersion: 0, recentActionIds: [], rematchVotes: {},
      createdAt: now, lastActivityAt: now, emptySinceAt: null,
      history: [{ type: "created", message: `${body.hostName} created the lobby`, at: now }],
    };
    await this.persistAndSchedule();
    return json({ room: publicRoom(this.room), playerToken: hostToken }, 201, request);
  }
  async join(request) {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Send a valid JSON body." }, 400, request); }
    const nickname = cleanText(body.nickname, 18);
    if (!nickname) return json({ error: "A nickname is required." }, 400, request);
    const existingToken = typeof body.playerToken === "string" ? body.playerToken : "";
    if (existingToken) {
      const player = this.room.players.find(entry => entry.token === existingToken);
      if (player) {
        player.nickname = nickname;
        this.room.lastActivityAt = Date.now();
        await this.persistAndSchedule();
        return json({ room: publicRoom(this.room), playerToken: player.token, playerId: player.id, reused: true }, 200, request);
      }
      return json({ error: "Your saved player session has expired. Please join again." }, 401, request);
    }
    if (this.room.players.length >= ROOM_CAP) return json({ error: "This party is full (8 players maximum)." }, 409, request);
    let role = "player";
    if (this.room.lifecycle && this.room.lifecycle !== "lobby") {
      const activeGame = getServerGame(this.room.gameId);
      if (!activeGame) return json({ error: "The active game's late-join rules are unavailable." }, 409, request);
      if (activeGame.lateJoinPolicy === "wait") {
        return json({ error: "This game has started. Please wait until the host returns to the lobby." }, 409, request);
      }
      if (activeGame.lateJoinPolicy === "spectate") role = activeGame.spectators?.supported ? "spectator" : "waiting";
      if (activeGame.lateJoinPolicy === "participate" && this.room.players.length >= Math.min(activeGame.players?.max ?? ROOM_CAP, ROOM_CAP)) {
        return json({ error: "This game has reached its player limit. You cannot join this round." }, 409, request);
      }
    }
    const now = Date.now(), id = crypto.randomUUID(), playerToken = randomToken();
    this.room.players.push({ id, token: playerToken, nickname, role, isHost: false, joinedAt: now, connected: false, disconnectExpiresAt: null });
    this.recordHistory("joined", `${nickname} joined the lobby`, { playerId: id });
    this.room.emptySinceAt = null; this.room.lastActivityAt = now;
    await this.persistAndSchedule();
    this.broadcast({ type: "room-updated", room: publicRoom(this.room) });
    return json({ room: publicRoom(this.room), playerToken, playerId: id }, 201, request);
  }
  async selectGame(request) {
    const player = this.authorizePlayer(request);
    if (!player) return json({ error: "A valid player session is required." }, 401, request);
    if (!player.isHost) return json({ error: "Only the host can select a game." }, 403, request);
    if (this.room.lifecycle !== "lobby") return json({ error: "Games can only be selected in the lobby." }, 409, request);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Send a valid JSON body." }, 400, request); }
    const game = getServerGame(body.gameId);
    if (!game || typeof game.guide !== "string" || !game.guide.trim()) return json({ error: "That game is missing its required player guide." }, 409, request);
    this.room.selectedGameId = game.id;
    this.room.lastActivityAt = Date.now();
    this.recordHistory("game-selected", `${player.nickname} selected ${game.name}`, { gameId: game.id });
    await this.persistAndSchedule();
    this.broadcast({ type: "room-updated", room: publicRoom(this.room), stateVersion: this.room.stateVersion });
    return json({ ok: true, room: publicRoom(this.room) }, 200, request);
  }
  async startGame(request) {
    const player = this.authorizePlayer(request);
    if (!player) return json({ error: "A valid player session is required." }, 401, request);
    if (!player.isHost) return json({ error: "Only the host can start a game." }, 403, request);
    if (this.room.lifecycle !== "lobby") return json({ error: "The party is not in the lobby." }, 409, request);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Send a valid JSON body." }, 400, request); }
    const game = getServerGame(body.gameId);
    if (!game) return json({ error: "This game is not registered with the multiplayer engine yet." }, 404, request);
    if (!game.guide || !game.guide.trim()) return json({ error: "This game cannot start until its player guide is added." }, 409, request);
    if (this.room.selectedGameId !== game.id) return json({ error: "Select this game in the lobby before starting it." }, 409, request);
    const connectedPlayers = this.room.players.filter(entry => entry.connected && entry.role !== "spectator" && entry.role !== "waiting");
    const min = game.players?.min ?? 2, max = Math.min(game.players?.max ?? ROOM_CAP, ROOM_CAP);
    let selectedIds = body.selectedPlayerIds;
    if (selectedIds === undefined) selectedIds = connectedPlayers.map(entry => entry.id);
    if (!Array.isArray(selectedIds) || selectedIds.some(id => typeof id !== "string") || new Set(selectedIds).size !== selectedIds.length) {
      return json({ error: "Choose a valid participant list." }, 400, request);
    }
    const selectedPlayers = connectedPlayers.filter(entry => selectedIds.includes(entry.id));
    if (selectedPlayers.length !== selectedIds.length) return json({ error: "Only currently connected party members can be selected." }, 409, request);
    if (selectedPlayers.length < min) return json({ error: `This game needs at least ${min} selected, connected players.` }, 409, request);
    if (selectedPlayers.length > max) return json({ error: `Choose no more than ${max} participants for this game.` }, 409, request);
    const unselectedPlayers = this.room.players.filter(entry => !selectedIds.includes(entry.id));
    const context = this.gameContext(game, player);
    context.players = context.players.map(entry => ({
      ...entry,
      role: selectedIds.includes(entry.id) ? "player" : (game.spectators?.supported ? "spectator" : "waiting"),
    }));
    let allowed;
    try { allowed = game.canStart ? await game.canStart(context) : { ok: true }; }
    catch { return json({ error: "The game could not validate its start conditions." }, 500, request); }
    if (allowed === false || allowed?.ok === false) return json({ error: allowed?.reason || "The game is not ready to start." }, 409, request);
    let initialState;
    try { initialState = game.createInitialState ? await game.createInitialState(context) : {}; }
    catch { return json({ error: "The game could not initialize its state." }, 500, request); }
    if (initialState === undefined) return json({ error: "The game returned no initial state." }, 500, request);
    // Commit roster roles only after the game has successfully validated and initialized.
    for (const entry of selectedPlayers) entry.role = "player";
    for (const entry of unselectedPlayers) entry.role = game.spectators?.supported ? "spectator" : "waiting";
    this.room.gameId = game.id;
    this.room.gameMetadata = { id: game.id, name: game.name, interactionModel: game.interactionModel, guide: game.guide, lateJoinPolicy: game.lateJoinPolicy, players: game.players, spectators: game.spectators ?? { supported: false } };
    this.room.lifecycle = "guide";
    this.room.gameState = initialState;
    this.room.stateVersion = (this.room.stateVersion || 0) + 1;
    this.room.recentActionIds = [];
    this.room.lastActivityAt = Date.now();
    this.room.guidePlayerIds = selectedPlayers.map(entry => entry.id);
    this.room.guideReadyPlayerIds = [];
    this.recordHistory("game-guide-opened", `${game.name} guide opened`, { gameId: game.id, playerIds: selectedPlayers.map(entry => entry.id) });
    await this.persistAndSchedule();
    this.broadcast({ type: "game-guide", room: publicRoom(this.room), stateVersion: this.room.stateVersion });
    return json({ room: publicRoom(this.room), stateVersion: this.room.stateVersion }, 200, request);
  }
  async guideReady(request) {
    const player = this.authorizePlayer(request);
    if (!player) return json({ error: "A valid player session is required." }, 401, request);
    if (this.room.lifecycle !== "guide") return json({ error: "The game guide is not awaiting confirmation." }, 409, request);
    if (!(this.room.guidePlayerIds || []).includes(player.id)) return json({ error: "Only selected players need to confirm the guide." }, 403, request);
    this.room.guideReadyPlayerIds = [...new Set([...(this.room.guideReadyPlayerIds || []), player.id])];
    const readyCount = this.room.guideReadyPlayerIds.length;
    const requiredCount = (this.room.guidePlayerIds || []).length;
    if (readyCount >= requiredCount) {
      this.room.lifecycle = "playing";
      this.recordHistory("game-started", `${this.room.gameMetadata?.name || "Game"} started after everyone read the guide`, { gameId: this.room.gameId });
    }
    await this.persistAndSchedule();
    const eventType = this.room.lifecycle === "playing" ? "game-started" : "guide-progress";
    const activeGame = getServerGame(this.room.gameId);
    const publicSnapshot = publicRoom(this.room);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        if (ws.readyState !== WebSocket.OPEN) continue;
        const socketPlayerId = ws.deserializeAttachment()?.playerId;
        const privateState = activeGame?.getPrivateState
          ? await activeGame.getPrivateState(this.room.gameState, socketPlayerId)
          : null;
        ws.send(JSON.stringify({ type: eventType, room: publicSnapshot, privateState, readyCount, requiredCount, stateVersion: this.room.stateVersion }));
      } catch {}
    }
    return json({ ok: true, lifecycle: this.room.lifecycle, readyCount, requiredCount, room: publicRoom(this.room) }, 200, request);
  }
  async gameAction(request) {
    const player = this.authorizePlayer(request);
    if (!player) return json({ error: "A valid player session is required." }, 401, request);
    if (this.room.lifecycle !== "playing") return json({ error: "The round will be available once every selected player has read the guide." }, 409, request);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Send a valid JSON body." }, 400, request); }
    if (typeof body.actionId !== "string" || body.actionId.length < 1 || body.actionId.length > 100) {
      return json({ error: "Every game action needs a unique actionId." }, 400, request);
    }
    if (this.room.recentActionIds?.includes(body.actionId)) {
      return json({ ok: true, duplicate: true, stateVersion: this.room.stateVersion }, 200, request);
    }
    const game = getServerGame(this.room.gameId);
    if (!game) return json({ error: "The active game module is unavailable." }, 500, request);
    if (!Number.isInteger(body.expectedStateVersion)) {
      return json({ error: "Game state version is required. Sync and try again.", stateVersion: this.room.stateVersion }, 409, request);
    }
    if (body.expectedStateVersion !== this.room.stateVersion) {
      // Simultaneous games allow players to submit against the same round snapshot.
      // The round guard prevents a delayed action from spilling into the next round.
      const sameSimultaneousRound = game.interactionModel === "simultaneous"
        && Number.isInteger(body.action?.round)
        && body.action.round === this.room.gameState?.round;
      if (!sameSimultaneousRound) {
        return json({ error: "Game state changed. Sync and try again.", stateVersion: this.room.stateVersion }, 409, request);
      }
    }
    if (player.role !== "player") return json({ error: "Only selected players can submit game actions." }, 403, request);
    const context = this.gameContext(game, player);
    let validation;
    try { validation = game.validateAction ? await game.validateAction(context, this.room.gameState, body.action) : { ok: false, reason: "This game does not accept actions yet." }; }
    catch { return json({ error: "The game could not validate that action." }, 500, request); }
    if (validation === false || validation?.ok === false) return json({ error: validation?.reason || "That action is not allowed." }, 403, request);
    let nextState;
    try { nextState = await game.reduceAction(context, this.room.gameState, body.action); }
    catch { return json({ error: "The game could not apply that action." }, 500, request); }
    if (nextState === undefined) return json({ error: "The game returned no next state." }, 500, request);
    this.room.gameState = nextState;
    this.room.stateVersion++;
    this.room.recentActionIds = [...(this.room.recentActionIds || []), body.actionId].slice(-100);
    if (game.getStatus && await game.getStatus(this.gameContext(game, player), nextState) === "finished") {
      this.room.lifecycle = "results";
      this.room.results = game.getResults ? await game.getResults(this.gameContext(game, player), nextState) : null;
      this.recordHistory("game-finished", `${game.name} finished`, { gameId: game.id });
    }
    this.room.lastActivityAt = Date.now();
    await this.persistAndSchedule();
    const publicGameState = publicRoom(this.room).gameState;
    const activeGame = getServerGame(this.room.gameId);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        if (ws.readyState !== WebSocket.OPEN) continue;
        const socketPlayerId = ws.deserializeAttachment()?.playerId;
        const privateState = activeGame?.getPrivateState ? await activeGame.getPrivateState(this.room.gameState, socketPlayerId) : null;
        ws.send(JSON.stringify({ type: "game-state", gameId: this.room.gameId, lifecycle: this.room.lifecycle,
          gameState: publicGameState, privateState, results: this.room.results ?? null, stateVersion: this.room.stateVersion }));
      } catch {}
    }
    return json({ ok: true, stateVersion: this.room.stateVersion, lifecycle: this.room.lifecycle }, 200, request);
  }
  async rematch(request) {
    const player = this.authorizePlayer(request);
    if (!player) return json({ error: "A valid player session is required." }, 401, request);
    if (this.room.lifecycle !== "results") return json({ error: "The round must finish before choosing what happens next." }, 409, request);
    const game = getServerGame(this.room.gameId);
    if (!game?.createInitialState || !Array.isArray(this.room.gameState?.playerOrder)) {
      return json({ error: "This game does not support replay yet." }, 409, request);
    }
    const participants = this.room.gameState.playerOrder.filter(id => this.room.players.some(entry => entry.id === id && entry.role === "player"));
    if (!participants.includes(player.id)) return json({ error: "Only players from this round can choose what happens next." }, 403, request);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Send a valid JSON body." }, 400, request); }

    // One lifecycle contract for every game. Legacy payloads remain accepted while
    // older clients are phased out: playAgain/choice map to replay or lobby.
    let choice = body.choice;
    if (choice === "continue" || choice === "restart") choice = "replay";
    if (choice === "lobby") choice = "lobby";
    if (typeof body.playAgain === "boolean") choice = body.playAgain ? "replay" : "lobby";
    if (typeof body.playAgain === "boolean" && body.choice === "replay") choice = "replay";
    if (choice !== "replay" && choice !== "lobby") {
      return json({ error: "Choose Replay or Return to lobby." }, 400, request);
    }

    if (choice === "lobby") {
      this.recordHistory("returned-to-lobby", player.nickname + " chose to return everyone to the lobby", { gameId: game.id });
      this.room.lifecycle = "lobby";
      for (const entry of this.room.players) if (entry.role === "spectator" || entry.role === "waiting") entry.role = "player";
      this.room.gameId = null; this.room.gameMetadata = null; this.room.gameState = null; this.room.results = null;
      this.room.stateVersion = (this.room.stateVersion || 0) + 1;
      this.room.recentActionIds = []; this.room.rematchVotes = {}; this.room.lastActivityAt = Date.now();
      await this.persistAndSchedule();
      this.broadcast({ type: "room-updated", room: publicRoom(this.room), stateVersion: this.room.stateVersion });
      return json({ ok: true, status: "lobby", room: publicRoom(this.room) }, 200, request);
    }

    // Votes are deliberately mutable until the final participant agrees.
    this.room.rematchVotes = { ...(this.room.rematchVotes || {}), [player.id]: "replay" };
    this.recordHistory("lifecycle-vote", player.nickname + " voted to replay " + game.name, { gameId: game.id, choice });
    const minimum = game.players?.min ?? 1;
    if (participants.length < minimum) return json({ error: `This game needs at least ${minimum} remaining players to replay.` }, 409, request);
    const allAgreed = participants.every(id => this.room.rematchVotes[id] === "replay" &&
      this.room.players.some(entry => entry.id === id && entry.connected && entry.role === "player"));
    if (!allAgreed) {
      this.room.lastActivityAt = Date.now();
      await this.persistAndSchedule();
      this.broadcast({ type: "rematch-vote", votes: this.room.rematchVotes, playerIds: participants });
      return json({ ok: true, status: "waiting", choice: "replay", votes: this.room.rematchVotes }, 200, request);
    }

    const context = this.gameContext(game, player);
    let nextState;
    try {
      // Wavelength's next-round hook preserves cumulative scores. Other games
      // start a fresh match through their existing initial-state contract.
      nextState = game.startNextRound
        ? await game.startNextRound(context, this.room.gameState, "continue")
        : await game.createInitialState(context, this.room.gameState);
    } catch {
      return json({ error: "The next round could not be initialized." }, 500, request);
    }
    if (!nextState) return json({ error: "The game returned no next state." }, 500, request);
    this.room.gameState = nextState;
    this.room.lifecycle = "playing"; this.room.results = null; this.room.rematchVotes = {};
    this.room.stateVersion = (this.room.stateVersion || 0) + 1; this.room.recentActionIds = [];
    this.room.lastActivityAt = Date.now();
    this.recordHistory("rematch-started", game.name + " replay started", { gameId: game.id });
    await this.persistAndSchedule();
    const publicSnapshot = publicRoom(this.room);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        if (ws.readyState !== WebSocket.OPEN) continue;
        const socketPlayerId = ws.deserializeAttachment()?.playerId;
        const privateState = game.getPrivateState ? await game.getPrivateState(this.room.gameState, socketPlayerId) : null;
        ws.send(JSON.stringify({ type: "game-started", room: publicSnapshot, privateState, stateVersion: this.room.stateVersion, rematch: true }));
      } catch {}
    }
    return json({ ok: true, status: "playing", choice: "replay", room: publicRoom(this.room) }, 200, request);
  }
  async leaveGame(request) {
    const player = this.authorizePlayer(request);
    if (!player) return json({ error: "A valid player session is required." }, 401, request);
    if (this.room.lifecycle !== "results") return json({ error: "You can leave this game after the round finishes. The party will stay together." }, 409, request);
    const game = getServerGame(this.room.gameId);
    const order = this.room.gameState?.playerOrder || [];
    if (!order.includes(player.id) || player.role !== "player") return json({ error: "You are not an active player in this game." }, 409, request);
    player.role = "waiting";
    this.room.rematchVotes = { ...(this.room.rematchVotes || {}) };
    delete this.room.rematchVotes[player.id];
    const remaining = order.filter(id => this.room.players.some(entry => entry.id === id && entry.role === "player"));
    this.recordHistory("game-left", player.nickname + " left the game and returned to the lobby", { playerId: player.id, gameId: game?.id });
    const minimum = game?.players?.min ?? 1;
    if (remaining.length < minimum) {
      this.room.lifecycle = "lobby";
      for (const entry of this.room.players) if (entry.role === "spectator" || entry.role === "waiting") entry.role = "player";
      this.room.gameId = null; this.room.gameMetadata = null; this.room.gameState = null; this.room.results = null; this.room.rematchVotes = {};
      this.room.stateVersion = (this.room.stateVersion || 0) + 1;
      this.room.recentActionIds = [];
      await this.persistAndSchedule();
      this.broadcast({ type: "room-updated", room: publicRoom(this.room), stateVersion: this.room.stateVersion });
      return json({ ok: true, status: "lobby", room: publicRoom(this.room) }, 200, request);
    }
    this.room.lastActivityAt = Date.now();
    await this.persistAndSchedule();
    this.broadcast({ type: "room-updated", room: publicRoom(this.room), stateVersion: this.room.stateVersion });
    return json({ ok: true, status: "left-game", remainingPlayerIds: remaining, minimumPlayers: minimum, room: publicRoom(this.room) }, 200, request);
  }
  async resetGame(request) {
    const player = this.authorizePlayer(request);
    if (!player) return json({ error: "A valid player session is required." }, 401, request);
    if (!player.isHost) return json({ error: "Only the host can return the party to the lobby." }, 403, request);
    if (!["guide", "results", "playing"].includes(this.room.lifecycle)) return json({ error: "There is no game to reset." }, 409, request);
    this.recordHistory("returned-to-lobby", `${this.room.gameMetadata?.name || "Game"} ended; returned to lobby`, { gameId: this.room.gameId });
    this.room.lifecycle = "lobby";
    for (const entry of this.room.players) if (entry.role === "spectator" || entry.role === "waiting") entry.role = "player";
    this.room.gameId = null;
    this.room.gameMetadata = null;
    this.room.gameState = null;
    this.room.results = null;
    this.room.stateVersion = (this.room.stateVersion || 0) + 1;
    this.room.recentActionIds = [];
    this.room.rematchVotes = {};
    this.room.lastActivityAt = Date.now();
    await this.persistAndSchedule();
    this.broadcast({ type: "host-ended-round", message: "The host ended the round and returned everyone to the lobby." });
    this.broadcast({ type: "room-updated", room: publicRoom(this.room), stateVersion: this.room.stateVersion });
    return json({ ok: true, room: publicRoom(this.room) }, 200, request);
  }
  authorizePlayer(request) {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    return this.room.players.find(entry => entry.token === token) || null;
  }
  gameContext(game, player) {
    return {
      room: { code: this.room.code, name: this.room.name, gameId: this.room.gameId, lifecycle: this.room.lifecycle },
      player: { id: player.id, nickname: player.nickname, isHost: player.isHost },
      players: this.room.players.map(({ id, nickname, isHost, connected, role = "player" }) => ({ id, nickname, isHost, connected, role })),
      game: { id: game.id, interactionModel: game.interactionModel, lateJoinPolicy: game.lateJoinPolicy },
    };
  }
  async leave(request) {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const player = this.room.players.find(entry => entry.token === token);
    if (!player) return json({ error: "Invalid player session." }, 401, request);
    this.room.players = this.room.players.filter(entry => entry.id !== player.id);
    const now = Date.now(); this.room.lastActivityAt = now;
    this.recordHistory("left", `${player.nickname} left the lobby`, { playerId: player.id });
    // If an active participant leaves explicitly, end the round cleanly instead of
    // leaving a game whose required player can never return.
    if (this.room.lifecycle !== "lobby" && player.role === "player") {
      this.room.lifecycle = "lobby";
      for (const entry of this.room.players) if (entry.role === "spectator" || entry.role === "waiting") entry.role = "player";
      this.room.gameId = null; this.room.gameMetadata = null; this.room.gameState = null;
      this.room.results = null; this.room.rematchVotes = {};
      this.room.stateVersion = (this.room.stateVersion || 0) + 1;
      this.room.recentActionIds = [];
    }
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.deserializeAttachment()?.playerId === player.id) {
        try { socket.close(1000, "Player left"); } catch {}
      }
    }
    if (this.room.players.length === 0) {
      for (const socket of this.ctx.getWebSockets()) { try { socket.close(1000, "Party closed"); } catch {} }
      this.room = null;
      await this.ctx.storage.deleteAll();
      return json({ ok: true, roomClosed: true }, 200, request);
    }
    this.room.emptySinceAt = null;
    if (player.isHost) this.assignHost();
    await this.persistAndSchedule();
    this.broadcast({ type: "room-updated", room: publicRoom(this.room) });
    return json({ ok: true, roomClosed: false, room: publicRoom(this.room) }, 200, request);
  }
  async connect(url) {
    const token = url.searchParams.get("token") || "";
    const player = this.room.players.find(entry => entry.token === token);
    if (!player) return json({ error: "Invalid player session." }, 401);
    const connectionId = crypto.randomUUID();
    for (const oldSocket of this.ctx.getWebSockets()) {
      const attachment = oldSocket.deserializeAttachment();
      if (attachment?.playerId === player.id) {
        try { oldSocket.close(4001, "Replaced by a newer connection"); } catch {}
      }
    }
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: player.id, connectionId });
    const wasDisconnected = !player.connected;
    player.connected = true; player.disconnectExpiresAt = null;
    // Reconnects are reflected in live presence; avoid cluttering lobby history for transient socket swaps.
    this.room.emptySinceAt = null; this.room.lastActivityAt = Date.now();
    await this.persistAndSchedule();
    const activeGame = getServerGame(this.room.gameId);
    const privateState = activeGame?.getPrivateState ? await activeGame.getPrivateState(this.room.gameState, player.id) : null;
    server.send(JSON.stringify({ type: "room-snapshot", room: publicRoom(this.room), playerId: player.id, privateState, stateVersion: this.room.stateVersion || 0 }));
    this.broadcast({ type: "room-updated", room: publicRoom(this.room) });
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(socket, message) {
    await this.ready;
    let data;
    try { data = JSON.parse(message); } catch {
      try { socket.send(JSON.stringify({ type: "error", message: "Invalid message." })); } catch {}
      return;
    }
    const attachment = socket.deserializeAttachment();
    const player = this.room?.players.find(entry => entry.id === attachment?.playerId);
    if (!player) return;
    if (data?.type === "ping") {
      this.room.lastActivityAt = Date.now();
      await this.persistAndSchedule();
      try { socket.send(JSON.stringify({ type: "pong", at: Date.now() })); } catch {}
    } else {
      try { socket.send(JSON.stringify({ type: "error", message: "Game actions are not enabled yet." })); } catch {}
    }
  }
  async webSocketClose(socket) { await this.markDisconnected(socket); }
  async webSocketError(socket) { await this.markDisconnected(socket); }
  async markDisconnected(socket) {
    await this.ready;
    if (!this.room) return;
    const attachment = socket.deserializeAttachment();
    if (!attachment?.playerId) return;
    const player = this.room.players.find(entry => entry.id === attachment.playerId);
    if (!player) return; // Explicit leave or expiry already removed the player.
    const hasNewerConnection = this.ctx.getWebSockets().some(other => {
      if (other === socket || other.readyState !== WebSocket.OPEN) return false;
      const otherAttachment = other.deserializeAttachment();
      return otherAttachment?.playerId === player.id && otherAttachment?.connectionId !== attachment.connectionId;
    });
    if (hasNewerConnection) return;
    if (!player.connected) return;
    player.connected = false;
    player.disconnectExpiresAt = Date.now() + RECONNECT_GRACE_MS;
    // Disconnect state is shown in the player list; do not add transient socket drops to lobby history.
    this.room.lastActivityAt = Date.now();
    await this.persistAndSchedule();
    this.broadcast({ type: "room-updated", room: publicRoom(this.room) });
  }
  recordHistory(type, message, details = {}) {
    if (!this.room) return;
    const history = this.room.history || (this.room.history = []);
    history.push({ type, message, at: Date.now(), ...details });
    // Keep the room timeline useful without allowing it to grow without bound.
    if (history.length > 150) history.splice(0, history.length - 150);
  }
  assignHost() {
    if (!this.room.players.length) { this.room.hostId = null; return; }
    const nextHost = randomItem(this.room.players);
    this.room.hostId = nextHost.id;
    for (const player of this.room.players) player.isHost = player.id === nextHost.id;
  }
  broadcast(message) {
    const serialized = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      try { if (socket.readyState === WebSocket.OPEN) socket.send(serialized); } catch {}
    }
  }
  async touch() {
    this.room.lastActivityAt = Date.now();
    if (this.room.players.length > 0) await this.persistAndSchedule();
  }
  async persistAndSchedule() {
    await this.ctx.storage.put("room", this.room);
    const deadlines = [];
    if (this.room.players.length > 0) {
      deadlines.push(this.room.lastActivityAt + ROOM_IDLE_TTL_MS);
      for (const player of this.room.players) {
        if (!player.connected && player.disconnectExpiresAt) {
          const activeParticipant = this.room.lifecycle === "playing" && player.role === "player"
            && this.room.gameState?.alivePlayerIds?.includes(player.id);
          if (!activeParticipant) deadlines.push(player.disconnectExpiresAt);
        }
      }
    }
    if (deadlines.length) await this.ctx.storage.setAlarm(Math.min(...deadlines));
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    await this.ready;
    if (!this.room) return;
    const now = Date.now();
    if (this.room.players.length === 0) {
      for (const socket of this.ctx.getWebSockets()) { try { socket.close(1000, "Party closed"); } catch {} }
      this.room = null; await this.ctx.storage.deleteAll(); return;
    }
    if (now >= this.room.lastActivityAt + ROOM_IDLE_TTL_MS) {
      for (const socket of this.ctx.getWebSockets()) { try { socket.close(1000, "Party expired"); } catch {} }
      this.room = null; await this.ctx.storage.deleteAll(); return;
    }
    // Games can opt to retain disconnected active participants until they return.
    // The shared room lifecycle consults the game contract instead of game IDs.
    const activeGame = this.room.lifecycle === "playing" ? getServerGame(this.room.gameId) : null;
    if (activeGame?.preserveDisconnectedPlayersWhileActive === true) {
      for (const player of this.room.players) {
        if (!player.connected && player.role === "player" && this.room.gameState?.alivePlayerIds?.includes(player.id)
          && player.disconnectExpiresAt && now >= player.disconnectExpiresAt) {
          player.disconnectExpiresAt = null;
        }
      }
    }
    const expired = this.room.players.filter(player => !player.connected && player.disconnectExpiresAt && now >= player.disconnectExpiresAt);
    if (expired.length) {
      const expiredIds = new Set(expired.map(player => player.id));
      const hostExpired = expired.some(player => player.isHost);
      this.room.players = this.room.players.filter(player => !expiredIds.has(player.id));
      if (this.room.players.length === 0) {
        for (const entry of expired) this.recordHistory("left-after-disconnect", entry.nickname + " was removed after the reconnect window expired", { playerId: entry.id });
        for (const socket of this.ctx.getWebSockets()) { try { socket.close(1000, "Party closed"); } catch {} }
        this.room = null; await this.ctx.storage.deleteAll(); return;
      } else if (hostExpired) {
        const connected = this.room.players.filter(player => player.connected);
        this.assignSpecificHost(connected.length ? randomItem(connected) : randomItem(this.room.players));
      }
      this.room.lastActivityAt = now;
      for (const entry of expired) this.recordHistory("left-after-disconnect", `${entry.nickname} was removed after the reconnect window expired`, { playerId: entry.id });
      await this.persistAndSchedule();
      this.broadcast({ type: "room-updated", room: publicRoom(this.room), expiredPlayerIds: [...expiredIds] });
      return;
    }
    await this.persistAndSchedule();
  }
  assignSpecificHost(host) {
    this.room.hostId = host.id;
    for (const player of this.room.players) player.isHost = player.id === host.id;
  }
}
