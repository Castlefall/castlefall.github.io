import type {
	GameDefinition,
	GameId,
	GameView,
	SerializedGameEnvelope,
} from "./game-core";
import {
	CASTLEFALL_GAME_ID,
	castlefallDefinition,
	type CastlefallGame,
	type SerializedCastlefallGame,
} from "./games/castlefall";
import type { Player } from "./player";

export const DEFAULT_GAME_ID = CASTLEFALL_GAME_ID;

export type RegisteredGameId = typeof CASTLEFALL_GAME_ID;
export type RegisteredGameState = CastlefallGame;
export type RegisteredSerializedGame = SerializedCastlefallGame;

export function getGameDefinition(
	_gameId?: GameId,
): GameDefinition<any, any> {
	return castlefallDefinition;
}

export function serializeGameEnvelope(
	_gameId: GameId,
	game: unknown,
	players: Map<string, Player>,
	viewerId?: string,
): SerializedGameEnvelope {
	const definition = getGameDefinition(DEFAULT_GAME_ID);
	return {
		gameId: definition.id,
		state: definition.serialize(game, viewerId),
		view: definition.getView(game, players, viewerId),
	};
}

export function deserializeGameEnvelope(
	envelope: SerializedGameEnvelope | RegisteredSerializedGame,
	_fallbackGameId: GameId = DEFAULT_GAME_ID,
): { gameId: GameId; game: RegisteredGameState; view?: GameView } {
	const isEnvelope =
		envelope &&
		typeof envelope === "object" &&
		"gameId" in envelope &&
		"state" in envelope;
	const definition = getGameDefinition(DEFAULT_GAME_ID);
	const state = isEnvelope ? envelope.state : envelope;

	return {
		gameId: definition.id,
		game: definition.deserialize(state) as RegisteredGameState,
		view: isEnvelope ? envelope.view : undefined,
	};
}
