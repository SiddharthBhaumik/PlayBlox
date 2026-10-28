/**
 * PLAYBLOX GAME REGISTRY
 * ======================
 * Add one entry here for every game you add to the project.
 *
 * Each entry describes how the game appears in the lobby:
 *   id          unique, URL-friendly identifier
 *   name        title shown on the game card
 *   description short lobby description
 *   icon        optional path to a PNG/SVG game icon (emoji is the fallback)
 *   color       pastel card background
 *   status      "coming-soon" or "ready"
 *   path        relative URL to the game's own page (only needed when ready)
 *
 * When a game is implemented, create its own folder/page under src/games/<id>/
 * (or games/<id>/ for a static standalone game), set status to "ready", and
 * set path to that entry point. The lobby renderer will make the card clickable.
 *
 * Do not put game rules, rendering, or gameplay code in app.js. Each game should
 * own its own files and use this registry only to announce itself to the lobby.
 */
export const gameRegistry = [
  {
    id: 'tic-tac-toe',
    name: 'Tic-Tac-Toe',
    description: 'A classic little battle of Xs and Os. First to line up three wins.',
    guide: "Take turns placing X or O in an empty square. Line up three marks horizontally, vertically, or diagonally to win. If all nine squares fill without a line, the game is a draw.",
    emoji: '⭕',
    icon: './assets/game-icons/tic-tac-toe.svg',
    color: '#ffe4a8',
    status: 'ready',
    path: './src/games/tic-tac-toe/index.html',
    entryMode: 'party',
    players: { min: 2, max: 2 },
    interactionModel: 'turn-based',
    lateJoinPolicy: 'wait',
    spectators: { supported: true },
  },
  {
    id: 'bullet-matrix',
    name: 'Bullet Matrix',
    description: 'Reload, shoot, and shield in secret. Predict everyone else to be the last one standing.',
    guide: "GOAL: Be the last player alive. Everyone secretly chooses one action each round. Actions resolve together only after every living player has submitted.\n\n1. RELOAD: Gain 1 bullet if no bullets hit you this round. You start with 0 bullets, so reloading is how you get ammunition. If you are hit while reloading, you are eliminated and gain no bullet.\n\n2. SHOOT: Spend bullets you already have to shoot one or more different living opponents. Choose how many bullets to send to each target; the total cannot exceed your ammunition. You cannot target yourself. Every bullet sent counts toward that target's incoming total. A target who shoots is still eliminated if any bullets hit them.\n\n3. SHIELD: Predict the exact total number of bullets that will hit you this round and enter that number as your shield strength (1–100). You survive only if the incoming total matches your choice exactly. Too many bullets, too few bullets, or no incoming bullets means you are eliminated. Shielding does not use ammunition.\n\nROUND RESOLUTION: Actions are hidden while players choose. When all living players have submitted, all shots are counted, then eliminations and successful reloads are resolved together. Eliminated players cannot take further actions. The next round begins with the remaining players.\n\nWINNING: The last surviving player wins. If every remaining player is eliminated in the same round, the match ends in a draw. Think carefully: reload to build ammunition, shoot to eliminate opponents, or shield when you can predict the exact number of incoming bullets.",
    emoji: '🔫',
    color: '#ffd9c7',
    status: 'ready',
    path: './src/games/bullet-matrix/index.html',
    entryMode: 'party',
    players: { min: 2, max: 8 },
    interactionModel: 'simultaneous',
    lateJoinPolicy: 'spectate',
    spectators: { supported: true },
  },
  {
    id: 'questionable-answers',
    name: 'Questionable Answers',
    description: 'Secretly assign words, ask questions, then reveal the wonderfully questionable answers.',
    guide: "Round 1: secretly assign a word or phrase to the next player in the arrow direction. Round 2: the arrows reverse; ask the previous player a question. Once everyone submits, reveal the questions and the words paired with them. Keep submissions secret until the reveal.",
    emoji: '🤔',
    color: '#e5e8ff',
    status: 'ready',
    path: './src/games/questionable-answers/index.html',
    entryMode: 'party',
    players: { min: 3, max: 8 },
    interactionModel: 'simultaneous',
    lateJoinPolicy: 'spectate',
    spectators: { supported: true },
  },
  {
    id: 'battleship',
    name: 'Battleship',
    description: 'Deploy your fleet, hunt the enemy fleet, and sink all five ships.',
    guide: "CLASSIC BATTLESHIP · 2 PLAYERS\n\nFLEET SETUP: Each player secretly places a Carrier (5), Battleship (4), Cruiser (3), Submarine (3), and Destroyer (2) on a 10×10 grid. Select a ship, choose horizontal or vertical, then click a starting square. Ships must fit and cannot overlap. Deploy your fleet when all five are placed.\n\nBATTLE: Players take turns firing at one square on the opponent’s grid. A red marker is a hit; a pale marker is a miss. You cannot fire at a square twice. The defender’s ships stay hidden.\n\nWIN: Sink every square of all five enemy ships. Reconnects preserve the server’s board, fleet, and shot history. After a match, both players can choose Play again or return to the lobby.",
    emoji: '🚢',
    color: '#b9dce9',
    status: 'ready',
    path: './src/games/battleship/index.html',
    entryMode: 'party',
    players: { min: 2, max: 2 },
    interactionModel: 'turn-based',
    lateJoinPolicy: 'wait',
    spectators: { supported: true },
  },
  {
    id: 'wavelength',
    name: 'Wavelength',
    description: 'Give clues, read the room, and compete for the best individual score.',
    guide: "GOAL: Earn the highest individual score, one clue at a time. Each round gives every player one clue-giver turn.\\n\\nCLUE-GIVER: The game randomly selects two ends from a bank of 500 spectrum pairs and secretly randomizes a target from 0–100. You can see the target marker; the other players cannot. Write a clue that helps the group find the target. The target stays hidden from guessers until all guesses are locked.\\n\\nGUESSERS: The spectrum and clue are shown to everyone. Discuss them together, then place your own guess. Your guess locks when submitted.\\n\\nSCORING: Guessers earn 4 points for distance 0–5, 3 for 6–12, 2 for 13–20, 1 for 21–30, and 0 for 31+. The clue-giver earns points using the distance between the target and the average of all guesses. Scores are individual.\\n\\nAFTER EVERY PLAYER HAS GIVEN A CLUE: Everyone chooses the same option: Continue to the next round (keep scores) or Restart (reset scores and begin with the first clue-giver).",
    emoji: '🎯',
    color: '#d9f0e7',
    status: 'ready',
    path: './src/games/wavelength/index.html',
    entryMode: 'party',
    players: { min: 2, max: 8 },
    interactionModel: 'simultaneous',
    lateJoinPolicy: 'spectate',
    spectators: { supported: true },
  },
  // Example for a future game (uncomment and edit when its page exists):
  // {
  //   id: 'memory-match',
  //   name: 'Memory Match',
  //   description: 'Flip the cards and find all the matching pairs.',
  //   emoji: '🃏',
  //   color: '#ffe4a8',
  //   status: 'coming-soon',
  //   path: './src/games/memory-match/index.html',
  // },
];

