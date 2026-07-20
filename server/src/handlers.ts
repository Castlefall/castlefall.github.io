import type { Server } from "socket.io";
import type { GameAction, GameEvent } from "@shared/game-core";
import { PlayerStatus } from "@shared/player";
import { Room, RoomStatus } from "@shared/room";
import type { GameSocket } from "./index";
import { io, MENU_ROOM, rooms, gameSockets, profiles } from "./index";

const ROOM_CODE_PATTERN = /^[A-Z0-9]{4}$/;
const DISCONNECT_GRACE_MS = 15_000;
const DISCONNECT_GRACE_SECONDS = Math.ceil(DISCONNECT_GRACE_MS / 1000);
const pendingDisconnects = new Map<string, ReturnType<typeof setTimeout>>();

export function setupHandlers(socket: GameSocket): void {
	socket.on("ping", () => {
		socket.emit("pong");
	});

	socket.on("set-name", (name: unknown) => {
		const trimmedName = normalizeName(name);
		if (trimmedName === undefined) return;

		socket.player.name = trimmedName;

		const profile = profiles.get(socket.player.id);
		if (profile) {
			profile.name = trimmedName;
			profile.lastSeen = Date.now();
		}

		const roomPlayer = socket.room?.players.get(socket.player.id);
		if (roomPlayer) roomPlayer.name = trimmedName;
	});

	socket.on("create-room", () => {
		if (isRateLimited(socket, "create-room", 5, 60_000)) {
			socket.emit("error", "Too many rooms created. Please wait.");
			return;
		}

		const code = createRoom();
		if (!code) {
			socket.emit("error", "Room limit reached");
			return;
		}

		joinRoom(socket, io, code);
	});

	socket.on("join-room", (code: unknown) => {
		const roomCode = normalizeRoomCode(code);
		if (!roomCode) {
			socket.emit("error", "Invalid room code");
			return;
		}

		joinRoom(socket, io, roomCode);
	});

	socket.on("disconnect", () => {
		handlePlayerLeave(socket);
	});

	socket.on("game-action", (rawAction: unknown) => {
		handleGameAction(socket, rawAction);
	});

	socket.on("reset-room", () => {
		handleGameAction(socket, { type: "start-round" });
	});

	socket.on("send-chat", (rawMessage: string) => {
		if (!socket.room || typeof rawMessage !== "string") return;
		if (isRateLimited(socket, "send-chat", 8, 10_000)) {
			socket.emit("error", "Chat is sending too quickly.");
			return;
		}

		const message = rawMessage.trim().slice(0, 200);
		if (!message) return;

		socket.room.chat.push(socket.player.id, message);
		io.to(socket.room.code).emit("p-sent-chat", socket.player.id, message);
	});
}

function normalizeName(name: unknown): string | undefined {
	if (typeof name !== "string") return;
	return name.trim().slice(0, 20);
}

function normalizeRoomCode(code: unknown): string | undefined {
	if (typeof code !== "string") return;
	const normalized = code.trim().toUpperCase();
	if (!ROOM_CODE_PATTERN.test(normalized)) return;
	return normalized;
}

function normalizeGameAction(action: unknown): GameAction | undefined {
	if (!action || typeof action !== "object") return;

	const rawAction = action as Partial<GameAction>;
	if (typeof rawAction.type !== "string" || rawAction.type.length === 0)
		return;

	const normalized: GameAction = {
		type: rawAction.type,
		payload: rawAction.payload,
	};

	return normalized;
}

function isRateLimited(
	socket: GameSocket,
	key: string,
	limit: number,
	windowMs: number,
): boolean {
	const now = Date.now();
	const data = socket.data as {
		rateLimits?: Record<string, { count: number; resetAt: number }>;
	};
	data.rateLimits ??= {};

	const current = data.rateLimits[key];
	if (!current || current.resetAt <= now) {
		data.rateLimits[key] = { count: 1, resetAt: now + windowMs };
		return false;
	}

	current.count++;
	return current.count > limit;
}

