import assert from "node:assert/strict";
import { DEFAULT_GAME_ID } from "../dist/shared/game-registry.js";
import { Player } from "../dist/shared/player.js";
import { Room, RoomStatus } from "../dist/shared/room.js";

function addPlayers(room, count) {
	for (let index = 0; index < count; index++) {
		const player = new Player(`p${index + 1}`, `Player ${index + 1}`);
		room.addPlayer(player);
	}
}

assert.equal(DEFAULT_GAME_ID, "castlefall");

const castlefallRoom = new Room("CAST");
addPlayers(castlefallRoom, 6);
assert.equal(castlefallRoom.gameId, "castlefall");
assert.equal(castlefallRoom.tryStartRoom(), true);
assert.equal(castlefallRoom.status, RoomStatus.PLAYING);

const castleP1Snapshot = castlefallRoom.serialize("p1");
const castleP2Snapshot = castlefallRoom.serialize("p2");
assert.equal(castleP1Snapshot.game.gameId, "castlefall");
assert.equal(castleP1Snapshot.game.view.gameId, "castlefall");
assert.equal(typeof castleP1Snapshot.game.state.viewerWord, "string");
assert.equal(castleP1Snapshot.game.state.viewerWordOptions.length, 18);
assert.equal(typeof castleP2Snapshot.game.state.viewerWord, "string");
assert.equal(castleP1Snapshot.game.state.revealedAssignments, undefined);

const hintResult = castlefallRoom.definition.handleAction(
	castlefallRoom.game,
	{ player: castlefallRoom.getPlayer("p1"), players: castlefallRoom.players },
	{ type: "submit-hint", payload: { text: "weather-adjacent" } },
);
assert.equal(hintResult.error, undefined);
assert.equal(castlefallRoom.serialize("p2").game.view.table.publicHints.length, 1);

const hintId = castlefallRoom.game.hints[0].id;
const voteResult = castlefallRoom.definition.handleAction(
	castlefallRoom.game,
	{ player: castlefallRoom.getPlayer("p2"), players: castlefallRoom.players },
	{ type: "vote-hint", payload: { hintId, vote: "agree" } },
);
assert.equal(voteResult.error, undefined);
assert.equal(
	castlefallRoom.serialize("p2").game.view.table.publicHints[0].viewerVote,
	"agree",
);

const p1Assignment = castlefallRoom.game.assignments.find(
	(assignment) => assignment.playerId === "p1",
);
const opposingAssignment = castlefallRoom.game.assignments.find(
	(assignment) => assignment.teamId !== p1Assignment.teamId,
);
const wordDeclaration = castlefallRoom.definition.handleAction(
	castlefallRoom.game,
	{ player: castlefallRoom.getPlayer("p1"), players: castlefallRoom.players },
	{ type: "declare-word", payload: { word: opposingAssignment.word } },
);
assert.equal(wordDeclaration.error, undefined);
assert.equal(typeof wordDeclaration.roundEnded?.reason, "string");
assert.ok(wordDeclaration.scoreUpdates.length >= 1);

console.log("castlefall tests passed");
