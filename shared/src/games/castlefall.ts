import type { SerializedPlayer } from "../player";
import { Player, PlayerStatus } from "../player";
import type {
	GameAction,
	GameActionContext,
	GameActionResult,
	GameDefinition,
	GameView,
	PlayerSeatView,
	PublicHintVote,
	RevealedTeamView,
	ScoreUpdate,
} from "../game-core";

export const CASTLEFALL_GAME_ID = "castlefall";

type CastlefallPhase = "finished" | "playing";
type CastlefallTeamId = "A" | "B";
type DeclarationStatus = "pending" | "resolved";

interface CastlefallAssignment {
	playerId: string;
	playerName: string;
	teamId: CastlefallTeamId;
	word: string;
	wordOptions: string[];
}

export interface CastlefallHint {
	id: string;
	playerId: string;
	playerName: string;
	text: string;
	createdAt: number;
	votes: Record<string, PublicHintVote>;
}

export interface CastlefallDeclaration {
	id: string;
	kind: "team" | "word";
	playerId: string;
	playerName: string;
	text: string;
	status: DeclarationStatus;
	createdAt: number;
	endsAt?: number;
	targetPlayerIds?: string[];
	wordGuess?: string;
	success?: boolean;
	resultText?: string;
}

export interface CastlefallRevealedAssignment {
	playerId: string;
	playerName: string;
	teamId: CastlefallTeamId;
	word: string;
}

export interface SerializedCastlefallGame {
	phase: CastlefallPhase;
	currentIndex: number;
	players: SerializedPlayer[];
	hints: CastlefallHint[];
	declarations: CastlefallDeclaration[];
	pendingTeamDeclarationId?: string;
	roundMessage: string;
	viewerWord?: string;
	viewerWordOptions?: string[];
	revealedAssignments?: CastlefallRevealedAssignment[];
}

const WORD_OPTION_COUNT = 18;
const MAX_HINTS = 40;
const MAX_HINT_LENGTH = 160;
const MAX_DECLARATION_LENGTH = 240;
const TEAM_DECLARATION_WINDOW_MS = 60_000;
const DEFAULT_ROUND_MESSAGE =
	"Two hidden teams share two secret words from the same list.";

const WORD_STARTS = [
	"br",
	"cl",
	"dr",
	"f",
	"gl",
	"h",
	"j",
	"k",
	"l",
	"m",
	"n",
	"p",
	"qu",
	"r",
	"s",
	"t",
	"v",
	"w",
	"z",
];
const WORD_VOWELS = ["a", "e", "i", "o", "u", "ae", "ia", "oo"];
const WORD_ENDS = [
	"b",
	"ck",
	"d",
	"f",
	"g",
	"l",
	"m",
	"n",
	"p",
	"r",
	"s",
	"t",
	"th",
	"v",
	"x",
];

export class CastlefallGame {
	phase: CastlefallPhase = "finished";
	currentIndex = 0;
	players: Player[] = [];
	assignments: CastlefallAssignment[] = [];
	hints: CastlefallHint[] = [];
	declarations: CastlefallDeclaration[] = [];
	pendingTeamDeclarationId: string | undefined;
	roundMessage = DEFAULT_ROUND_MESSAGE;
	viewerWord: string | undefined;
	viewerWordOptions: string[] = [];

	serialize(viewerId?: string): SerializedCastlefallGame {
		const viewerAssignment = this.assignments.find(
			(assignment) => assignment.playerId === viewerId,
		);

		return {
			phase: this.phase,
			currentIndex: this.currentIndex,
			players: this.players.map((player) => player.serialize(viewerId)),
			hints: this.hints,
			declarations: this.declarations,
			pendingTeamDeclarationId: this.pendingTeamDeclarationId,
			roundMessage: this.roundMessage,
			viewerWord:
				this.phase === "playing" ? viewerAssignment?.word : undefined,
			viewerWordOptions:
				this.phase === "playing"
					? viewerAssignment?.wordOptions ?? []
					: undefined,
			revealedAssignments:
				this.phase === "finished" && this.assignments.length > 0
					? this.assignments.map(({ wordOptions, ...assignment }) => assignment)
					: undefined,
		};
	}

