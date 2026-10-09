import { pipTotal } from './tiles.js';

export function calcRoundScore(gameState, winningSeat, mode) {
  const scores = {};
  for (let i = 0; i < gameState.seats; i++) {
    scores[i] = 0;
  }
  let winnerScore = 0;

  if (mode === "2v2") {
    // winningSeat could be seat index (0-3)
    const winningTeam = (winningSeat === 0 || winningSeat === 2) ? [0, 2] : [1, 3];
    const losingTeam = winningTeam[0] === 0 ? [1, 3] : [0, 2];
    
    // sum of both opposing team players' pip totals
    const points = pipTotal(gameState.tiles[losingTeam[0]]) + pipTotal(gameState.tiles[losingTeam[1]]);
    winnerScore = points;
    scores[winningTeam[0]] = points;
    scores[winningTeam[1]] = points; // Tracked as team score anyway
  } else if (mode === "locked_2v2") {
    // 2v2 locked tiebreaker
    let lowestSeat = -1;
    let lowestPip = Infinity;
    for (let i = 0; i < gameState.seats; i++) {
       const pips = pipTotal(gameState.tiles[i]);
       if (pips < lowestPip) {
         lowestPip = pips;
         lowestSeat = i;
       }
    }
    const winningTeam = (lowestSeat === 0 || lowestSeat === 2) ? [0, 2] : [1, 3];
    const losingTeam = winningTeam[0] === 0 ? [1, 3] : [0, 2];
    
    const points = pipTotal(gameState.tiles[losingTeam[0]]) + pipTotal(gameState.tiles[losingTeam[1]]);
    winnerScore = points;
    scores[winningTeam[0]] = points;
    scores[winningTeam[1]] = points;
  } else {
    // FFA modes (1v1, 1v1v1, 1v1v1v1)
    if (mode === "locked") {
      let lowestSeat = -1;
      let lowestPip = Infinity;
      for (let i = 0; i < gameState.seats; i++) {
        const pips = pipTotal(gameState.tiles[i]);
        if (pips < lowestPip) {
          lowestPip = pips;
          lowestSeat = i;
        }
      }
      winningSeat = lowestSeat;
    }
    
    for (let i = 0; i < gameState.seats; i++) {
      if (i !== winningSeat) {
        winnerScore += pipTotal(gameState.tiles[i]);
      }
    }
    scores[winningSeat] = winnerScore;
  }

  return { scores, winnerScore, finalWinningSeat: winningSeat };
}

export function addToCumulative(cumulativeScores, roundScores, mode) {
  const newCumulative = { ...cumulativeScores };
  if (mode === "2v2") {
     // team 0-2 and team 1-3
     newCumulative["0-2"] = (newCumulative["0-2"] || 0) + (roundScores[0] || 0);
     newCumulative["1-3"] = (newCumulative["1-3"] || 0) + (roundScores[1] || 0);
  } else {
     for (const seat in roundScores) {
        newCumulative[seat] = (newCumulative[seat] || 0) + roundScores[seat];
     }
  }
  return newCumulative;
}

export function checkGameOver(cumulativeScores, targetScore, mode) {
  if (mode === "2v2") {
    if (cumulativeScores["0-2"] >= targetScore) return "Team 1";
    if (cumulativeScores["1-3"] >= targetScore) return "Team 2";
  } else {
    for (const seat in cumulativeScores) {
      if (cumulativeScores[seat] >= targetScore) return parseInt(seat);
    }
  }
  return null;
}
