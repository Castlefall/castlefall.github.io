import type {
	PublicHintView,
	PublicHintVote,
	TableView,
} from "@shared/game-core";
import { gs } from "./session";

export function renderTurnBanner(): void {
	const banner = document.querySelector("#turn-banner") as HTMLElement;
	if (!banner) return;

	if (!gs.room || !gs.player) {
		banner.style.display = "none";
		return;
	}

	const view = gs.room.getGameView(gs.player.id);
	if (!view.turnLabel) {
		banner.style.display = "none";
		return;
	}

	banner.textContent = view.turnLabel;
	banner.style.display = "flex";
}

export function renderTableMessage(): void {
	const msg = document.querySelector("#table-container") as HTMLElement;
	if (!msg) return;

	if (!gs.room || !gs.player) {
		msg.textContent = "";
		msg.className = "";
		return;
	}

	const view = gs.room.getGameView(gs.player.id);
	msg.style.display = "flex";

	const hasPublicPanels = hasPublicTablePanels(view.table);
	msg.classList.toggle("castlefall-table", hasPublicPanels);

	if (hasPublicPanels) {
		renderPublicTablePanels(msg, view.table);
		return;
	}

	if (view.table.message) {
		msg.classList.remove("is-empty");
		msg.textContent = view.table.message;
	} else {
		msg.classList.add("is-empty");
		msg.replaceChildren();
	}
}

function hasPublicTablePanels(table: TableView): boolean {
	return Boolean(
		table.secret ||
			table.wordOptions?.length ||
			table.publicHints?.length ||
			table.publicDeclarations?.length ||
			table.revealedTeams?.length,
	);
}

function renderPublicTablePanels(container: HTMLElement, table: TableView): void {
	container.classList.remove("is-empty");
	container.replaceChildren();

	container.append(createBoardHeader(table));

	const board = document.createElement("div");
	board.className = "castlefall-board";

	const wordLane = document.createElement("div");
	wordLane.className = "castlefall-lane castlefall-lane-words";
	if (table.secret || table.wordOptions?.length)
		wordLane.append(createSecretPanel(table));
	if (table.revealedTeams?.length)
		wordLane.append(createRevealedTeamsPanel(table.revealedTeams));

	const activityLane = document.createElement("div");
	activityLane.className = "castlefall-lane castlefall-lane-activity";
	activityLane.append(
		createDeclarationPanel(table.publicDeclarations ?? []),
		createHintPanel(table.publicHints ?? []),
	);

	board.append(wordLane, activityLane);
	container.append(board);
}

function createBoardHeader(table: TableView): HTMLElement {
	const header = document.createElement("div");
	header.className = "castlefall-header";

	const title = document.createElement("div");
	title.className = "castlefall-title";
	title.textContent = "Castlefall";

	const message = document.createElement("div");
	message.className = "castlefall-message";
	message.textContent = table.message || "Find your team. Protect your word.";

	header.append(title, message);
	return header;
}

function createSecretPanel(table: TableView): HTMLElement {
	const section = createPanel("Your Word", "castlefall-panel-secret");

	if (table.secret) {
		const secret = document.createElement("div");
		secret.className = "castlefall-secret";

		const label = document.createElement("span");
		label.className = "castlefall-secret-label";
		label.textContent = table.secret.label;

		const value = document.createElement("strong");
		value.textContent = table.secret.value;

		secret.append(label, value);
		section.append(secret);
	}

	const wordHeader = document.createElement("div");
	wordHeader.className = "castlefall-subtitle";
	wordHeader.textContent = "Possible words";
	section.append(wordHeader);

	const words = document.createElement("div");
	words.className = "castlefall-word-grid";
	for (const word of table.wordOptions ?? []) {
		const chip = document.createElement("span");
		chip.className = "castlefall-word";
		chip.textContent = word;
		words.append(chip);
	}
	section.append(words);

	return section;
}

