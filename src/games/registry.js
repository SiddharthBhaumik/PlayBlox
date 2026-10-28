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
    guide: "Each round, secretly choose whether to reload, shoot at a target, or shield yourself. Actions resolve together, so predict what other players will do. Manage ammunition and survive to be the last player standing.",
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
    description: 'Secretly assign words, ask curious questions, then reveal the automatic answers together.',
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
