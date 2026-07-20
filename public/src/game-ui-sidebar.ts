import { getRoomInviteURL } from "./app-paths";
import { escapeHtml } from "./game-ui-utils";
import { gs } from "./session";

const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 520;
const GAME_AREA_MIN_WIDTH = 520;
const RESIZE_KEY_STEP = 16;
const RESIZE_KEY_LARGE_STEP = 40;

let layoutRefreshFrame = 0;
let layoutObserver: ResizeObserver | null = null;

export function updateSidebarRoomCode(): void {
	const codeEl = document.querySelector(
		"#game-room-code",
	) as HTMLButtonElement | null;
	if (!codeEl) return;

	const roomCode = gs.room?.code || "";
	codeEl.textContent = roomCode;
	codeEl.title = roomCode
		? "Click to copy invite link"
		: "No room code available";
	codeEl.classList.toggle("is-clickable", !!roomCode);
	codeEl.disabled = !roomCode;
	codeEl.onclick = roomCode ? () => copyRoomInviteLink(roomCode) : null;
}

export function renderGameInfoUI(): void {
	const gameInfo = document.querySelector("#game-info") as HTMLDivElement;
	if (!gameInfo) return;

	if (!gs.room || !gs.player) {
		gameInfo.innerHTML = "";
		return;
	}

	const rows = gs.room.getGameView(gs.player.id).infoRows;
	if (!rows.length) {
		gameInfo.innerHTML = "";
		return;
	}

	const rowMarkup = rows
		.map(
			(row) => `
				<div class="info-row">
					<span class="info-label">${escapeHtml(row.label)}</span>
					<span class="info-value">${escapeHtml(row.value)}</span>
				</div>
			`,
		)
		.join("");

	gameInfo.innerHTML = `
		<h3 class="sidebar-section-title">Game State</h3>
		${rowMarkup}
	`;
}

export function initSidebarResizer(): void {
	const game = document.querySelector("#game") as HTMLElement | null;
	const resizer = document.querySelector(
		"#sidebar-resizer",
	) as HTMLElement | null;
	if (!game || !resizer) return;

	setSidebarWidth(game, resizer, getSidebarWidth(game));

	resizer.addEventListener("pointerdown", (event: PointerEvent) => {
		if (event.button !== 0) return;

		event.preventDefault();
		resizer.classList.add("is-active");
		document.body.classList.add("is-resizing-sidebar");

		const resize = (moveEvent: PointerEvent): void => {
			setSidebarWidth(
				game,
				resizer,
				moveEvent.clientX - game.getBoundingClientRect().left,
			);
		};

		const stopResize = (): void => {
			resizer.classList.remove("is-active");
			document.body.classList.remove("is-resizing-sidebar");
			document.removeEventListener("pointermove", resize);
			document.removeEventListener("pointerup", stopResize);
			document.removeEventListener("pointercancel", stopResize);
		};

		document.addEventListener("pointermove", resize);
		document.addEventListener("pointerup", stopResize);
		document.addEventListener("pointercancel", stopResize);
		resize(event);
	});

	resizer.addEventListener("keydown", (event: KeyboardEvent) => {
		const step = event.shiftKey ? RESIZE_KEY_LARGE_STEP : RESIZE_KEY_STEP;
		const currentWidth = getSidebarWidth(game);

		if (event.key === "ArrowLeft") {
			event.preventDefault();
			setSidebarWidth(game, resizer, currentWidth - step);
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			setSidebarWidth(game, resizer, currentWidth + step);
		} else if (event.key === "Home") {
			event.preventDefault();
			setSidebarWidth(game, resizer, SIDEBAR_MIN_WIDTH);
		} else if (event.key === "End") {
			event.preventDefault();
			setSidebarWidth(game, resizer, getSidebarMaxWidth());
		}
	});

	window.addEventListener("resize", () => {
		setSidebarWidth(game, resizer, getSidebarWidth(game));
	});
}

export function initLayoutResizeObserver(): void {
	if (layoutObserver) return;

	if ("ResizeObserver" in window) {
		layoutObserver = new ResizeObserver(scheduleLayoutRefresh);

		const tableArea = document.querySelector("#field-area");
		const gameArea = document.querySelector("#game-area");
		if (tableArea) layoutObserver.observe(tableArea);
		if (gameArea) layoutObserver.observe(gameArea);
	}

	window.addEventListener("resize", scheduleLayoutRefresh);
}

function setSidebarWidth(
	game: HTMLElement,
	resizer: HTMLElement,
	width: number,
): void {
	const clampedWidth = clampSidebarWidth(width);
	game.style.setProperty("--sidebar-width", `${clampedWidth}px`);
	resizer.setAttribute("aria-valuemin", String(SIDEBAR_MIN_WIDTH));
	resizer.setAttribute("aria-valuemax", String(getSidebarMaxWidth()));
	resizer.setAttribute("aria-valuenow", String(Math.round(clampedWidth)));
	scheduleLayoutRefresh();
}

function getSidebarWidth(game: HTMLElement): number {
	const width = Number.parseFloat(
		getComputedStyle(game).getPropertyValue("--sidebar-width"),
	);
	return Number.isFinite(width) ? width : SIDEBAR_DEFAULT_WIDTH;
}

function clampSidebarWidth(width: number): number {
	return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), getSidebarMaxWidth());
}

function getSidebarMaxWidth(): number {
	return Math.max(
		SIDEBAR_MIN_WIDTH,
		Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - GAME_AREA_MIN_WIDTH),
	);
}

function scheduleLayoutRefresh(): void {
	if (layoutRefreshFrame) return;

	layoutRefreshFrame = window.requestAnimationFrame(() => {
		layoutRefreshFrame = 0;
	});
}

async function copyRoomInviteLink(roomCode: string): Promise<void> {
	const inviteLink = getRoomInviteURL(roomCode);

	try {
		await globalThis.navigator.clipboard?.writeText(inviteLink);
	} catch {}

	const textarea = document.createElement("textarea");
	textarea.value = inviteLink;
	textarea.setAttribute("readonly", "true");
	textarea.style.position = "fixed";
	textarea.style.top = "-1000px";
	textarea.style.opacity = "0";
	document.body.append(textarea);
	textarea.select();
	document.execCommand("copy");
	textarea.remove();
}