function broadcastSystemChat(room: Room, message: string): void {
	room.chat.push("server", message);
	io.to(room.code).emit("p-sent-chat", "server", message);
}

function emitGameUpdated(room: Room): void {
	for (const player of room.players.values()) {
		const playerSocket = [...gameSockets.values()].find(
			(s) => s.player.id === player.id,
		);

		if (playerSocket) playerSocket.emit("game-updated", room.serialize(player.id));
	}
}

function emitGameEvents(room: Room, events: GameEvent[] | undefined): void {
	if (!events) return;
	for (const event of events) io.to(room.code).emit("game-event", event);
}

function emitPrivateGameEvents(
	events: Record<string, GameEvent[]> | undefined,
): void {
	if (!events) return;

	for (const [playerId, playerEvents] of Object.entries(events)) {
		const playerSocket = [...gameSockets.values()].find(
			(socket) => socket.player.id === playerId,
		);
		if (!playerSocket) continue;
		for (const event of playerEvents) playerSocket.emit("game-event", event);
	}
}

function handleGameAction(socket: GameSocket, rawAction: unknown): void {
	if (!socket.room) return;

	const action = normalizeGameAction(rawAction);
	if (!action) {
		socket.emit("error", "Invalid game action");
		return;
	}

	if (action.type === "start-round") {
		handleStartRound(socket);
		return;
	}

	if (socket.room.status !== RoomStatus.PLAYING) return;

	const player = socket.room.players.get(socket.player.id) ?? socket.player;
	const result = socket.room.definition.handleAction(
		socket.room.game,
		{
			player,
			players: socket.room.players,
		},
		action,
	);

	if (result.error) {
		socket.emit("error", result.error);
		return;
	}

	for (const message of result.systemMessages ?? [])
		broadcastSystemChat(socket.room, message);

	emitGameEvents(socket.room, result.events);
	emitPrivateGameEvents(result.privateEvents);

	for (const scoreUpdate of result.scoreUpdates ?? []) {
		const roomPlayer = socket.room.players.get(scoreUpdate.playerId);
		if (roomPlayer) roomPlayer.score = scoreUpdate.score;
		io.to(socket.room.code).emit(
			"p-score-updated",
			scoreUpdate.playerId,
			scoreUpdate.score,
		);
	}

	if (result.roundEnded) {
		socket.room.chat.push("server", result.roundEnded.reason);
		io.to(socket.room.code).emit("ended-room", result.roundEnded.reason);
		socket.room.endRoom();
		emitGameUpdated(socket.room);
		return;
	}

	emitGameUpdated(socket.room);
}

function handleStartRound(socket: GameSocket): void {
	const room = socket.room;
	if (!room || room.status !== RoomStatus.LOBBY) return;

	if (!room.tryStartRoom()) {
		socket.emit(
			"error",
			`Need ${room.definition.minPlayers} to ${room.definition.maxPlayers} players`,
		);
		return;
	}

	broadcastSystemChat(room, "Round reset.");
	emitGameUpdated(room);
}

function createRoom(roomCode?: string): string | undefined {
	if (rooms.size >= 10_000) return;
	const code = roomCode || randomCode();
	const room = new Room(code);
	rooms.set(code, room);

	return code;
}

