/**
 * Plot Twist — private, server-authoritative collaborative storytelling.
 * The public state never contains story text until the host reveals it.
 */
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;
const MIN_LINES = 3;
const MAX_LINES = 24;
const LINE_LIMIT = 240;

function participants(context) {
  return context.players.filter(player => player.role === "player" && player.connected);
}
function shuffled(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function assignmentsFor(playerOrder, storyOrder, round) {
  const assignments = {};
  for (let index = 0; index < playerOrder.length; index++) {
    const storyIndex = (index - round + playerOrder.length * 10) % playerOrder.length;
    assignments[playerOrder[index]] = storyOrder[storyIndex];
  }
  return assignments;
}
function storyForPlayer(state, playerId) {
  if (state.phase === "starter") return playerId;
  if (state.phase !== "writing") return null;
  return state.roundAssignments?.[playerId] || null;
}
function publicStory(story, count = story.lines.length) {
  return { id: story.id, creatorId: story.creatorId, lines: story.lines.slice(0, count) };
}

export const plotTwist = {
  id: "plot-twist",
  name: "Plot Twist",
  description: "Build a story together, one secret line at a time. Nobody sees the whole plot until the reveal.",
  guide: "THE IDEA: Everyone starts a story. Then stories rotate around the group, with each player adding one line at a time.\n\nSTARTING: The host chooses how many lines each story will contain (3–24, including its opening line). Every player writes one opening line. Each opening line becomes its own story.\n\nADDING TO STORIES: Each writing round, everyone receives one story to continue. You see only the latest line in that story — never its earlier lines. Write one line that follows it. Your submission stays hidden until the final reveal.\n\nFAIR ROTATION: Every player contributes to each story once before anyone gets a second turn on that story. Assignments rotate so everyone writes exactly one line per round. The same player can contribute again in later cycles.\n\nTHE REVEAL: When every story reaches the chosen length, the host reveals the stories one line at a time. The author of each line is shown. The host presses Next to reveal the next line and then move to the next story.\n\nBe creative, follow the last line, and don't worry about where the story is heading. That's the fun!",
  emoji: "📖",
  color: "#f4dfc5",
  entry: "./src/games/plot-twist/index.html",
  players: { min: MIN_PLAYERS, max: MAX_PLAYERS },
  interactionModel: "simultaneous",
  lateJoinPolicy: "wait",
  spectators: { supported: true },
  rematchChoices: ["replay"],
  defaultRematchChoice: "replay",

  canStart(context) {
    const count = participants(context).length;
    return count >= MIN_PLAYERS && count <= MAX_PLAYERS
      ? { ok: true }
      : { ok: false, reason: "Plot Twist needs 3–8 connected players." };
  },

  createInitialState(context) {
    const playerOrder = shuffled(participants(context).map(player => player.id));
    return {
      playerOrder,
      storyOrder: [...playerOrder],
      phase: "setup",
      linesPerStory: 3,
      round: 0,
      submittedPlayerIds: [],
      pendingLines: {},
      roundAssignments: {},
      stories: {},
      revealStoryIndex: 0,
      revealLineIndex: 0,
    };
  },

  validateAction(context, state, action) {
    if (!state || !Array.isArray(state.playerOrder) || !action || typeof action !== "object") {
      return { ok: false, reason: "The game state or action is invalid." };
    }
    const id = context.player.id;
    if (!state.playerOrder.includes(id)) return { ok: false, reason: "Only selected players can play." };
    if (action.type === "set-lines") {
      if (state.phase !== "setup" || !context.player.isHost) return { ok: false, reason: "Only the host can set the story length before writing starts." };
      if (!Number.isInteger(action.value) || action.value < MIN_LINES || action.value > MAX_LINES) {
        return { ok: false, reason: "Choose between 3 and 24 lines per story." };
      }
      return { ok: true };
    }
    if (action.type === "submit-line") {
      if (state.phase !== "starter" && state.phase !== "writing") return { ok: false, reason: "Stories are not accepting lines right now." };
      if (state.submittedPlayerIds.includes(id)) return { ok: false, reason: "Your line is already locked for this round." };
      if (typeof action.text !== "string" || !action.text.trim() || action.text.trim().length > LINE_LIMIT) {
        return { ok: false, reason: "Write a line of up to 240 characters." };
      }
      return { ok: true };
    }
    if (action.type === "reveal-next") {
      if (state.phase !== "reveal" || !context.player.isHost) return { ok: false, reason: "Only the host controls the story reveal." };
      return { ok: true };
    }
    return { ok: false, reason: "Unknown Plot Twist action." };
  },

  reduceAction(context, state, action) {
    if (action.type === "set-lines") {
      return { ...state, linesPerStory: action.value, phase: "starter", submittedPlayerIds: [], pendingLines: {} };
    }
    if (action.type === "submit-line") {
      const id = context.player.id;
      const pendingLines = { ...state.pendingLines, [id]: action.text.trim().slice(0, LINE_LIMIT) };
      const submittedPlayerIds = state.playerOrder.filter(playerId => pendingLines[playerId] !== undefined);
      if (submittedPlayerIds.length < state.playerOrder.length) {
        return { ...state, pendingLines, submittedPlayerIds };
      }
      if (state.phase === "starter") {
        const stories = {};
        for (const playerId of state.playerOrder) {
          stories[playerId] = {
            id: playerId,
            creatorId: playerId,
            lines: [{ playerId, authorName: context.players.find(player => player.id === playerId)?.nickname || "Player", text: pendingLines[playerId] }],
          };
        }
        return {
          ...state, stories, phase: "writing", round: 1,
          submittedPlayerIds: [], pendingLines: {},
          roundAssignments: assignmentsFor(state.playerOrder, state.storyOrder, 1),
        };
      }
      const stories = { ...state.stories };
      for (let playerIndex = 0; playerIndex < state.playerOrder.length; playerIndex++) {
        const playerId = state.playerOrder[playerIndex];
        const storyId = state.roundAssignments[playerId];
        const story = stories[storyId];
        stories[storyId] = {
          ...story,
          lines: [...story.lines, { playerId, authorName: context.players.find(player => player.id === playerId)?.nickname || "Player", text: pendingLines[playerId] }],
        };
      }
      const complete = state.storyOrder.every(storyId => stories[storyId].lines.length >= state.linesPerStory);
      return {
        ...state,
        stories,
        phase: complete ? "reveal" : "writing",
        round: state.round + (complete ? 0 : 1),
        roundAssignments: complete ? {} : assignmentsFor(state.playerOrder, state.storyOrder, state.round + 1),
        submittedPlayerIds: [],
        pendingLines: {},
        revealStoryIndex: 0,
        revealLineIndex: 0,
      };
    }
    if (action.type === "reveal-next") {
      const storyId = state.storyOrder[state.revealStoryIndex];
      const story = state.stories[storyId];
      if (state.revealLineIndex + 1 < story.lines.length) {
        return { ...state, revealLineIndex: state.revealLineIndex + 1 };
      }
      if (state.revealStoryIndex + 1 < state.storyOrder.length) {
        return { ...state, revealStoryIndex: state.revealStoryIndex + 1, revealLineIndex: 0 };
      }
      return { ...state, phase: "finished" };
    }
    return state;
  },

  getPrivateState(state, playerId) {
    if (!state || !state.playerOrder.includes(playerId)) return null;
    if (state.phase === "starter") {
      return { mode: "starter" };
    }
    if (state.phase === "writing") {
      const storyId = storyForPlayer(state, playerId);
      const story = state.stories[storyId];
      const latest = story?.lines[story.lines.length - 1];
      return latest ? {
        mode: "writing",
        latestLine: latest.text,
        previousAuthorName: null,
      } : null;
    }
    return null;
  },

  getPublicState(state) {
    if (!state) return state;
    const base = {
      playerOrder: state.playerOrder,
      phase: state.phase,
      linesPerStory: state.linesPerStory,
      round: state.round,
      submittedPlayerIds: state.submittedPlayerIds,
      submittedCount: state.submittedPlayerIds.length,
      playerCount: state.playerOrder.length,
      revealStoryIndex: state.revealStoryIndex,
      revealLineIndex: state.revealLineIndex,
    };
    if (state.phase === "reveal") {
      base.revealedStories = state.storyOrder.map((id, index) => {
        const story = state.stories[id];
        if (index < state.revealStoryIndex) return publicStory(story);
        if (index === state.revealStoryIndex) return publicStory(story, state.revealLineIndex + 1);
        return { id: story.id, creatorId: story.creatorId, lines: [] };
      });
    }
    if (state.phase === "finished") {
      base.revealedStories = state.storyOrder.map(id => publicStory(state.stories[id]));
    }
    return base;
  },

  onPlayerLeave(context, state, playerId) {
    if (!state || !state.playerOrder.includes(playerId)) return state || null;
    if (state.phase === "reveal" || state.phase === "finished") {
      return { ...state, playerOrder: state.playerOrder.filter(id => id !== playerId) };
    }
    const playerOrder = state.playerOrder.filter(id => id !== playerId);
    if (playerOrder.length < MIN_PLAYERS) return null;
    const storyOrder = state.phase === "setup" || state.phase === "starter"
      ? playerOrder
      : state.storyOrder.filter(id => id !== playerId);
    const pendingLines = { ...state.pendingLines };
    delete pendingLines[playerId];
    const stories = { ...state.stories };
    delete stories[playerId];
    const submittedPlayerIds = state.submittedPlayerIds.filter(id => id !== playerId);
    const next = {
      ...state, playerOrder, storyOrder, pendingLines, stories, submittedPlayerIds,
      ...(state.phase === "writing" ? {
        // A roster change invalidates the current round's private assignments.
        // Clear submissions so nobody's line is attached to a story they did not see.
        pendingLines: {}, submittedPlayerIds: [],
        roundAssignments: assignmentsFor(playerOrder, storyOrder, state.round),
      } : {}),
    };
    if (state.phase === "starter" && submittedPlayerIds.length === playerOrder.length) {
      const built = {};
      for (const id of playerOrder) built[id] = { id, creatorId: id, lines: [{ playerId: id, authorName: context.players.find(player => player.id === id)?.nickname || "Player", text: pendingLines[id] }] };
      return { ...next, stories: built, phase: "writing", round: 1, pendingLines: {}, submittedPlayerIds: [],
        roundAssignments: assignmentsFor(playerOrder, storyOrder, 1) };
    }
    return next;
  },

  startNextRound(context) {
    return this.createInitialState(context);
  },

  getStatus(context, state) {
    return state?.phase === "finished" ? "finished" : "active";
  },

  getResults(context, state) {
    return {
      outcome: "complete",
      playerCount: state.playerOrder.length,
      linesPerStory: state.linesPerStory,
      stories: state.storyOrder.map(id => publicStory(state.stories[id])),
    };
  },
};
