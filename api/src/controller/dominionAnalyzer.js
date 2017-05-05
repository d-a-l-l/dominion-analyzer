		// TODO test nami ng conflict with fl
const DeckData = require('../assets/DeckData');
const _ = require('underscore');

class DominionAnalyzer {
	parse(gameData) {
		// gameDataObject
		let gdo = {}; //todo private let

		let gameDataLines = gameData.split("\n");

		// populate first line in game field
		gdo.game = gameDataLines[0];	// todo find index

		// search for lines with "Turn 1" and populate players field
		gdo.players = [];
		gdo.playerNameToIndex = {};
		gdo.playerFlToIndex = {};	// TODO why doesn't Map get passed to JSON? is this okay?
		let playerIndex = 0;
		let startsWith = "Turn 1 - ";
		let turn1StartIndex;
		let startsWithBreak = "Turn 2 - ";
		for (let i = 1; i < gameDataLines.length; i++) {
			if (gameDataLines[i].startsWith(startsWith)) {
				if (_.isUndefined(turn1StartIndex)) {
					turn1StartIndex = i;
				}
				let name = gameDataLines[i].substr(startsWith.length).trim();
				gdo.players.push({
					name: name,
					turns: []
				});
				gdo.playerNameToIndex[name] = playerIndex;
				playerIndex++;
			} else if (gameDataLines[i].startsWith(startsWithBreak)) {
				break;
			}
		}

		let fl = [];
		let flPlayerIndex = [];
		let flIndex = 0;
		let hasDuplicates = function(arr) {
			let counts = {};
			arr.forEach(function(x) { counts[x] = (counts[x] || 0)+1; });
			return Object.keys(counts).some(key => counts[key] > 1);
		};
		while (fl.length === 0 || hasDuplicates(fl)) {
			let i = 0;
			for (let playerName in gdo.playerNameToIndex) {
				if (flIndex === 0) {
					fl[i] = playerName[flIndex];
					flPlayerIndex[i] = gdo.playerNameToIndex[playerName];
				} else {
					fl[i] = fl[i] + playerName[flIndex];
				}
				i++;
			}
			flIndex++;
		}
		for (var i = 0; i < fl.length; i++) {
			gdo.playerFlToIndex[fl[i]] = flPlayerIndex[i];
			gdo.players[flPlayerIndex[i]].fl = fl[i];
		}


		// search for 'FirstLetterPlayerName starts with ' for each and add to deck for turn 0
		let getStartingCards = (player) => {
			let _startsWith = player.fl + " starts with ";	// todo what if same fl????
			for (let i = 1; i < gameDataLines.length; i++) {
				if (gameDataLines[i].startsWith(_startsWith)) {
							let startingCards = gameDataLines[i].substr(_startsWith.length);
					player.turns[0] = new DeckObject(0);
					let startingDeck = this.addToDeck(player, 0, startingCards);
				}
			}
		};
		for (let i = 0; i < gdo.players.length; i++) {
			getStartingCards(gdo.players[i]);
		}

		// starting with "Turn 1" line number, copy previous line number deckObject, look for "(x) gains|trashes" in this turn's actions and , adjust deck accordingly, TODO also check VP
		startsWith = "Turn ";
		let activePlayer;
		let turn;
		for (let i = turn1StartIndex; i < gameDataLines.length; i++) {
			let line = gameDataLines[i];
			let regex;
			let match; 

			// if line starts with "Turn " set active player and turn
			regex = /Turn ([0-9]+) - (.+)/g;
			if (line.match(regex)) {	// todo just match regex?
				match = regex.exec(line);
				turn = parseInt(match[1]);
				// todo possession
				let playerName = match[2].trim();
				let possessionIndexOf = playerName.indexOf(" [Possession]");
				if (possessionIndexOf >= 0) {
					playerName = playerName.substring(0, possessionIndexOf-1).trim();
				}
				activePlayer = this.findPlayerByName(gdo, playerName);	//gdo.players[gdo.playerNameToIndex.get(match[2])];
				if (! activePlayer.turns[turn]) {
					activePlayer.turns[turn] = this.copyDeck(activePlayer.turns[turn-1], turn);
				}
			}

			regex = /(^\w+) .* gains (.+)/g;
			if (line.match(regex)) {
				match = regex.exec(line);
				let player = this.findPlayerByFl(gdo, match[1]);
				this.addToDeck(player, turn, match[2]);
			}

			regex = /(^\w+) .* trashes (.+)/g;
			if (line.match(regex)) {
				match = regex.exec(line);
				let player = this.findPlayerByFl(gdo, match[1]);
				this.removeFromDeck(player, turn, match[2])
			}
		}

		return gdo;
	}

