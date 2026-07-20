import type { Player } from "./player";

export type GameId = string;

export interface GameAction {
	type: string;
	payload?: unknown;
}

export interface GameEvent {
	type: string;
	payload?: unknown;
}

export interface ScoreUpdate {
	playerId: string;
	score: number;
}

export interface GameActionResult {
	error?: string;
	events?: GameEvent[];
	privateEvents?: Record<string, GameEvent[]>;
	scoreUpdates?: ScoreUpdate[];
	systemMessages?: string[];
	roundEnded?: {
		reason: string;
	};
}

export interface SerializedGameEnvelope<State = unknown> {
	gameId: GameId;
	state: State;
	view: GameView;
}

export interface PlayerSeatView {
	playerId: string;
	name: string;
	score: number;
	seatIndex?: number;
	isViewer: boolean;
	isCurrentTurn: boolean;
	isInRound: boolean;
	roleLabel?: string;
	roleBadge?: string;
	detail?: string;
}

export interface ActionDescriptor {
	id: string;
	label: string;
	disabled?: boolean;
	payload?: unknown;
	className?: string;
}

export interface InfoRow {
	label: string;
	value: string;
}

export type PublicHintVote = "agree" | "disagree";

export interface PublicHintView {
	id: string;
	playerId: string;
	playerName: string;
	text: string;
	agreeCount: number;
	disagreeCount: number;
	viewerVote?: PublicHintVote;
	createdAt: number;
}

export interface PublicDeclarationView {
	id: string;
	kind: "team" | "word";
	playerId: string;
	playerName: string;
	text: string;
	status: "pending" | "resolved";
	resultText?: string;
	createdAt: number;
	endsAt?: number;
}

export interface RevealedTeamView {
	teamId: string;
	word: string;
	playerNames: string[];
}

export interface TableView {
	message?: string;
	secret?: {
		label: string;
		value: string;
	};
	wordOptions?: string[];
	publicHints?: PublicHintView[];
	publicDeclarations?: PublicDeclarationView[];
	revealedTeams?: RevealedTeamView[];
}

export interface GameView {
	gameId: GameId;
	title: string;
	phaseLabel: string;
	turnLabel?: string;
	table: TableView;
	actions: ActionDescriptor[];
	infoRows: InfoRow[];
	players: PlayerSeatView[];
}

export interface GameActionContext {
	player: Player;
	players: Map<string, Player>;
}

export interface GameDefinition<GameState = unknown, SerializedState = unknown> {
	id: GameId;
	title: string;
	minPlayers: number;
	maxPlayers: number;
	testOnly?: boolean;
	createGame(): GameState;
	deserialize(data: SerializedState): GameState;
	serialize(game: GameState, viewerId?: string): SerializedState;
	getView(
		game: GameState,
		players: Map<string, Player>,
		viewerId?: string,
	): GameView;
	canStart(players: Map<string, Player>): boolean;
	startGame(game: GameState, players: Player[]): void;
	endRound(game: GameState, players: Map<string, Player>): void;
	handleAction(
		game: GameState,
		context: GameActionContext,
		action: GameAction,
	): GameActionResult;
}
