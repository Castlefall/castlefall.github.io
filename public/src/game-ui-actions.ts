import type { ActionDescriptor } from "@shared/game-core";
import { gs } from "./session";
import { makeBtn } from "./game-ui-utils";

export function renderActionButtons(): void {
	const container = document.querySelector("#action-buttons") as HTMLElement;
	if (!container) return;
	container.innerHTML = "";

	if (!gs.room || !gs.player) return;

	const actions = gs.room.getGameView(gs.player.id).actions;
	for (const action of actions) container.append(createActionButton(action));
}

function createActionButton(action: ActionDescriptor): HTMLButtonElement {
	const btn = makeBtn(action.label, action.className ?? "", () => {
		if (runActionDescriptor(action)) renderActionButtons();
	});
	btn.disabled = !!action.disabled;
	return btn;
}

function runActionDescriptor(action: ActionDescriptor): boolean {
	if (action.id === "start-round") {
		gs.socket.emit("game-action", { type: "start-round" });
		return true;
	}
	if (action.id === "submit-hint") return submitCastlefallHint();
	if (action.id === "declare-team") return declareCastlefallTeam();
	if (action.id === "declare-word") return declareCastlefallWord();

	gs.socket.emit("game-action", {
		type: action.id,
		payload: action.payload,
	});
	return true;
}

function submitCastlefallHint(): boolean {
	const text = globalThis.prompt("Public hint");
	if (text === null) return false;

	const trimmed = text.trim();
	if (!trimmed) return false;

	gs.socket.emit("game-action", {
		type: "submit-hint",
		payload: { text: trimmed.slice(0, 160) },
	});
	return true;
}

function declareCastlefallTeam(): boolean {
	const playerNames = [...gs.room.players.values()]
		.map((player) => player.name || player.id)
		.join(", ");
	const response = globalThis.prompt(
		`Declare your team by name, separated by commas.\nPlayers: ${playerNames}`,
		gs.player.name || "",
	);
	if (response === null) return false;

	const players = response.trim();
	if (!players) return false;

	gs.socket.emit("game-action", {
		type: "declare-team",
		payload: { players },
	});
	return true;
}

function declareCastlefallWord(): boolean {
	const wordOptions = getCastlefallWordOptions();
	const response = globalThis.prompt(
		wordOptions.length > 0
			? `Declare the other team's word.\nWords: ${wordOptions.join(", ")}`
			: "Declare the other team's word.",
	);
	if (response === null) return false;

	const word = response.trim();
	if (!word) return false;

	gs.socket.emit("game-action", {
		type: "declare-word",
		payload: { word },
	});
	return true;
}

function getCastlefallWordOptions(): string[] {
	const game = gs.room?.game as { viewerWordOptions?: unknown } | undefined;
	return Array.isArray(game?.viewerWordOptions)
		? game.viewerWordOptions.filter(
				(word): word is string => typeof word === "string",
			)
		: [];
}
