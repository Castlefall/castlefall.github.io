import { Player, type PlayerStatus } from "@shared/player";
import { Room, RoomStatus, type SerializedRoom } from "@shared/room";
import { updateUIAllChat, updateUIPushChat } from "./game-ui-chat";
import { gs } from "./session";
import {
	endGameUI,
	showRoomElements,
	startGameUI,
	updateUIGame,
	updateUIPlayerList,
} from "./game-ui-utils";
import { updateURL } from "./url";

export function initGameSocket(): void {
	gs.socket.on("sent-player", (name: string) => {
		gs.player.name = name;
	});

	gs.socket.on("joined-room", (raw: SerializedRoom) => {
		applyRoomSnapshot(raw, true);
	});

	gs.socket.on("game-updated", (raw: SerializedRoom) => {
		applyRoomSnapshot(raw, false);
	});

	gs.socket.on("p-joined-room", (id: string, name: string) => {
		if (id === gs.player.id) return;
		gs.room.addPlayer(new Player(id, name));
		updateUIGame();
	});

	gs.socket.on("p-left-room", (id: string) => {
		gs.room.removePlayer(id);
		updateUIGame();
	});

	gs.socket.on("p-set-status", (id: string, status: PlayerStatus) => {
		const player = gs.room.getPlayer(id);
		if (!player) return;
		player.status = status;
		updateUIGame();
	});

	gs.socket.on("game-event", () => {
		// Snapshots carry the authoritative state; events are available for future effects.
	});

	gs.socket.on("p-score-updated", (id: string, score: number) => {
		applyScoreUpdate(id, score);
		updateUIPlayerList();
		updateUIGame();
	});

	gs.socket.on("ended-room", (reason: string) => {
		gs.room.endRoom();
		endGameUI();
		updateUIPushChat({
			id: "server",
			message: reason,
		});
	});

	gs.socket.on("p-sent-chat", (id: string, message: string) => {
		gs.room.chat.push(id, message);
		updateUIPushChat({ id, message });
	});
}

function applyRoomSnapshot(raw: SerializedRoom, resetLifecycle: boolean): void {
	const room = Room.deserialize(raw);
	updateURL(room.code);

	gs.room = room;
	gs.player = room.players.get(gs.player.id) ?? gs.player;
	if (resetLifecycle) showRoomElements();
	updateUIPlayerList();
	updateUIAllChat();

	if (!resetLifecycle) {
		syncRoomPlayersFromGame();
		updateUIGame();
		return;
	}

	if (room.status === RoomStatus.PLAYING) startGameUI();
	else endGameUI();
}

function applyScoreUpdate(id: string, score: number): void {
	const roomPlayer = gs.room.players.get(id);
	if (roomPlayer) roomPlayer.score = score;

	const gamePlayer = gs.room.game.players.find((player) => player.id === id);
	if (gamePlayer) gamePlayer.score = score;

	if (gs.player.id === id) gs.player.score = score;
}

function syncRoomPlayersFromGame(): void {
	for (const gamePlayer of gs.room.game.players) {
		const roomPlayer = gs.room.players.get(gamePlayer.id);
		if (!roomPlayer) continue;

		roomPlayer.score = gamePlayer.score;
		roomPlayer.status = gamePlayer.status;
		roomPlayer.index = gamePlayer.index;
	}
}
