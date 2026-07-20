import { renderActionButtons } from "./game-ui-actions";
import {
	renderTableMessage,
	renderTurnBanner,
} from "./game-ui-notifications";
import { renderPlayerList } from "./game-ui-players";
import {
	renderGameInfoUI,
	updateSidebarRoomCode,
} from "./game-ui-sidebar";
import { gs } from "./session";

export function showRoomElements(): void {
	for (const screen of document.querySelectorAll(".screen"))
		screen.classList.add("hidden");

	const gameScreen = document.querySelector("#game") as HTMLDivElement;
	gameScreen.classList.remove("hidden");

	updateSidebarRoomCode();
	clearGameArea();
}

export function updateUIPlayerList(): void {
	renderPlayerList();
}

export function updateUIGame(): void {
	if (!gs.room || !gs.player) return;

	updateUIPlayerList();
	renderActionButtons();
	renderTurnBanner();
	renderTableMessage();
	renderGameInfoUI();
}

export function startGameUI(): void {
	updateUIGame();
}

export function endGameUI(): void {
	updateUIGame();
}

export function clearGameArea(): void {
	const actionArea = document.querySelector("#action-buttons");
	if (actionArea) actionArea.innerHTML = "";

	const banner = document.querySelector("#turn-banner") as HTMLElement;
	if (banner) banner.style.display = "none";

	const msg = document.querySelector("#table-container") as HTMLElement;
	if (msg) msg.innerHTML = "";
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function makeBtn(
	label: string,
	className: string,
	onClick: () => void,
): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.className = `btn-white-transparent ${className}`;
	btn.textContent = label;
	btn.addEventListener("click", onClick);
	return btn;
}