function joinRoom(socket: GameSocket, io: Server, code: string): void {
	const room = rooms.get(code);

	if (!room) {
		socket.emit("error", "Room not found");
		return;
	}

	const playerInRoom = room.players.get(socket.player.id);
	if (playerInRoom) {
		const wasDisconnected =
			playerInRoom.status === PlayerStatus.DISCONNECTED;

		cancelPendingDisconnect(socket.player.id);
		socket.leave(MENU_ROOM);
		socket.join(code);
		socket.room = room;
		socket.player.name = playerInRoom.name;
		playerInRoom.status = PlayerStatus.NOT_READY;
		socket.emit("joined-room", room.serialize(socket.player.id));
		socket
			.to(socket.room.code)
			.emit("p-set-status", socket.player.id, PlayerStatus.NOT_READY);

		if (
			wasDisconnected &&
			room.status === RoomStatus.PLAYING &&
			isActiveGamePlayer(room, socket.player.id)
		) {
			broadcastSystemChat(
				room,
				`${socket.player.name || "A player"} has reconnected.`,
			);
		}
	} else {
		if (room.players.size >= room.definition.maxPlayers) {
			socket.emit("error", "Room is full");
			return;
		}

		socket.leave(MENU_ROOM);
		socket.join(code);
		socket.room = room;
		socket.player.status = PlayerStatus.NOT_READY;
		room.addPlayer(socket.player);
		io.to(socket.room.code).emit(
			"p-joined-room",
			socket.player.id,
			socket.player.name,
		);
		socket.emit("joined-room", room.serialize(socket.player.id));
		if (room.status === RoomStatus.PLAYING) {
			broadcastSystemChat(
				room,
				`${socket.player.name || "A player"} joined and will play next round.`,
			);
		}
	}
}

function handlePlayerLeave(socket: GameSocket): void {
	const room = socket.room;
	if (!room) return;

	socket.leave(room.code);

	if (room.status === RoomStatus.LOBBY) handleLobbyPlayerLeave(socket, room);
	else handleGamePlayerDisconnect(socket, room);

	if (room.status === RoomStatus.LOBBY && shouldDeleteRoom(room))
		deleteRoom(room.code);
}

function handleLobbyPlayerLeave(socket: GameSocket, room: Room): void {
	room.removePlayer(socket.player.id);
	socket.to(room.code).emit("p-left-room", socket.player.id);
}

function handleGamePlayerDisconnect(socket: GameSocket, room: Room): void {
	const player = room.players.get(socket.player.id);
	if (!player) return;

	if (!isActiveGamePlayer(room, socket.player.id)) {
		room.removePlayer(socket.player.id);
		socket.to(room.code).emit("p-left-room", socket.player.id);
		return;
	}

	player.status = PlayerStatus.DISCONNECTED;
	socket
		.to(room.code)
		.emit("p-set-status", socket.player.id, PlayerStatus.DISCONNECTED);
	broadcastSystemChat(
		room,
		`${player.name || "A player"} has disconnected and must come back in ${DISCONNECT_GRACE_SECONDS} seconds.`,
	);
	scheduleDisconnectCleanup(socket.player.id, room.code);
}

function isActiveGamePlayer(room: Room, playerId: string): boolean {
	return room
		.getGameView(playerId)
		.players.some((player) => player.playerId === playerId && player.isInRound);
}

function scheduleDisconnectCleanup(playerId: string, roomCode: string): void {
	cancelPendingDisconnect(playerId);

	pendingDisconnects.set(
		playerId,
		setTimeout(() => {
			pendingDisconnects.delete(playerId);
			const room = rooms.get(roomCode);
			const player = room?.players.get(playerId);
			if (!room || player?.status !== PlayerStatus.DISCONNECTED) return;

			if (room.status === RoomStatus.PLAYING) {
				const reason = `${player.name || "A player"} disconnected. Round ended.`;
				io.to(room.code).emit("ended-room", reason);
				broadcastSystemChat(room, reason);
				room.endRoom();
			} else {
				room.removePlayer(playerId);
				io.to(room.code).emit("p-left-room", playerId);
			}

			if (shouldDeleteRoom(room)) deleteRoom(room.code);
		}, DISCONNECT_GRACE_MS),
	);
}

function cancelPendingDisconnect(playerId: string): void {
	const timeout = pendingDisconnects.get(playerId);
	if (!timeout) return;

	clearTimeout(timeout);
	pendingDisconnects.delete(playerId);
}

function shouldDeleteRoom(room: Room): boolean {
	return room.allPlayersDisconnected();
}

function deleteRoom(roomCode: string): void {
	rooms.delete(roomCode);
}

function randomCode(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let result = "";
	do {
		result = "";
		for (let index = 0; index < 4; index++)
			result += chars.charAt(Math.floor(Math.random() * chars.length));
	} while (rooms.has(result));

	return result;
}
