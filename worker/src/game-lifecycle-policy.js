/**
 * Pure policy helpers for the shared multiplayer game lifecycle.
 * Kept separate from the Durable Object so the rules can be regression-tested in Node.
 */
export function rematchChoicesFor(game) {
  return Array.isArray(game?.rematchChoices) && game.rematchChoices.length
    ? game.rematchChoices
    : ["replay"];
}

export function normalizeRematchChoice(game, body) {
  const replayChoices = rematchChoicesFor(game);
  let choice = body?.choice;
  if (typeof body?.playAgain === "boolean") {
    choice = body.playAgain
      ? (game?.defaultRematchChoice || replayChoices[0] || "replay")
      : "lobby";
  }
  if (choice === "replay" && !replayChoices.includes("replay")) {
    choice = game?.defaultRematchChoice || replayChoices[0];
  } else if ((choice === "continue" || choice === "restart")
    && !replayChoices.includes(choice) && replayChoices.includes("replay")) {
    choice = "replay";
  }
  return choice;
}

export function canEndGameForEveryone(player) {
  return player?.isHost === true;
}
