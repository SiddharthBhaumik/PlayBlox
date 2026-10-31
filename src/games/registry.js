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
    guide: "MINEFIELD — COMPLETE RULEBOOK\n\nOBJECTIVE\nCapture all 3 of your opponent’s flags, or reduce their lives to 0. Each player starts with 2 lives. The maximum is 3 lives.\n\nTHE BOARD AND BASES\nThe battlefield is a randomized, rotationally mirrored 20×20 grid. Blue starts at (2,2) and Red at (19,19), using 1-based coordinates. Walls block movement and line of sight. Normal vision reaches up to 2 tiles away by Manhattan distance, subject to walls. Each player has a protected base area: tiles within Manhattan distance 3 of either starting position. Flags and mines cannot be placed in either protected base.\n\nSETUP — PLACE YOUR FLAGS\nEach player secretly chooses 3 different open floor tiles. Flags cannot be placed on walls, rooms, or either protected base. Your three flags must be on different tiles, but your flags may overlap the opponent’s flags on the same tile. The opponent cannot see your flag locations during setup. When an enemy flag enters your immediate vision, it is revealed. If it occupies the same tile as one of your own flags, the board shows a special overlapping-flags icon. Capturing an enemy flag removes it from the board and adds one to your captured count.\n\nTURN SEQUENCE\nPlayers alternate turns. On your turn:\n1. Roll the die once (1–6).\n2. Move up to the number of movement points shown, one orthogonally adjacent tile at a time. You cannot move diagonally, through walls, or onto the opponent. You may stop early.\n3. You may plant at most one mine and activate at most one power-up during your turn. These actions may be taken before or after movement.\n4. Press End Turn. You must roll before ending your turn, but you do not have to use all your movement.\n\nMINES AND MINE DEPOTS\nA mine depot gives a random number of carried mines: 1 mine (40%), 2 (35%), 3 (15%), or 4 (10%). There is no cap on carried mines or on the number of active mines on the board. You may plant at most one mine per turn on an empty floor tile orthogonally adjacent to your current position. You cannot plant on walls, rooms, flags, players, another mine, or either protected base. Your own mines are always visible to you. Enemy mines are revealed globally while your Scan is active.\nWhen a player steps onto an active mine that is not jammed against that player, the mine is consumed, the player loses 1 life, and their movement ends immediately. If a Shield is active, it is consumed instead of a life; the mine is still consumed and movement still ends. Mines have a lifetime counter starting at 6. The counter decreases by 1 at the end of every player's turn, including the turn in which the mine was planted. A mine disappears when its counter reaches 0. Mine Jammer does not pause, reset, or extend a mine's lifetime.\n\nROOMS AND LIVE ROOM STATUS\n⛏️ Mine depot: grants 1–4 mines using the probabilities above.\n✨ Power room: grants one random power-up if your inventory has fewer than 2 items.\n🏥 Medical room: restores 1 life, up to the maximum of 3.\nYour power-up inventory holds at most 2 items. If it is full, a Power room remains stocked. If you already have 3 lives, a Medical room remains stocked. A room becomes empty only when its reward is successfully collected.\nStocked room icons are ⛏️, ✨, and 🏥. Empty room icons are ▫️, ◇, and ▱ respectively. Room stock status is LIVE throughout your explored territory, including the fading three-turn trail: it shows the actual current stocked/empty state, even when the room is outside immediate vision. It updates when either player collects from a room or it refills. The room and its status are hidden again when the tile leaves your explored territory.\nRefill delays are measured in player turns: mine depots refill after 6, 8, 10, or 12 turns; Power rooms after 8, 10, 12, or 14 turns; Medical rooms after 10, 12, 14, 16, or 18 turns. The delay is randomized each time a room is emptied.\n\nPOWER-UPS\nA Power room gives one random power-up. The inventory limit is 2, and you may activate at most 1 power-up per turn. Activating a power-up consumes it.\n🔎 SCAN — Reveals all active enemy mines across the board for your current turn and your next 3 turns. Scan does not expand normal vision, reveal enemy flags, or reveal an opponent outside your explored territory. Your own mines are always visible without Scan.\n🌀 MINE JAMMER — Creates a 3×3 square centred on your current position. The square follows your position as you move. It lasts for 2 consecutive player turns: the remainder of the turn in which it is activated and the opponent’s next turn. While active, enemy mines inside the square are jammed against you and will not detonate when you step on them. Jammed mines are not removed; they remain on the board and can detonate once they are no longer jammed. The mine lifetime counter continues decreasing normally while a mine is jammed.\n❤️ EXTRA LIFE — Immediately restores 1 life. It cannot raise you above the maximum of 3 lives.\n🛡️ SHIELD — Protects you from the next mine you trigger. The mine is consumed, the Shield is consumed, you lose no life, and your movement still ends. The Shield remains until used.\n⚡ SPEED — Doubles your die-roll movement for the current turn. For example, a roll of 4 gives up to 8 movement points. If activated after rolling, it adds one extra die-roll’s worth of movement to the remaining movement. You may still stop early. Speed expires at the end of your turn.\nPower-up rarity is random: Scan 1/11, Jammer 2/11, Extra Life 2/11, Shield 2/11, and Speed 4/11.\n\nVISION, EXPLORATION, AND HIDDEN INFORMATION\nImmediate vision is the area currently visible around your position: normally up to 2 Manhattan-distance tiles, with walls blocking sight.\n🚩 YOUR FLAGS — Always visible to you.\n⚑ ENEMY FLAGS — Visible only while their tile is inside your immediate vision. They disappear as soon as the tile leaves immediate vision; the explored trail does not reveal them. When an enemy flag overlaps one of your flags, a special combined icon marks the shared tile.\n👤 OPPONENT — Shown at their actual, live position whenever that position is inside your explored territory. This is real-time visibility, not a remembered last-seen location. Their marker moves as they move, even in the fading trail. They are hidden when outside your explored territory.\nROOM STATUS — Shows the actual live stocked/empty state throughout your explored territory, including the fading trail.\nEXPLORED TRAIL — Tiles you have seen remain explored for 3 turns after they were last seen, then return to fog. The trail does not reveal enemy flags. Scan reveals enemy mines only and does not expand vision.\n\nWINNING\nYou win immediately when you capture your opponent’s third flag or reduce their lives to 0. If a player leaves the match, the remaining player wins by forfeit.\n\nQUICK STRATEGY\nExplore rooms to collect resources, use mines to protect routes, use Scan to locate enemy traps, use Jammer to cross mined areas safely, and save Shield for a dangerous mine. Remember: flags require immediate vision, while opponents and live room stock remain visible throughout your explored trail.",
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
    guide: "GOAL: Be the last player alive. Everyone secretly chooses one action each round. Actions resolve together only after every living player has submitted.\n\n1. RELOAD: Gain 1 bullet if no bullets hit you this round. You start with 0 bullets, so reloading is how you get ammunition. If you are hit while reloading, you are eliminated and gain no bullet.\n\n2. SHOOT: Spend bullets you already have to shoot one or more different living opponents. Choose how many bullets to send to each target; the total cannot exceed your ammunition. You cannot target yourself. Every bullet sent counts toward that target's incoming total. A target who shoots is still eliminated if any bullets hit them.\n\n3. SHIELD: Predict the exact total number of bullets that will hit you this round and enter that number as your shield strength (1–10). If no bullets are incoming, you survive regardless of the chosen shield strength. If bullets are incoming, your shield strength must match the exact incoming total or you are eliminated. Shielding does not use ammunition.\n\nROUND RESOLUTION: Actions are hidden while players choose. When all living players have submitted, all shots are counted, then eliminations and successful reloads are resolved together. Eliminated players cannot take further actions. The next round begins with the remaining players.\n\nWINNING: The last surviving player wins. If every remaining player is eliminated in the same round, the match ends in a draw. Think carefully: reload to build ammunition, shoot to eliminate opponents, or shield when you can predict the exact number of incoming bullets.",
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
    guide: "GOAL: Earn the highest individual score, one clue at a time. Each round gives every player one clue-giver turn.\n\nCLUE-GIVER: The game randomly selects two ends from a bank of 500 spectrum pairs and secretly randomizes a target from 0–100. You can see the target marker; the other players cannot. Write a clue that helps the group find the target. The target stays hidden from guessers until all guesses are locked.\n\nGUESSERS: The spectrum and clue are shown to everyone. Discuss them together, then place your own guess. Your guess locks when submitted.\n\nSCORING: Guessers earn 4 points for distance 0–5, 3 for 6–12, 2 for 13–20, 1 for 21–30, and 0 for 31+. The clue-giver earns points using the distance between the target and the average of all guesses. Scores are individual.\n\nAFTER EVERY PLAYER HAS GIVEN A CLUE: Everyone chooses the same option: Continue to the next round (keep scores) or Restart (reset scores and begin with the first clue-giver).",
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
  {
    id: 'decrypto',
    name: 'Decrypto',
    description: 'Give three clues, decode your team’s secret code, and intercept the other team’s.',
    guide: "GOAL: Two teams compete to communicate secret three-digit codes without letting the opponents intercept them.\n\nTEAMS: Choose Blue or Red. Teams may be uneven, but each needs at least two players. Each team has four numbered secret words.\n\nEACH ROUND: One clue-giver per team receives a private three-digit code (each digit points to one of their four words) and gives three clues in order. Teammates use their four words and the clues to decode the code. The opposing team studies the clues and tries to intercept it.\n\nSCORING: A successful interception earns an interception token. A team that fails to decode its own code earns a miscommunication token. Two interceptions win; two miscommunications lose. Codes and secret words are private to their team.",
    emoji: '🔐',
    color: '#dce8ff',
    status: 'ready',
    path: './src/games/decrypto/index.html',
    entryMode: 'party',
    players: { min: 4, max: 8 },
    interactionModel: 'simultaneous',
    lateJoinPolicy: 'spectate',
    spectators: { supported: true },
  },
  {
    id: 'minefield',
    name: 'Minefield (Beta)',
    description: 'A tactical 20×20 treasure hunt: plant mines, find hidden flags, and outsmart your rival.',
    guide: "MINEFIELD · BETA\n\nGOAL: Capture all three enemy flags or reduce your opponent to zero lives. Each player starts with 2 lives.\n\nSETUP: Secretly place three flags on valid open floor tiles, outside walls, rooms, occupied flag tiles, and both protected bases. Enemy flags are visible only while their tile is inside your immediate vision. Opponents themselves are visible in real time at their actual current position whenever they are inside your explored territory, including the fading three-turn trail.\n\nYOUR TURN: Roll the die, then move one tile at a time up to the rolled number. You may stop early. You may place one mine on an adjacent valid tile and activate one power-up during the same turn. Finish with End turn.\n\nMINES 💣: Mine depots ⛏️ grant 1–4 mines (1 and 2 are more common). There is no cap on carried mines or active placed mines. You may place one mine per turn. Your own mines are always visible; enemy mines are visible while Scan 🔎 is active. A mine costs one life and stops movement. The number on a visible mine is its remaining lifetime; mines expire after six player turns.\n\nROOMS: ⛏️ Mine depot gives mines; ✨ Power room gives a random power-up; 🏥 Medical room restores one life (up to 3). Stocked rooms use these icons. Empty rooms use ▫️ (mine depot), ◇ (power room), and ▱ (medical room). Room stock status is remembered for up to 3 turns while a room remains in your explored territory; after that, its status is hidden until you see it again.\n\nPOWER-UPS: 🔎 Scan reveals enemy mines across the map for your current turn and your next 3 turns. 🌀 Mine Jammer creates a 3×3 field centred on you that follows your movement for 2 turns. It temporarily jams enemy mines inside the field; mines are not destroyed. ❤️ Extra Life restores one life. 🛡️ Shield blocks one mine. ⚡ Speed doubles your die-roll movement.\n\nVISION & MAP: Normal vision extends 2 tiles in Manhattan distance. 🟫 Walls block movement and line of sight. Newly seen tiles enter your explored territory; explored tiles fade and disappear after 3 turns. Enemy flags are visible throughout that explored territory. The map is a randomized mirrored 20×20 board with connected routes.",
    emoji: '💣',
    color: '#f5d9b9',
    status: 'ready',
    path: './src/games/minefield/index.html',
    entryMode: 'party',
    players: { min: 2, max: 2 },
    interactionModel: 'turn-based',
    lateJoinPolicy: 'wait',
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
