/**
 * Tic-Tac-Toe reference game module.
 * This file contains rules only; transport and room lifecycle stay generic.
 */
export const ticTacToe = {
  id: "tic-tac-toe",
  name: "Tic-Tac-Toe",
  description: "A classic little battle of Xs and Os. First to line up three wins.",
  emoji: "⭕",
  color: "#ffe4a8",
  entry: "./src/games/tic-tac-toe/index.html",
  players: { min: 2, max: 2 },
  interactionModel: "turn-based",
  lateJoinPolicy: "wait",
  spectators: { supported: true },

  canStart(context) {
    const players = context.players.filter(player => player.role === "player" && player.connected);
    return players.length === 2
      ? { ok: true }
      : { ok: false, reason: "Tic-Tac-Toe needs exactly two connected players." };
  },

  createInitialState(context) {
    const players = context.players.filter(player => player.role === "player" && player.connected);
    return {
      board: Array(9).fill(null),
      playerOrder: players.slice(0, 2).map(player => player.id),
      symbols: { [players[0].id]: "X", [players[1].id]: "O" },
      currentPlayerId: players[0].id,
      winnerId: null,
      winningLine: null,
      isDraw: false,
      moveCount: 0,
    };
  },

  validateAction(context, state, action) {
    if (!state || !Array.isArray(state.board) || state.board.length !== 9) return { ok: false, reason: "The game state is invalid." };
    if (state.winnerId || state.isDraw) return { ok: false, reason: "This round has finished." };
    if (!state.playerOrder.includes(context.player.id)) return { ok: false, reason: "Only the two players can make moves." };
    if (context.player.id !== state.currentPlayerId) return { ok: false, reason: "It's the other player's turn." };
    if (!action || action.type !== "place-mark" || !Number.isInteger(action.index) || action.index < 0 || action.index > 8) {
      return { ok: false, reason: "Choose a valid square." };
    }
    if (state.board[action.index] !== null) return { ok: false, reason: "That square is already taken." };
    return { ok: true };
  },

  reduceAction(context, state, action) {
    const board = state.board.slice();
    board[action.index] = state.symbols[context.player.id];
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const winningLine = lines.find(([a,b,c]) => board[a] && board[a] === board[b] && board[a] === board[c]) || null;
    const winnerId = winningLine ? context.player.id : null;
    const isDraw = !winnerId && board.every(Boolean);
    const nextPlayerId = state.playerOrder.find(id => id !== context.player.id);
    return {
      ...state,
      board,
      moveCount: state.moveCount + 1,
      winnerId,
      winningLine,
      isDraw,
      currentPlayerId: winnerId || isDraw ? null : nextPlayerId,
    };
  },

  getStatus(context, state) {
    return state.winnerId || state.isDraw ? "finished" : "active";
  },

  getResults(context, state) {
    const winner = context.players.find(player => player.id === state.winnerId);
    return {
      outcome: state.winnerId ? "winner" : "draw",
      winnerId: state.winnerId,
      winnerNickname: winner?.nickname || null,
    };
  },
};