	static deserialize(data: SerializedCastlefallGame): CastlefallGame {
		const game = new CastlefallGame();
		game.phase = data.phase ?? "finished";
		game.currentIndex = data.currentIndex ?? 0;
		game.players = (data.players ?? []).map((player) =>
			Player.deserialize(player),
		);
		game.hints = data.hints ?? [];
		game.declarations = data.declarations ?? [];
		game.pendingTeamDeclarationId = data.pendingTeamDeclarationId;
		game.roundMessage = data.roundMessage ?? DEFAULT_ROUND_MESSAGE;
		game.viewerWord = data.viewerWord;
		game.viewerWordOptions = data.viewerWordOptions ?? [];
		game.assignments = (data.revealedAssignments ?? []).map((assignment) => ({
			...assignment,
			wordOptions: [],
		}));
		return game;
	}
}

export const castlefallDefinition: GameDefinition<
	CastlefallGame,
	SerializedCastlefallGame
> = {
	id: CASTLEFALL_GAME_ID,
	title: "Castlefall",
	minPlayers: 3,
	maxPlayers: 10,
	createGame: () => new CastlefallGame(),
	deserialize: (data) => CastlefallGame.deserialize(data),
	serialize: (game, viewerId) => game.serialize(viewerId),
	getView: getCastlefallView,
	canStart: (players) => players.size >= 3 && players.size <= 10,
	startGame,
	endRound,
	handleAction,
};

function startGame(game: CastlefallGame, players: Player[]): void {
	game.players = [...players];
	for (const [index, player] of game.players.entries()) {
		player.index = index;
	}

	const words = generateRoundWords(WORD_OPTION_COUNT);
	const teamWords: Record<CastlefallTeamId, string> = {
		A: words[0],
		B: words[1],
	};
	const teamOrder = shuffled(game.players);
	const teamASize =
		Math.floor(game.players.length / 2) +
		(game.players.length % 2 === 1 && Math.random() < 0.5 ? 1 : 0);

	game.assignments = teamOrder.map((player, index) => {
		const teamId: CastlefallTeamId = index < teamASize ? "A" : "B";
		return {
			playerId: player.id,
			playerName: player.name || "A player",
			teamId,
			word: teamWords[teamId],
			wordOptions: shuffled(words),
		};
	});
	game.hints = [];
	game.declarations = [];
	game.pendingTeamDeclarationId = undefined;
	game.currentIndex = 0;
	game.phase = "playing";
	game.roundMessage = "Give clues, compare hints, and declare when ready.";
}

function endRound(
	game: CastlefallGame,
	players: Map<string, Player>,
): void {
	game.phase = "finished";
	for (const player of [...players.values()]) {
		if (player.status === PlayerStatus.DISCONNECTED) {
			players.delete(player.id);
			continue;
		}

		player.status = PlayerStatus.NOT_READY;
	}

	const remainingPlayerIds = new Set(players.keys());
	game.players = game.players.filter((player) =>
		remainingPlayerIds.has(player.id),
	);
}

function handleAction(
	game: CastlefallGame,
	context: GameActionContext,
	action: GameAction,
): GameActionResult {
	if (game.phase !== "playing") return { error: "Round is not active" };
	if (!game.players.some((player) => player.id === context.player.id))
		return { error: "You are not in this round" };

	switch (action.type) {
		case "submit-hint":
			return submitHint(game, context, action);
		case "vote-hint":
			return voteHint(game, context, action);
		case "declare-team":
			return declareTeam(game, context, action);
		case "finish-team-declaration":
			return finishTeamDeclaration(game, context);
		case "declare-word":
			return declareWord(game, context, action);
		default:
			return { error: "Unknown game action" };
	}
}

function submitHint(
	game: CastlefallGame,
	context: GameActionContext,
	action: GameAction,
): GameActionResult {
	const text = getPayloadString(action.payload, "text", MAX_HINT_LENGTH);
	if (!text) return { error: "Hint cannot be empty" };

	const hint: CastlefallHint = {
		id: `hint-${Date.now()}-${game.hints.length + 1}`,
		playerId: context.player.id,
		playerName: context.player.name || "A player",
		text,
		createdAt: Date.now(),
		votes: {},
	};

	game.hints.push(hint);
	if (game.hints.length > MAX_HINTS) game.hints.shift();
	game.roundMessage = `${hint.playerName} posted a public hint.`;

	return {
		systemMessages: [`${hint.playerName} posted a public hint.`],
	};
}

