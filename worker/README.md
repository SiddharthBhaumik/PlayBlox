# PlayBlox party service

This Cloudflare Worker is the first backend foundation for PlayBlox. The static site remains on GitHub Pages; this service owns real party rooms.

## Current API

- `GET /api/health` — service status and configured room cap.
- `POST /api/rooms` with `{"hostName":"Rae","partyName":"Friday Fun"}` — create a room and receive its room data plus a private `playerToken`.
- `GET /api/rooms/:CODE` — fetch the public room snapshot.
- `POST /api/rooms/:CODE/join` with `{"nickname":"Sam"}` — join if the room exists and has space; returns a private `playerToken`.
- `POST /api/rooms/:CODE/leave` with `Authorization: Bearer <playerToken>` — leave the room.
- `GET /api/rooms/:CODE/ws?token=<playerToken>` with a WebSocket upgrade — receive room snapshots and player-list updates.

The initial cap is 8 players per room. Room state expires after two hours without activity. The room code is a locator, not an authentication secret; host/player actions must use their private session token. Game rooms track both the original match roster and the current active roster.

## Deploy

1. Install a current Node.js LTS release.
2. From this directory run `npm create cloudflare@latest -- --existing` only if you want Cloudflare's setup wizard; otherwise install Wrangler in this directory with `npm install --save-dev wrangler`.
3. Run `npx wrangler login` and authenticate to your Cloudflare account.
4. Run `npx wrangler dev` to test locally.
5. Run `npx wrangler deploy` to publish the Worker.
6. Copy the deployed `workers.dev` URL. The GitHub Pages frontend will need that URL as its API base before real party creation/joining can be enabled.

## Important

- This is an initial backend foundation, not yet connected to the live GitHub Pages UI.
- Game rules and state are server-authoritative in `src/games/`. Never trust client-submitted scores or winners.
- Every game module must declare `players.min` and implement `onPlayerLeave(context, state, playerId)`. Return a valid state with the departed player removed from `playerOrder`, or `null` if the game cannot continue. The shared lifecycle calls this for voluntary game leave, party leave, host kick, and reconnect-grace expiry.
- Use the updated `playerOrder` / room `activePlayerIds` for every progress counter and simultaneous submission quorum. `originalPlayerIds` is historical only; never use it as the expected live participant count.
- Do not put Cloudflare API tokens, host tokens, or player tokens into source control. Player tokens are returned to the browser and should be treated as private session credentials.
- For production, configure allowed frontend origins explicitly and add rate limiting / abuse protection before sharing the site widely.