function createRevealedTeamsPanel(
	teams: NonNullable<TableView["revealedTeams"]>,
): HTMLElement {
	const section = createPanel("Revealed Teams", "castlefall-panel-revealed");
	const list = document.createElement("div");
	list.className = "castlefall-team-list";

	for (const team of teams) {
		const item = document.createElement("div");
		item.className = "castlefall-team";

		const header = document.createElement("div");
		header.className = "castlefall-team-header";
		header.textContent = `Team ${team.teamId}: ${team.word}`;

		const names = document.createElement("div");
		names.className = "castlefall-team-players";
		names.textContent = team.playerNames.join(", ");

		item.append(header, names);
		list.append(item);
	}

	section.append(list);
	return section;
}

function createDeclarationPanel(
	declarations: NonNullable<TableView["publicDeclarations"]>,
): HTMLElement {
	const section = createPanel("Declarations", "castlefall-panel-declarations");
	const list = document.createElement("div");
	list.className = "castlefall-list";

	if (declarations.length === 0) {
		list.append(createEmptyText("No declarations yet."));
	} else {
		for (const declaration of declarations) {
			const item = document.createElement("div");
			item.className = "castlefall-entry";

			const meta = document.createElement("div");
			meta.className = "castlefall-entry-meta";
			meta.textContent = `${declaration.playerName} - ${declaration.kind}`;

			const body = document.createElement("div");
			body.className = "castlefall-entry-text";
			body.textContent = declaration.text;

			item.append(meta, body);
			if (declaration.resultText) {
				const result = document.createElement("div");
				result.className = "castlefall-entry-result";
				result.textContent = declaration.resultText;
				item.append(result);
			} else if (declaration.status === "pending" && declaration.endsAt) {
				const timer = document.createElement("div");
				timer.className = "castlefall-entry-result";
				timer.textContent = `Review until ${formatTime(declaration.endsAt)}.`;
				item.append(timer);
			}

			list.append(item);
		}
	}

	section.append(list);
	return section;
}

function createHintPanel(hints: PublicHintView[]): HTMLElement {
	const section = createPanel("Public Hints", "castlefall-panel-hints");
	const list = document.createElement("div");
	list.className = "castlefall-list";

	if (hints.length === 0) {
		list.append(createEmptyText("No public hints yet."));
	} else {
		for (const hint of hints) list.append(createHintEntry(hint));
	}

	section.append(list);
	return section;
}

function createHintEntry(hint: PublicHintView): HTMLElement {
	const item = document.createElement("div");
	item.className = "castlefall-entry";

	const meta = document.createElement("div");
	meta.className = "castlefall-entry-meta";
	meta.textContent = `${hint.playerName} - ${formatTime(hint.createdAt)}`;

	const body = document.createElement("div");
	body.className = "castlefall-entry-text";
	body.textContent = hint.text;

	const votes = document.createElement("div");
	votes.className = "castlefall-votes";
	votes.append(
		createVoteButton(hint, "agree", "Agree", hint.agreeCount),
		createVoteButton(hint, "disagree", "Disagree", hint.disagreeCount),
	);

	item.append(meta, body, votes);
	return item;
}

function createVoteButton(
	hint: PublicHintView,
	vote: PublicHintVote,
	label: string,
	count: number,
): HTMLButtonElement {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "castlefall-vote";
	button.textContent = `${label} ${count}`;
	button.setAttribute("aria-pressed", String(hint.viewerVote === vote));
	button.addEventListener("click", () => {
		gs.socket.emit("game-action", {
			type: "vote-hint",
			payload: { hintId: hint.id, vote },
		});
	});
	return button;
}

function createPanel(title: string, modifier = ""): HTMLElement {
	const section = document.createElement("section");
	section.className = `castlefall-panel ${modifier}`.trim();

	const heading = document.createElement("h2");
	heading.className = "castlefall-panel-title";
	heading.textContent = title;
	section.append(heading);

	return section;
}

function createEmptyText(text: string): HTMLElement {
	const empty = document.createElement("div");
	empty.className = "castlefall-empty";
	empty.textContent = text;
	return empty;
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
}