function voteHint(
	game: CastlefallGame,
	context: GameActionContext,
	action: GameAction,
): GameActionResult {
	const hintId = getPayloadString(action.payload, "hintId", 80);
	const vote = getPayloadVote(action.payload);
	if (!hintId || !vote) return { error: "Invalid hint vote" };

	const hint = game.hints.find((entry) => entry.id === hintId);
	if (!hint) return { error: "Hint not found" };

	if (hint.votes[context.player.id] === vote) delete hint.votes[context.player.id];
	else hint.votes[context.player.id] = vote;

	return {};
}

function declareTeam(
	game: CastlefallGame,
	context: GameActionContext,
	action: GameAction,
): GameActionResult {
	if (getPendingTeamDeclaration(game))
		return { error: "A team declaration is already pending" };

	const declaredText = getPayloadString(
		action.payload,
		"players",
		MAX_DECLARATION_LENGTH,
	);
	if (!declaredText) return { error: "Declare at least one player" };

	const declaredPlayerIds = resolveDeclaredPlayerIds(declaredText, context.players);
	if (declaredPlayerIds.error) return { error: declaredPlayerIds.error };
	if (!declaredPlayerIds.ids.includes(context.player.id))
		return { error: "A team declaration must include yourself" };
	if (!isAllowedTeamDeclarationSize(game, context.player.id, declaredPlayerIds.ids))
		return { error: getTeamDeclarationSizeMessage(game, context.player.id) };

	const now = Date.now();
	const names = declaredPlayerIds.ids.map(
		(playerId) => context.players.get(playerId)?.name || playerId,
	);
	const declaration: CastlefallDeclaration = {
		id: `declaration-${now}-${game.declarations.length + 1}`,
		kind: "team",
		playerId: context.player.id,
		playerName: context.player.name || "A player",
		text: `${context.player.name || "A player"} declared ${names.join(", ")} as a team.`,
		status: "pending",
		createdAt: now,
		endsAt: now + TEAM_DECLARATION_WINDOW_MS,
		targetPlayerIds: declaredPlayerIds.ids,
	};

	game.declarations.push(declaration);
	game.pendingTeamDeclarationId = declaration.id;
	game.roundMessage = `${declaration.playerName} made a team declaration.`;

	return {
		systemMessages: [
			`${declaration.playerName} declared a team. A word declaration can still override it.`,
		],
	};
}

function finishTeamDeclaration(
	game: CastlefallGame,
	context: GameActionContext,
): GameActionResult {
	const declaration = getPendingTeamDeclaration(game);
	if (!declaration) return { error: "No team declaration is pending" };
	if (declaration.playerId !== context.player.id)
		return { error: "Only the declarer can finish this declaration" };

	const declarerAssignment = getAssignment(game, declaration.playerId);
	if (!declarerAssignment) return { error: "Declarer is not in this round" };

	const success = isTeamDeclarationCorrect(
		game,
		declarerAssignment.teamId,
		declaration.targetPlayerIds ?? [],
	);
	const winningTeamId = success
		? declarerAssignment.teamId
		: getOtherTeamId(declarerAssignment.teamId);
	const scoreUpdates = scoreTeam(game, winningTeamId);
	const reason = success
		? `${declaration.playerName}'s team declaration was correct. Team ${winningTeamId} wins.`
		: `${declaration.playerName}'s team declaration was wrong. Team ${winningTeamId} wins.`;

	declaration.status = "resolved";
	declaration.success = success;
	declaration.resultText = reason;
	game.pendingTeamDeclarationId = undefined;
	game.roundMessage = reason;

	return {
		scoreUpdates,
		systemMessages: [reason],
		roundEnded: { reason },
	};
}

