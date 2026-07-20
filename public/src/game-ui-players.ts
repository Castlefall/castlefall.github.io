import type { Player } from "@shared/player";
import { escapeHtml } from "./game-ui-utils";
import { gs } from "./session";

export function renderPlayerList(): void {
	if (!gs.room) return;

	const playerList = document.querySelector("#player-list");
	if (!playerList) return;

	playerList.innerHTML = "";
	const seatViews = new Map(
		gs.room.getGameView(gs.player.id).players.map((view) => [
			view.playerId,
			view,
		]),
	);
	for (const player of getSortedRoomPlayers()) {
		const div = document.createElement("div");
		div.className = "player-item";

		const roleBadge = seatViews.get(player.id)?.roleBadge;
		const isYou = player.id === gs.player.id;
		const score = player.score ?? 0;

		div.innerHTML = `
			<div class="player-name">${escapeHtml(player.name || "?")}${isYou ? " (You)" : ""}${renderRoleBadge(roleBadge)}</div>
			<div class="score-count">${score}</div>
		`;
		playerList.append(div);
	}
}

function renderRoleBadge(roleBadge?: string): string {
	if (!roleBadge) return "";
	return `<span class="role-indicator">${escapeHtml(roleBadge)}</span>`;
}

function getSortedRoomPlayers(): Player[] {
	if (!gs.room) return [];

	const players = [...gs.room.players.values()];

	return players.sort((a, b) => {
		const aHasIndex = a.index !== undefined;
		const bHasIndex = b.index !== undefined;
		if (aHasIndex || bHasIndex) {
			if (!aHasIndex) return 1;
			if (!bHasIndex) return -1;
			if (a.index !== b.index) return (a.index ?? 0) - (b.index ?? 0);
		}

		return (a.name || a.id).localeCompare(b.name || b.id);
	});
}