	addToDeck(player, deckIndex, cardStr) {
		return this.addRemoveFromDeck('a', player, deckIndex, cardStr);
	}

	removeFromDeck(player, deckIndex, cardStr) {
		return this.addRemoveFromDeck('r', player, deckIndex, cardStr);
	}

	addRemoveFromDeck(addOrRemove, player, deckIndex, cardStr) {
		let deck = player.turns[deckIndex].cards;
		let mult;
		if (addOrRemove === 'a') {
			mult = 1;	// positive mult for add
		} else {
			mult = -1;	// negative for remove
		}
		let cards = this.parseCardStr(cardStr);
		for (let i = 0; i < cards.length; i++) {
			let card = cards[i];
			if (! deck[card.type]) {
				deck [card.type] = {};
			}
			if (deck[card.type][card.name]) {
				deck[card.type][card.name].count += 1 * mult;
			} else {
				deck[card.type][card.name] = JSON.parse(JSON.stringify(DeckData[card.name]));		// todo why is deepCopy undefined?
				// TODO handle case if card is not found
				deck[card.type][card.name].count = mult ? 1 : 0;
			}
		}
		return deck;
	}

	parseCardStr(cardStr) {
		// strip out word "and " and any punctuation
		cardStr = cardStr.replace(/a |an |\./g, '');

		let cardStrArr = cardStr.split(/,|and /g).map(x => x.trim());
		let ret = [];
		for (let i = 0; i < cardStrArr.length; i++) {
			let count = 1;
			let cardName = cardStrArr[i];

			let regex = /^([0-9]+) (.+)$/g
			if (cardStrArr[i].match(regex)) {
				let match = regex.exec(cardStrArr[i]);
				count = parseInt(match[1]);
				cardName = match[2];
			}
			let card = this.getCardData(cardName);
			while (count--) {
				ret.push(card);
			}
		}
		return ret;
	}

	getCardData(str) {
		let ret;
		str = str.trim();
		if (str.endsWith("s")) {
			ret = this.getCardData(str.slice(0,-1));
			if (ret.type !== 'E') {
				return ret;
			}
		}

		return DeckData[str] ? DeckData[str] : {
			name: str,
			type: 'E'
		};
	}

	findPlayerByName(gdo, name) {
		return gdo.players[gdo.playerNameToIndex[name]];
	}

	findPlayerByFl(gdo, fl) {
		return gdo.players[gdo.playerFlToIndex[fl]];
	}

	copyDeck(deck, index) {
		let ret = new DeckObject(index);
		ret.totalPoints = deck.totalPoints;
		ret.numCards = deck.numCards;
		for (let key in deck.cards) {
			ret.cards[key] = this.deepCopy(deck.cards[key]);
		}
		return ret;
	}

	deepCopy(o) {
		return JSON.parse(JSON.stringify(o));
	}
}

function DeckObject(index) {
	return {
		index: index,
		totalPoints: 0,	// todo track VP - including "gains VP"
		numCards: 0,
		cards: {
			v: {},
			a: {},
			t: {},
			c: {}
		}
	};
}

module.exports = new DominionAnalyzer();



// gameDataObject
/*
// could save hand for each turn in future
{
	game: "Game #1231232, unrated", 
	playerNameToIndex
playerFlToIndex
	players: [	// playerObject
		{
			name: "magicjj",
			turns: [  // deckObject
					{
						victory: {
							estate: 2,
							duchy: 1,
							province: 1,
							curse: 1,
							total: 2	// total with tokens
						},
						attack: {
							x: 1
						}
						treasure: {
							copper: 1,
							gold: 2,
							sivler: 4
						}
					}
				]
			]

		}
	]
		
}



cardDataObject
{
	name: "Smithy",
	type: 'a|v|t',
	subtype: "or", //offensive reactive
}

*/