function declareWord(
	game: CastlefallGame,
	context: GameActionContext,
	action: GameAction,
): GameActionResult {
	const wordGuess = getPayloadString(action.payload, "word", MAX_DECLARATION_LENGTH);
	if (!wordGuess) return { error: "Word guess cannot be empty" };

	const assignment = getAssignment(game, context.player.id);
	if (!assignment) return { error: "You are not in this round" };

	const otherTeamId = getOtherTeamId(assignment.teamId);
	const otherWord = getTeamWord(game, otherTeamId);
	if (!otherWord) return { error: "Other team word not found" };

	const success = normalizeWord(wordGuess) === normalizeWord(otherWord);
	const winningTeamId = success ? assignment.teamId : otherTeamId;
	const scoreUpdates = scoreTeam(game, winningTeamId);
	const reason = success
		? `${context.player.name || "A player"} correctly declared the other team's word. Team ${winningTeamId} wins.`
		: `${context.player.name || "A player"} declared the wrong word. Team ${winningTeamId} wins.`;

	const now = Date.now();
	game.declarations.push({
		id: `declaration-${now}-${game.declarations.length + 1}`,
		kind: "word",
		playerId: context.player.id,
		playerName: context.player.name || "A player",
		text: `${context.player.name || "A player"} declared "${wordGuess}".`,
		status: "resolved",
		createdAt: now,
		wordGuess,
		success,
		resultText: reason,
	});

	const pending = getPendingTeamDeclaration(game);
	if (pending) {
		pending.status = "resolved";
		pending.resultText = "Overridden by a word declaration.";
	}

	game.pendingTeamDeclarationId = undefined;
	game.roundMessage = reason;

	return {
		scoreUpdates,
		systemMessages: [reason],
		roundEnded: { reason },
	};
}

function getCastlefallView(
	game: CastlefallGame,
	players: Map<string, Player>,
	viewerId?: string,
): GameView {
	const canStart = castlefallDefinition.canStart(players);
	const viewerAssignment = getViewerAssignment(game, viewerId);

	return {
		gameId: CASTLEFALL_GAME_ID,
		title: "Castlefall",
		phaseLabel: game.phase,
		turnLabel: getTurnLabel(game, viewerAssignment, viewerId),
		table: getTableView(game, viewerAssignment, viewerId),
		actions: getActionDescriptors(game, canStart, viewerId),
		infoRows: getInfoRows(game, players, viewerAssignment),
		players: getPlayerSeatViews(game, players, viewerId),
	};
}

function getTurnLabel(
	game: CastlefallGame,
	viewerAssignment: CastlefallAssignment | undefined,
	viewerId?: string,
): string | undefined {
	if (game.phase !== "playing") return undefined;
	if (!viewerId || !viewerAssignment) return "You will join next round.";
	const pending = getPendingTeamDeclaration(game);
	if (pending) return `${pending.playerName}'s team declaration is pending.`;
	return "Castlefall is live.";
}

function getTableView(
	game: CastlefallGame,
	viewerAssignment: CastlefallAssignment | undefined,
	viewerId?: string,
): GameView["table"] {
	const table: GameView["table"] = {
		message: game.roundMessage,
		publicHints: game.hints.map((hint) => getPublicHintView(hint, viewerId)),
		publicDeclarations: game.declarations.map((declaration) => ({
			id: declaration.id,
			kind: declaration.kind,
			playerId: declaration.playerId,
			playerName: declaration.playerName,
			text: declaration.text,
			status: declaration.status,
			resultText: declaration.resultText,
			createdAt: declaration.createdAt,
			endsAt: declaration.endsAt,
		})),
	};

	if (game.phase === "playing" && viewerAssignment) {
		table.secret = { label: "Your word", value: viewerAssignment.word };
		table.wordOptions = viewerAssignment.wordOptions;
	}

	if (game.phase === "finished" && game.assignments.length > 0)
		table.revealedTeams = getRevealedTeams(game);

	return table;
}

function getPublicHintView(hint: CastlefallHint, viewerId?: string) {
	const votes = Object.values(hint.votes);
	return {
		id: hint.id,
		playerId: hint.playerId,
		playerName: hint.playerName,
		text: hint.text,
		agreeCount: votes.filter((vote) => vote === "agree").length,
		disagreeCount: votes.filter((vote) => vote === "disagree").length,
		viewerVote: viewerId ? hint.votes[viewerId] : undefined,
		createdAt: hint.createdAt,
	};
}

function getActionDescriptors(
	game: CastlefallGame,
	canStart: boolean,
	viewerId?: string,
): GameView["actions"] {
	if (game.phase === "finished") {
		return [
			{
				id: "start-round",
				label: canStart ? "Start Round" : "Need 3-10 Players",
				disabled: !canStart,
			},
		];
	}

	if (!viewerId || !game.players.some((player) => player.id === viewerId))
		return [{ id: "wait", label: "Next Round", disabled: true }];

	const pending = getPendingTeamDeclaration(game);
	const actions: GameView["actions"] = [
		{ id: "submit-hint", label: "Public Hint" },
		{
			id: "declare-team",
			label: pending ? "Team Pending" : "Declare Team",
			disabled: !!pending,
		},
		{ id: "declare-word", label: "Declare Word" },
	];

	if (pending?.playerId === viewerId)
		actions.push({
			id: "finish-team-declaration",
			label: "Finish Team Declaration",
		});

	return actions;
}

