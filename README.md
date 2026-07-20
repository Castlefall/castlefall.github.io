# Castlefall

Castlefall is a multiplayer party word game inspired by Castle of the Devil and Spyfall. Players join the same room, receive a shared list of possible words in a private shuffled order, and secretly split into two teams. Everyone on the same team has the same word; the other team has a different word.

The app is built with Vite, TypeScript, Express, and Socket.IO. The frontend is a static app, and the backend owns the real-time room and round state.

Maintained by @lualum and @GeniusBlobby.

## Rules

1. Join a room with 3 to 10 players.
2. Start a round. Each player privately sees their word and the same set of candidate words in a shuffled order.
3. Talk freely. Give clues that your teammates can recognize without making your word obvious to the other team.
4. Public hints can be posted during the round. Everyone can see them and mark agree or disagree.
5. A player can declare victory by naming a set of players they believe are all on their team. After the declaration window, the declarer can finish the declaration and the app scores the winning team.
6. A player can also declare the other team's word. This immediately ends the round. The declarer's team wins if the word is correct; otherwise the other team wins.
7. Players win or lose together with the team that had their word.

Team declaration sizes follow the common Castlefall defaults:

- 3 to 6 players: declare your exact team.
- 7 players: declare 3 players, or your exact team.
- 8 players: declare 3 players.
- 9 players: declare 4 players, or declare 5 where at least 4 are on your team.
- 10 players: declare 4 players.

## Local Development

Use pnpm, matching the Docker and GitHub Actions setup:

```sh
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install
pnpm run dev
```

Local dev starts both processes:

- Vite frontend: `http://localhost:3000`
- Backend server: `http://localhost:8000`

The Vite dev server proxies `/socket.io` to the backend, while the client can also connect directly to port `8000` when running on the local frontend port.

## Scripts

```sh
pnpm run dev
pnpm run build:pages
pnpm run build:backend
pnpm run build
pnpm run start
pnpm run start:all
pnpm run test:castlefall
```

## Project Layout

```txt
public/       Frontend HTML, TypeScript, styles, and assets
server/       Express and Socket.IO backend
shared/       Shared game, room, player, chat, and Castlefall rules code
scripts/      Build helper scripts
dist/         Generated build output
```

## Configuration Points

- `shared/src/games/castlefall.ts`: Castlefall rules, word assignment, hints, voting, declarations, and scoring.
- `shared/src/game-registry.ts`: Castlefall game registration.
- `public/src/game-ui-actions.ts`: Castlefall hint and declaration prompts.
- `public/src/game-ui-notifications.ts`: public hints, declarations, word list, and team reveal rendering.
- `public/src/session.ts`: Socket.IO backend URL selection.
- `vite.config.ts`: Vite build base, static asset copying, and local Socket.IO proxy.
- `server/src/index.ts`: Express/Socket.IO server, CORS origins, and backend-only production behavior.

## Deployment

The production frontend is hosted at `https://castlefall.github.io/`. Build it for GitHub Pages with:

```sh
pnpm run build:pages
```

The production Socket.IO/API server is hosted at `https://castlefall.duckdns.org/`. The frontend defaults to that backend when it is served from `https://castlefall.github.io/`; for other deployments, set `VITE_BACKEND_URL`.

The backend can be built with `pnpm run build:backend` and run with Docker or `pnpm run start`. In production, allow the GitHub Pages origin:

```sh
FRONTEND_ORIGIN=https://castlefall.github.io
ALLOWED_ORIGINS=https://castlefall.github.io,https://castlefall.duckdns.org
```
