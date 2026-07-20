import { Chat } from "./chat";
import type { GameId, GameView, SerializedGameEnvelope } from "./game-core";
import {
	DEFAULT_GAME_ID,
	deserializeGameEnvelope,
	getGameDefinition,
	serializeGameEnvelope,
	type RegisteredGameState,
} from "./game-registry";
import type { SerializedPlayer } from "./player";
import { Player, PlayerStatus } from "./player";

export enum RoomStatus {
	LOBBY = "lobby",
	PLAYING = "playing",
}

export interface RoomListing {
	code: string;
	gameId: GameId;
	numPlayers: number;
}

export interface SerializedRoom {
	code: string;
	gameId: GameId;
	status: RoomStatus;
	game: SerializedGameEnvelope;
	chat: string;
	players: Record<string, SerializedPlayer>;
}

export class Room {
	code: string;
	gameId: GameId;
	players: Map<string, Player>;
	status: RoomStatus;
	game: RegisteredGameState;
	chat: Chat;

	constructor(code: string) {
		this.code = code;
		this.gameId = DEFAULT_GAME_ID;
		this.players = new Map();
		this.status = RoomStatus.LOBBY;
		this.game = getGameDefinition(this.gameId).createGame() as RegisteredGameState;
		this.chat = new Chat();
	}

	get definition() {
		return getGameDefinition(this.gameId);
	}

	serialize(viewerId?: string): SerializedRoom {
		const serializedPlayers: Record<string, SerializedPlayer> = {};
		for (const [id, player] of this.players.entries())
			serializedPlayers[id] = player.serialize(viewerId);

		return {
			code: this.code,
			gameId: this.gameId,
			status: this.status,
			game: serializeGameEnvelope(
				this.gameId,
				this.game,
				this.players,
				viewerId,
			),
			chat: this.chat.serialize(),
			players: serializedPlayers,
		};
	}

	static deserialize(data: SerializedRoom): Room {
		const { gameId, game } = deserializeGameEnvelope(
			data.game,
			data.gameId ?? DEFAULT_GAME_ID,
		);
		const room = new Room(data.code);
		room.status = data.status;
		room.gameId = gameId;
		room.game = game;
		room.chat = Chat.deserialize(data.chat);

		const playersData = data.players;
		for (const [id, playerData] of Object.entries(playersData))
			room.players.set(id, Player.deserialize(playerData));

		return room;
	}

	getRoomListing(): RoomListing {
		return {
			code: this.code,
			gameId: this.gameId,
			numPlayers: this.players.size,
		};
	}

	addPlayer(player: Player): void {
		this.players.set(player.id, player);
	}

	removePlayer(id: string): void {
		this.players.delete(id);
	}

	getPlayer(id: string): Player | undefined {
		return this.players.get(id);
	}

	getHost(): Player | undefined {
		return this.players.values().next().value;
	}

	isHost(id: string): boolean {
		return this.getHost()?.id === id;
	}

	allPlayersDisconnected(): boolean {
		if (this.players.size === 0) return true;
		for (const player of this.players.values())
			if (player.status !== PlayerStatus.DISCONNECTED) return false;

		return true;
	}

	tryStartRoom(): boolean {
		if (this.status !== RoomStatus.LOBBY) return false;
		if (!this.definition.canStart(this.players)) return false;

		this.status = RoomStatus.PLAYING;
		this.definition.startGame(this.game, [...this.players.values()]);

		return true;
	}

	endRoom(): void {
		this.status = RoomStatus.LOBBY;
		this.definition.endRound(this.game, this.players);
	}

	getGameView(viewerId?: string): GameView {
		return this.definition.getView(this.game, this.players, viewerId);
	}
}