function getInfoRows(
	game: CastlefallGame,
	players: Map<string, Player>,
	viewerAssignment: CastlefallAssignment | undefined,
): GameView["infoRows"] {
	if (game.phase === "playing") {
		const pending = getPendingTeamDeclaration(game);
		return [
			{
				label: "Your Word",
				value: viewerAssignment?.word ?? "Next round",
			},
			{
				label: "Words",
				value: viewerAssignment
					? String(viewerAssignment.wordOptions.length)
					: "Hidden",
			},
			{ label: "Hints", value: String(game.hints.length) },
			{
				label: "Declaration",
				value: pending ? "Team pending" : "Open",
			},
		];
	}

	return [
		{ label: "Game", value: "Castlefall" },
		{ label: "Players", value: String(players.size) },
		{ label: "Last Round", value: game.assignments.length ? "Revealed" : "None" },
	];
}

function getPlayerSeatViews(
	game: CastlefallGame,
	players: Map<string, Player>,
	viewerId?: string,
): PlayerSeatView[] {
	return [...players.values()].map((player) => {
		const assignment = getAssignment(game, player.id);
		const isInRound = game.players.some((gamePlayer) => gamePlayer.id === player.id);
		const revealRole = game.phase === "finished" && assignment;

		return {
			playerId: player.id,
			name: player.name || "?",
			score: player.score ?? 0,
			seatIndex: player.index,
			isViewer: player.id === viewerId,
			isCurrentTurn: false,
			isInRound,
			roleBadge: revealRole ? assignment.teamId : undefined,
			roleLabel: revealRole
				? `Team ${assignment.teamId}: ${assignment.word}`
				: undefined,
			detail: revealRole
				? assignment.word
				: isInRound
					? "In round"
					: game.players.length > 0
						? "Next round"
						: "",
		};
	});
}

function getViewerAssignment(
	game: CastlefallGame,
	viewerId?: string,
): CastlefallAssignment | undefined {
	if (!viewerId) return undefined;
	const serverAssignment = getAssignment(game, viewerId);
	if (serverAssignment) return serverAssignment;
	if (!game.viewerWord) return undefined;
	return {
		playerId: viewerId,
		playerName: "",
		teamId: "A",
		word: game.viewerWord,
		wordOptions: game.viewerWordOptions,
	};
}

function getAssignment(
	game: CastlefallGame,
	playerId: string,
): CastlefallAssignment | undefined {
	return game.assignments.find((assignment) => assignment.playerId === playerId);
}

function getPendingTeamDeclaration(
	game: CastlefallGame,
): CastlefallDeclaration | undefined {
	return game.declarations.find(
		(declaration) =>
			declaration.id === game.pendingTeamDeclarationId &&
			declaration.kind === "team" &&
			declaration.status === "pending",
	);
}

function resolveDeclaredPlayerIds(
	text: string,
	players: Map<string, Player>,
): { ids: string[]; error?: string } {
	const tokens = text
		.split(",")
		.map((token) => token.trim())
		.filter(Boolean);
	if (tokens.length === 0) return { ids: [], error: "Declare at least one player" };

	const ids: string[] = [];
	for (const token of tokens) {
		const player = findPlayerByToken(token, players);
		if (!player) return { ids: [], error: `Unknown player: ${token}` };
		if (!ids.includes(player.id)) ids.push(player.id);
	}

	return { ids };
}

function findPlayerByToken(
	token: string,
	players: Map<string, Player>,
): Player | undefined {
	const normalized = normalizeName(token);
	return [...players.values()].find(
		(player) =>
			normalizeName(player.name) === normalized ||
			normalizeName(player.id) === normalized,
	);
}

function isAllowedTeamDeclarationSize(
	game: CastlefallGame,
	declarerId: string,
	declaredIds: string[],
): boolean {
	const playerCount = game.players.length;
	const teamSize = getTeamSize(game, declarerId);
	if (teamSize === 0) return false;

	if (playerCount <= 6) return declaredIds.length === teamSize;
	if (playerCount === 7) return declaredIds.length === 3 || declaredIds.length === teamSize;
	if (playerCount === 8) return declaredIds.length === 3;
	if (playerCount === 9) return declaredIds.length === 4 || declaredIds.length === 5;
	if (playerCount === 10) return declaredIds.length === 4;

	return declaredIds.length === teamSize;
}