export function renderGameCards(container, games) {
  const availableGames = games.filter((game) => game.status === 'ready' || game.status === 'coming-soon');
  if (availableGames.length === 0) {
    container.innerHTML = `
      <div class="empty-toybox">
        <span aria-hidden="true">🧩</span>
        <strong>Room for more games!</strong>
        <span>Our first games are coming soon. The next toy can go right here!</span>
      </div>`;
    return;
  }

  container.replaceChildren(...availableGames.map((game) => {
    const partyCode = new URLSearchParams(location.search).get('party');
    const hasSavedSession = partyCode && sessionStorage.getItem('playblox:' + partyCode.toUpperCase() + ':token');
    const canOpen = game.status === 'ready' && game.path && hasSavedSession && game.entryMode !== 'party';
    const card = document.createElement(canOpen ? 'a' : 'article');
    card.className = 'game-card';
    card.style.setProperty('--game-color', game.color || '#e8e0ff');
    if (card.tagName === 'A') {
      card.href = game.path;
      card.setAttribute('aria-label', 'Play ' + game.name);
    }
    const icon = document.createElement('span');
    icon.className = 'game-emoji';
    icon.setAttribute('aria-hidden', 'true');
    if (game.icon) {
      const image = document.createElement('img');
      image.src = game.icon;
      image.alt = '';
      image.loading = 'lazy';
      image.onerror = () => { icon.textContent = game.emoji || '🎮'; };
      icon.append(image);
    } else {
      icon.textContent = game.emoji || '🎮';
    }
    const title = document.createElement('h3');
    title.textContent = game.name;
    const description = document.createElement('p');
    description.textContent = game.description || 'A new game for your party.';
    const status = document.createElement('span');
    status.className = 'game-tag';
    status.textContent = game.status === 'ready' && game.path ? (canOpen ? '▶ Play game' : '✦ Start from a party lobby') : '✦ Coming soon';
    card.append(icon, title, description, status);
    return card;
  }));
}
