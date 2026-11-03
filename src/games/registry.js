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
    id: 'would-you-rather',
    name: 'Would You Rather',
    description: 'Predict the group split, read your friends, and earn points for knowing the room.',
    guide: "GOAL: Earn the most points by predicting how the group thinks. There are 2–8 players. Each round gives every player exactly one turn as Question Master. When the round ends, use the existing Replay / Continue button to start another round with the same cumulative scores; previous turns remain in the scrollable history.\n\nQUESTION MASTER: Write one Would You Rather question and two distinct options. Use the percentage meter to predict what percentage of the other players will choose Option A. Option B is the remaining percentage. The Question Master does not answer the question.\n\nEVERYONE ELSE: Secretly choose Option A or B. You may also make one optional prediction about which option another answering player will choose. You cannot predict yourself or the Question Master. In a 2-player game there is nobody else eligible to predict, so this part is skipped.\n\nREVEAL & SCORING: Choices and individual predictions stay hidden until every answering player has locked in. The Question Master earns up to 10 points: 10 minus the percentage-point difference between the predicted and actual Option A share, divided by 10 and rounded to the nearest whole point (minimum 0). Each other player earns 3 points for a correct optional prediction, otherwise 0. Skipping a prediction has no penalty. After the reveal, the next player becomes Question Master. The round ends after everyone has been Question Master once. Replay / Continue starts the next round, keeps cumulative scores, and preserves the full scrollable history of questions, choices, predictions, and turn scores.",
    emoji: '🤷',
    color: '#f7dfb5',
    status: 'ready',
    path: './src/games/would-you-rather/index.html',
    entryMode: 'party',
    players: { min: 2, max: 8 },
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
    id: '67',
    name: '67',
    description: 'Change the shared total, outplay your friends, and land exactly on 67.',
    icon: './assets/game-icons/67.jpg?v=1',
    guide: "# 67 — THE 6–7 NUMBER GAME\n\n**Six action cards. Seven cards in your hand. One target: 67.**\n\nThe number 67 is built into every part of the game:\n\n- **Two dice:** a six-sided die (D6) and a seven-sided die (D7).\n- **Starting total:** 6 + 7 = **13**.\n- **Winning total:** **67**.\n- **Maximum total:** 6² + 7² = **85**.\n- **Minimum total:** |6 − 7| = **1**.\n\nThe shared total always stays between **1 and 85**. Play with 2–8 players.\n\n## 1. OBJECTIVE\n\nTake turns changing the shared total. Win by finishing your turn with the total **exactly at 67**. Special cards can disrupt plans, change the rules or give you a way to undo what happened.\n\n## 2. YOUR SEVEN-CARD HAND\n\nEvery player starts with **7 cards total**:\n\n- **6 action cards**, drawn independently from the action-card pool.\n- **1 special card**, drawn separately.\n\nDuplicates are allowed. You are not guaranteed one of each action card: you could, for example, receive three Additions, two Subtractions and one Multiplication.\n\nAction-card rarity follows this order:\n\n- **Most common:** Addition and Subtraction.\n- **Less common:** Multiplication and Division.\n- **Rarest:** Switch, Set Total and Reverse. These three have equal chances.\n\nYour hand is private. Other players cannot see your cards or how many cards you have left.\n\n## 3. THE DICE\n\nEach turn normally rolls both dice:\n\n- **D6:** six sides, results 1–6.\n- **D7:** seven sides, results 1–7.\n\nFor most action cards, choose one of the two results. **Set Total** uses both dice. If Chain Reaction is active, use its recorded pair instead of rolling your own.\n\n## 4. THE SEVEN ACTION CARDS\n\n**1. Addition (+)**  \nAdd one chosen die result to the shared total.  \nExample: 30 + 6 = **36**.\n\n**2. Subtraction (−)**  \nSubtract one chosen die result.  \nExample: 30 − 6 = **24**.\n\n**3. Multiplication (×)**  \nMultiply the shared total by one chosen die result.  \nExample: 8 × 6 = **48**.\n\n**4. Division (÷)**  \nDivide the total by one chosen die result. Drop any remainder (integer division).  \nExamples: 13 ÷ 6 = **2**; 50 ÷ 6 = **8**.\n\n**5. Switch**  \nChoose the tens or ones digit and replace it with one chosen die result.  \nExample: from 45, replacing the tens digit with 6 gives **65**; replacing the ones digit gives **46**. A one-digit total is treated as having a leading zero.\n\n**6. Set Total**  \nUse both dice to build a new two-digit total: D6 gives the tens digit and D7 gives the ones digit.  \nExample: D6 = 6 and D7 = 7 → **67**.\n\n**7. Reverse**  \nSwap the two digits. It does not use a die. A one-digit total is treated as 0X.  \nExamples: 67 → **76**; 7 → **70**; 08 → **80**.\n\n## 5. TOTAL LIMITS\n\nAfter an action, the total is clamped to the range **1–85**:\n\n- A result below 1 becomes **1**.\n- A result above 85 becomes **85**.\n- A result already between 1 and 85 stays unchanged.\n\nExamples: 13 − 6 = 7; 80 + 12 = 92, so the total becomes **85**; 20 × 6 = 120, so the total becomes **85**.\n\nThe limits do not prevent you from choosing an action. They only cap its result.\n\n## 6. THE SIX SPECIAL CARDS\n\nYou hold only one special card at a time. You may play **one action card and one special card in the same turn**. Playing a special card does not use your action card. You can activate your special card at any point during your turn, even after choosing your action, but **before confirming the action**. You cannot play more than one special card in a turn.\n\n**1. Delayed Fate**  \nChoose your action and die as usual, then activate Delayed Fate. The numerical action is stored instead of being applied immediately. It stays available for you to trigger during another player’s turn, at any time before they confirm their action. It then applies to the shared total as it stands at that moment. If you do not trigger it before your next turn begins, it expires and is discarded. It stores the original action before any Glitch transformation.\n\nYou trigger stored Delayed Fate actions individually; each uses the shared total at the moment you trigger it.\n\n**2. Bookmark**  \nSave the current shared total. During another player’s turn, at any time before they confirm their action, you may restore the shared total to the saved value. The other player’s action will then resolve from this restored total when they confirm. You may use the Bookmark during the other players’ turns before your next turn begins, even if you saved it during your own turn. If you do not restore it before your next turn begins, it expires and is discarded. Bookmark saves the number only, not your hand or cards. It is consumed when you restore it.\n\n**3. Chain Reaction**  \nRoll both dice and activate the card. Until your next turn begins, every other player uses your recorded D6 and D7 results instead of rolling their own. A second Chain Reaction cannot replace or stack with the first active one.\n\n**4. Equalizer**  \nEveryone, including you, discards all remaining cards and receives a fresh hand: 6 action cards and 1 special card. Equalizer resets hands only. Other active effects — including Delayed Fate, Bookmark, Chain Reaction, Blind Spot and Glitch — continue.\n\n**5. Blind Spot**  \nUntil your next turn begins, every other player has one randomly selected die result hidden on their turn. They may choose either the visible or hidden die, but must commit to their action and die before the hidden result is revealed. The hidden die is selected independently for each affected player.\n\nOverlapping Blind Spots hide both dice. A player can still choose either die before its result is revealed. The effect expires when its owner’s next turn begins; its owner is not affected by their own Blind Spot. If Chain Reaction is active, players use its recorded dice, and Blind Spot can hide those results too.\n\n**6. Glitch**  \nSecretly choose two different action-card types and swap their identities until your next turn begins. Each card inherits the other card’s complete rules, including whether it needs one die or both. Glitches affecting different pairs can coexist; a later Glitch replaces an earlier one only when it swaps the same pair. The activation stays secret until a changed action is used, when the Glitch owner is revealed.\n\nDelayed Fate stores the original selected action before Glitch changes it.\n\n## 7. TURN ORDER\n\n1. Expire temporary effects belonging to the player whose turn is beginning. Stored Delayed Fate actions do not resolve automatically.\n2. Roll D6 and D7, unless Chain Reaction supplies the dice.\n3. Choose an action card and the required die result(s). Follow any Blind Spot restrictions.\n4. Optionally activate your one special card before confirming.\n5. Confirm the action. The server applies it, resolves relevant effects and updates the shared total.\n6. Other players may use their stored Delayed Fate or Bookmark at any time during your turn before you confirm your action.\n7. Confirming your action closes that interrupt window. If the final total is exactly 67 after the action resolves, you win.\n\n## 8. ROUND HISTORY\n\nThe **At the Table** history keeps every public action and effect for the full round. A round ends after every player has completed one turn. The history then clears for the next round. Private card activations and hidden information are never added to the public history.\n\n## 9. CARD REFILLS\n\nAction cards and special cards are consumed independently.\n\n- Using an action card discards that one card.\n- Using a special card discards that special card.\n- Spending a special card does not immediately give you another one.\n- When all 6 action cards have been used, you receive 6 fresh action cards.\n- If you still have an unused special card, you keep that exact card; it is not replaced.\n- If you have already used your special card and have none left, you receive one random special card during the refill.\n- Equalizer is a separate reset: everyone discards all remaining cards and receives 6 fresh action cards and 1 fresh random special card.\n\nBecause action cards are drawn independently, duplicates can appear in both your starting hand and later refills.\n\n## 10. EFFECT PRIORITIES & INFORMATION\n\n- Delayed Fate actions are triggered individually by their owners; each uses the shared total at the moment it is triggered.\n- Competing digit actions: Set Total → Switch → Reverse.\n- Each Bookmark belongs to its owner and can be used once during an eligible interrupt window.\n- Conflicting Glitches on the same pair: the latest activation replaces the earlier one.\n- Different Glitch pairs can coexist.\n- Overlapping Blind Spots coexist and can hide both dice.\n- Only the first active Chain Reaction applies.\n\n**Private information:** Your action cards, special card, remaining hand and hidden die results are private. Other players never see your hand or its size.\n\n**Public announcements:** Chain Reaction, Blind Spot and Equalizer are announced immediately. Delayed Fate and Bookmark activations remain private until used; their effects are then added to the public action history. Glitch activations remain secret until their effects are revealed.\n\n## 11. WIN\n\nAfter your action and all applicable effects have resolved, if the shared total is **exactly 67**, you win. Reaching 67 temporarily is not enough if the final total changes again before the turn finishes.\n\n**SIX. SEVEN. LAND ON 67.**",
    emoji: '🎲',
    icon: './src/assets/game-icons/67.svg',
    color: '#f6d8b9',
    status: 'beta',
    path: './src/games/67/index.html',
    entryMode: 'party',
    players: { min: 2, max: 8 },
    interactionModel: 'turn-based',
    lateJoinPolicy: 'wait',
    spectators: { supported: true },
  },
  {
    id: 'minefield',
    name: 'Minefield (Beta)',
    description: 'A tactical 20×20 treasure hunt: plant mines, find hidden flags, and outsmart your rival.',
    guide: "MINEFIELD — COMPLETE RULEBOOK\n\nOBJECTIVE\nCapture all 3 of your opponent’s flags, or reduce their lives to 0. Each player starts with 2 lives. The maximum is 3 lives.\n\nTHE BOARD AND BASES\nThe battlefield is a randomized, rotationally mirrored 20×20 grid. Blue starts at (2,2) and Red at (19,19), using 1-based coordinates. Walls block movement and line of sight. Normal vision reaches up to 2 tiles away by Manhattan distance, subject to walls. Each player has a protected base area: tiles within Manhattan distance 3 of either starting position. Flags and mines cannot be placed in either protected base.\n\nSETUP — PLACE YOUR FLAGS\nEach player secretly chooses 3 different open floor tiles. Flags cannot be placed on walls, rooms, or either protected base. Your three flags must be on different tiles, but your flags may overlap the opponent’s flags on the same tile. The opponent cannot see your flag locations during setup. When an enemy flag enters your immediate vision, it is revealed. If it occupies the same tile as one of your own flags, the board shows a special overlapping-flags icon. Capturing an enemy flag removes it from the board and adds one to your captured count.\n\nTURN SEQUENCE\nPlayers alternate turns. On your turn:\n1. Roll the die once (1–6).\n2. Move up to the number of movement points shown, one orthogonally adjacent tile at a time. You cannot move diagonally, through walls, or onto the opponent. You may stop early.\n3. After rolling, you may plant at most one mine and activate at most one power-up at any time before ending your turn. You can activate a power-up even after all movement points are used.\n4. Press End Turn. You must roll before ending your turn, but you do not have to use all your movement.\n\nMINES AND MINE DEPOTS\nA mine depot gives a random number of carried mines: 1 mine (40%), 2 (35%), 3 (15%), or 4 (10%). There is no cap on carried mines or on the number of active mines on the board. You may plant at most one mine per turn on a floor tile orthogonally adjacent to your current position. You cannot plant on walls, rooms, flags, players, your own existing mine, or either protected base. Enemy mines may already occupy the tile: opposing players can unknowingly stack mines on the same tile. Each mine is tracked independently with its own owner and lifetime. When a player steps onto a tile containing mines, one eligible mine detonates; any other mines remain and can trigger later. Each mine expires independently when its own counter reaches 0. Your own mines are always visible to you, including individual expiry counters. Enemy mines are revealed globally while your Scan is active. Stacked enemy mines remain hidden unless Scan reveals them.\nWhen a player steps onto an active mine that is not jammed against that player, the mine is consumed, the player loses 1 life, and their movement ends immediately. If a Shield is active, it is consumed instead of a life; the mine is still consumed and movement still ends. Mines have a lifetime counter starting at 6. The counter decreases by 1 at the end of every player's turn, including the turn in which the mine was planted. A mine disappears when its counter reaches 0. Mine Jammer does not pause, reset, or extend a mine's lifetime.\n\nROOMS AND LIVE ROOM STATUS\n⛏️ Mine depot: grants 1–4 mines using the probabilities above.\n✨ Power room: grants one random power-up if your inventory has fewer than 2 items.\n🏥 Medical room: restores 1 life, up to the maximum of 3.\nYour power-up inventory holds at most 2 items. If it is full, a Power room remains stocked. If you already have 3 lives, a Medical room remains stocked. A room becomes empty only when its reward is successfully collected.\nStocked room icons are ⛏️, ✨, and 🏥. Empty room icons are ▫️, ◇, and ▱ respectively. Room locations and types are marked across the whole map, including outside explored territory: unexplored rooms show their type icon with a ? marker (⛏️?, ✨?, or 🏥?), because their stock status is unknown until explored. Explored rooms show the stocked or empty icon. Room stock status is LIVE throughout your explored territory, including the fading three-turn trail: it shows the actual current stocked/empty state, even when the room is outside immediate vision. It updates when either player collects from a room or it refills. The room and its status are hidden again when the tile leaves your explored territory.\nRefill delays are measured in player turns: mine depots refill after 6, 8, 10, or 12 turns; Power rooms after 8, 10, 12, or 14 turns; Medical rooms after 10, 12, 14, 16, or 18 turns. The delay is randomized each time a room is emptied.\n\nPOWER-UPS\nA Power room gives one random power-up. The inventory limit is 2, and you may activate at most 1 power-up per turn. Activating a power-up consumes it.\n🔎 SCAN — Reveals all active enemy mines across the board for your current turn and your next 3 turns. Scan does not expand normal vision, reveal enemy flags, or reveal an opponent outside your explored territory. Your own mines are always visible without Scan.\n🌀 MINE JAMMER — Creates a 3×3 square centred on your current position. The square follows your position as you move. It lasts for 2 consecutive player turns: the remainder of the turn in which it is activated and the opponent’s next turn. While active, every mine inside the square is jammed, regardless of who planted it, and will not detonate when either player steps on it. The field follows the player who activated it and remains at its last position during the opponent’s turn. Jammed mines are not removed; they remain on the board and can detonate once they are no longer jammed. The mine lifetime counter continues decreasing normally while a mine is jammed.\n🛡️ SHIELD — Protects you from the next mine you trigger. The mine is consumed, the Shield is consumed, you lose no life, and your movement still ends. The Shield remains until used.\n⚡ SPEED — Doubles your die-roll movement for the current turn. For example, a roll of 4 gives up to 8 movement points. If activated after rolling, it adds one extra die-roll’s worth of movement to the remaining movement. You may still stop early. Speed expires at the end of your turn.\nPower-up rarity is random: Scan 2/10 (20%), Jammer 2/10 (20%), Shield 2/10 (20%), and Speed 4/10 (40%).\n\nVISION, EXPLORATION, AND HIDDEN INFORMATION\nImmediate vision is the area currently visible around your position: normally up to 2 Manhattan-distance tiles, with walls blocking sight.\n🚩 YOUR FLAGS — Always visible to you.\n⚑ ENEMY FLAGS — Visible only while their tile is inside your immediate vision. They disappear as soon as the tile leaves immediate vision; the explored trail does not reveal them. When an enemy flag overlaps one of your flags, a special combined icon marks the shared tile.\n👤 OPPONENT — Shown at their actual, live position whenever that position is inside your explored territory. This is real-time visibility, not a remembered last-seen location. Their marker moves as they move, even in the fading trail. They are hidden when outside your explored territory.\nROOM STATUS — Shows the actual live stocked/empty state throughout your explored territory, including the fading trail.\nEXPLORED TRAIL — Tiles you have seen remain explored for 3 turns after they were last seen, then return to fog. The trail does not reveal enemy flags. Scan reveals enemy mines only and does not expand vision.\n\nWINNING\nYou win immediately when you capture your opponent’s third flag or reduce their lives to 0. If a player leaves the match, the remaining player wins by forfeit.\n\nQUICK STRATEGY\nExplore rooms to collect resources, use mines to protect routes, use Scan to locate enemy traps, use Jammer to cross mined areas safely, and save Shield for a dangerous mine. Remember: flags require immediate vision, while opponents and live room stock remain visible throughout your explored trail.",
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
  const availableGames = games.filter((game) => game.status === 'ready' || game.status === 'beta' || game.status === 'coming-soon');
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
    const canOpen = (game.status === 'ready' || game.status === 'beta') && game.path && hasSavedSession && game.entryMode !== 'party';
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
    status.textContent = game.status === 'beta' ? '🧪 Beta · testing stage' : game.status === 'ready' && game.path ? (canOpen ? '▶ Play game' : '✦ Start from a party lobby') : '✦ Coming soon';
    card.append(icon, title, description, status);
    return card;
  }));
}