function getTeamDeclarationSizeMessage(
	game: CastlefallGame,
	declarerId: string,
): string {
	const playerCount = game.players.length;
	const teamSize = getTeamSize(game, declarerId);
	if (playerCount <= 6) return `Declare exactly ${teamSize} players`;
	if (playerCount === 7) return `Declare 3 players, or exactly ${teamSize}`;
	if (playerCount === 9) return "Declare 4 players, or 5 with at least 4 teammates";
	return "Declare the Castlefall team size for this player count";
}

function getTeamSize(game: CastlefallGame, playerId: string): number {
	const assignment = getAssignment(game, playerId);
	if (!assignment) return 0;
	return game.assignments.filter(
		(entry) => entry.teamId === assignment.teamId,
	).length;
}

function isTeamDeclarationCorrect(
	game: CastlefallGame,
	teamId: CastlefallTeamId,
	declaredIds: string[],
): boolean {
	const sameTeamCount = declaredIds.filter(
		(playerId) => getAssignment(game, playerId)?.teamId === teamId,
	).length;

	if (game.players.length === 9 && declaredIds.length === 5)
		return sameTeamCount >= 4;

	return sameTeamCount === declaredIds.length;
}

function getTeamWord(
	game: CastlefallGame,
	teamId: CastlefallTeamId,
): string | undefined {
	return game.assignments.find((assignment) => assignment.teamId === teamId)?.word;
}

function getOtherTeamId(teamId: CastlefallTeamId): CastlefallTeamId {
	return teamId === "A" ? "B" : "A";
}

function scoreTeam(
	game: CastlefallGame,
	teamId: CastlefallTeamId,
): ScoreUpdate[] {
	const updates: ScoreUpdate[] = [];
	for (const player of game.players) {
		const assignment = getAssignment(game, player.id);
		if (assignment?.teamId !== teamId) continue;
		player.score += 1;
		updates.push({ playerId: player.id, score: player.score });
	}
	return updates;
}

function getRevealedTeams(game: CastlefallGame): RevealedTeamView[] {
	return (["A", "B"] as CastlefallTeamId[]).map((teamId) => {
		const assignments = game.assignments.filter(
			(assignment) => assignment.teamId === teamId,
		);
		return {
			teamId,
			word: assignments[0]?.word ?? "",
			playerNames: assignments.map((assignment) => assignment.playerName),
		};
	});
}

function getPayloadString(
	payload: unknown,
	key: string,
	maxLength: number,
): string | undefined {
	if (!payload || typeof payload !== "object") return undefined;
	const value = (payload as Record<string, unknown>)[key];
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim().slice(0, maxLength);
	return trimmed.length > 0 ? trimmed : undefined;
}

function getPayloadVote(payload: unknown): PublicHintVote | undefined {
	if (!payload || typeof payload !== "object") return undefined;
	const value = (payload as Record<string, unknown>).vote;
	if (value === "agree" || value === "disagree") return value;
	return undefined;
}

function normalizeName(value: string): string {
	return value.trim().toLowerCase();
}

function normalizeWord(value: string): string {
	return value.trim().toLowerCase();
}

function generateRoundWords(count: number): string[] {
	const words = new Set<string>();
	while (words.size < count) words.add(generateRandomWord());
	return shuffled([...words]);
}

function generateRandomWord(): string {
	const syllableCount = Math.random() < 0.72 ? 2 : 3;
	let word = "";

	for (let index = 0; index < syllableCount; index++) {
		word += randomItem(WORD_STARTS) + randomItem(WORD_VOWELS);
		if (index === syllableCount - 1 || Math.random() < 0.55)
			word += randomItem(WORD_ENDS);
	}

	return word;
}

function randomItem<T>(items: T[]): T {
	return items[Math.floor(Math.random() * items.length)];
}

function shuffled<T>(items: T[]): T[] {
	const result = [...items];
	for (let index = result.length - 1; index > 0; index--) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		[result[index], result[swapIndex]] = [result[swapIndex], result[index]];
	}
	return result;
}
