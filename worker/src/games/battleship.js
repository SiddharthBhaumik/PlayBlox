/** Server-authoritative Battleship rules. Fleets are only exposed to their owner. */
const FLEET = [
  { id: "carrier", name: "Carrier", size: 5 },
  { id: "battleship", name: "Battleship", size: 4 },
  { id: "cruiser", name: "Cruiser", size: 3 },
  { id: "submarine", name: "Submarine", size: 3 },
  { id: "destroyer", name: "Destroyer", size: 2 },
];
const BOARD = 10;
const validCell = value => Number.isInteger(value) && value >= 0 && value < BOARD * BOARD;
const fleetError = ships => {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return "Place all five ships before deploying your fleet.";
  const occupied = new Set();
  for (const spec of FLEET) {
    const ship = ships.find(item => item?.id === spec.id);
    if (!ship || !Array.isArray(ship.cells) || ship.cells.length !== spec.size || ship.cells.some(cell => !validCell(cell))) return "Each ship must have the correct length and fit on the board.";
    if (new Set(ship.cells).size !== spec.size) return "A ship cannot occupy the same square twice.";
    const rows = ship.cells.map(cell => Math.floor(cell / BOARD)), cols = ship.cells.map(cell => cell % BOARD);
    const horizontal = rows.every(row => row === rows[0]) && cols.every((col, i) => i === 0 || col === cols[i - 1] + 1);
    const vertical = cols.every(col => col === cols[0]) && rows.every((row, i) => i === 0 || row === rows[i - 1] + 1);
    if (!horizontal && !vertical) return "Ships must be straight and occupy consecutive squares.";
    for (const cell of ship.cells) {
      if (occupied.has(cell)) return "Ships cannot overlap.";
      occupied.add(cell);
    }
  }
  return null;
};
export const battleship = {
  id: "battleship",
  name: "Battleship",
  description: "Deploy your fleet, hunt the enemy fleet, and sink all five ships.",
  guide: "CLASSIC BATTLESHIP · 2 PLAYERS\n\nFLEET SETUP: Each player secretly places a Carrier (5), Battleship (4), Cruiser (3), Submarine (3), and Destroyer (2) on a 10×10 grid. Select a ship, choose horizontal or vertical, then click a starting square. Ships must fit and cannot overlap. Deploy your fleet when all five are placed.\n\nBATTLE: Players take turns firing at one square on the opponent’s grid. A red marker is a hit; a pale marker is a miss. You cannot fire at a square twice. The defender’s ships stay hidden.\n\nWIN: Sink every square of all five enemy ships. Reconnects preserve the server’s board, fleet, and shot history. After a match, both players can choose Play again or return to the lobby.",
  emoji: "🚢",
  color: "#b9dce9",
  entry: "./src/games/battleship/index.html",
  players: { min: 2, max: 2 },
  interactionModel: "turn-based",
  lateJoinPolicy: "wait",
  spectators: { supported: true },

  canStart(context) {
    const players = context.players.filter(player => player.role === "player" && player.connected);
    return players.length === 2 ? { ok: true } : { ok: false, reason: "Battleship needs exactly two connected players." };
  },
  createInitialState(context, previousState = null) {
    const players = context.players.filter(player => player.role === "player" && player.connected).slice(0, 2);
    let playerOrder = players.map(player => player.id);
    if (Array.isArray(previousState?.playerOrder) && previousState.playerOrder.length === 2 && playerOrder.every(id => previousState.playerOrder.includes(id))) {
      playerOrder = [previousState.playerOrder[1], previousState.playerOrder[0]];
    } else if (crypto.getRandomValues(new Uint8Array(1))[0] % 2) playerOrder.reverse();
    return { phase: "placement", playerOrder, fleets: {}, readyPlayerIds: [], shots: {}, currentPlayerId: null, winnerId: null, lastShot: null, moveCount: 0 };
  },
  getPublicState(state) {
    if (!state) return null;
    return { phase: state.phase, playerOrder: state.playerOrder, readyPlayerIds: state.readyPlayerIds || [],
      shots: state.shots || {}, currentPlayerId: state.currentPlayerId, winnerId: state.winnerId,
      lastShot: state.lastShot || null, moveCount: state.moveCount || 0 };
  },
  getPrivateState(state, playerId) {
    if (!state || !state.playerOrder.includes(playerId)) return null;
    return { fleet: state.fleets?.[playerId] || null, fleetReady: (state.readyPlayerIds || []).includes(playerId) };
  },
  validateAction(context, state, action) {
    if (!state || !Array.isArray(state.playerOrder) || state.playerOrder.length !== 2) return { ok: false, reason: "The game state is invalid." };
    if (!state.playerOrder.includes(context.player.id) || context.player.role !== "player") return { ok: false, reason: "Only the two players can play." };
    if (!action || typeof action.type !== "string") return { ok: false, reason: "Choose a valid action." };
    if (state.winnerId) return { ok: false, reason: "The match has finished." };
    if (action.type === "submit-fleet") {
      if (state.phase !== "placement") return { ok: false, reason: "Fleet placement is over." };
      if ((state.readyPlayerIds || []).includes(context.player.id)) return { ok: false, reason: "Your fleet is already deployed." };
      const error = fleetError(action.ships);
      if (error) return { ok: false, reason: error };
      return { ok: true };
    }
    if (action.type === "fire-shot") {
      if (state.phase !== "battle") return { ok: false, reason: "Both fleets must be deployed before firing." };
      if (state.currentPlayerId !== context.player.id) return { ok: false, reason: "It is the other player's turn." };
      if (!validCell(action.cell)) return { ok: false, reason: "Choose a square on the board." };
      const opponentId = state.playerOrder.find(id => id !== context.player.id);
      if ((state.shots?.[context.player.id] || []).some(shot => shot.cell === action.cell)) return { ok: false, reason: "You have already fired at that square." };
      if (!state.fleets?.[opponentId]) return { ok: false, reason: "The opponent has not deployed a fleet." };
      return { ok: true };
    }
    return { ok: false, reason: "Unknown Battleship action." };
  },
  reduceAction(context, state, action) {
    if (action.type === "submit-fleet") {
      const fleets = { ...state.fleets, [context.player.id]: action.ships.map(ship => ({ id: ship.id, cells: ship.cells.slice() })) };
      const readyPlayerIds = [...new Set([...(state.readyPlayerIds || []), context.player.id])];
      const ready = readyPlayerIds.length === 2;
      return { ...state, fleets, readyPlayerIds, phase: ready ? "battle" : "placement",
        currentPlayerId: ready ? state.playerOrder[0] : null };
    }
    const opponentId = state.playerOrder.find(id => id !== context.player.id);
    const fleet = state.fleets[opponentId];
    const occupied = new Map();
    for (const ship of fleet) for (const cell of ship.cells) occupied.set(cell, ship.id);
    const hit = occupied.has(action.cell);
    const shots = { ...state.shots, [context.player.id]: [...(state.shots[context.player.id] || []), { cell: action.cell, hit, shipId: hit ? occupied.get(action.cell) : null }] };
    const hitCells = new Set(Object.values(shots).flat().filter(shot => shot.hit && shot.shipId).map(shot => shot.cell));
    const sunkShipIds = fleet.filter(ship => ship.cells.every(cell => hitCells.has(cell))).map(ship => ship.id);
    const allSunk = fleet.every(ship => ship.cells.every(cell => hitCells.has(cell)));
    return { ...state, shots, currentPlayerId: allSunk ? null : opponentId,
      winnerId: allSunk ? context.player.id : null,
      lastShot: { playerId: context.player.id, targetId: opponentId, cell: action.cell, hit, sunkShipIds, shipSunk: hit && sunkShipIds.includes(occupied.get(action.cell)) },
      moveCount: state.moveCount + 1 };
  },
  getStatus(context, state) { return state.winnerId ? "finished" : "active"; },
  getResults(context, state) {
    const winner = context.players.find(player => player.id === state.winnerId);
    return { outcome: "winner", winnerId: state.winnerId, winnerNickname: winner?.nickname || null, moveCount: state.moveCount };
  },
};
