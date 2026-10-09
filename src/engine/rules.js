export function getOpenEnds(chain) {
  if (!chain || chain.length === 0) return { left: null, right: null };
  const first = chain[0];
  const last = chain[chain.length - 1];
  return { left: first.exposedLeft, right: last.exposedRight };
}

export function isValidMovesArray(tile, openEnds) {
  if (openEnds.left === null || openEnds.right === null) {
      return [{ valid: true, end: 'both', orientation: tile.left === tile.right ? 'v' : 'h' }];
  }
  
  const matchesLeft = tile.left === openEnds.left || tile.right === openEnds.left;
  const matchesRight = tile.left === openEnds.right || tile.right === openEnds.right;
  
  const moves = [];
  if (matchesLeft) moves.push({ valid: true, end: 'left', orientation: tile.left === tile.right ? 'v' : 'h' });
  if (matchesRight) moves.push({ valid: true, end: 'right', orientation: tile.left === tile.right ? 'v' : 'h' });
  
  return moves;
}

export function getValidMoves(hand, openEnds, isFirstMoveOfRound = false, isFirstRoundOfMatch = false) {
  if (openEnds.left === null && openEnds.right === null) {
     if (isFirstMoveOfRound && isFirstRoundOfMatch) {
        const doubleSix = hand.find(t => t.id === '6-6');
        if (doubleSix) {
            return [{ tile: doubleSix, end: 'both', orientation: 'v', valid: true }];
        } else {
            // Fallback for first round if 6-6 not found (highly unlikely but for robustness)
            return hand.flatMap(tile => isValidMovesArray(tile, openEnds).map(m => ({ tile, ...m })));
        }
     }
     // Any card is playable if it's the start of subsequent rounds
     return hand.flatMap(tile => isValidMovesArray(tile, openEnds).map(m => ({ tile, ...m })));
  }
  return hand.flatMap(tile => isValidMovesArray(tile, openEnds).map(m => ({ tile, ...m })));
}

export function applyMove(gameState, seatIndex, tile, endStr) {
  const newState = JSON.parse(JSON.stringify(gameState));
  const hand = newState.tiles[seatIndex];
  
  newState.tiles[seatIndex] = hand.filter(t => t.id !== tile.id);
  
  let exposedLeft, exposedRight;
  const openEnds = getOpenEnds(newState.chain);
  
  if (newState.chain.length === 0) {
      exposedLeft = tile.left;
      exposedRight = tile.right;
      newState.chain.push({ ...tile, placedEnd: 'both', exposedLeft, exposedRight, orientation: tile.left === tile.right ? 'v' : 'h' });
  } else {
      const placementEnd = endStr === 'both' ? 'right' : endStr;
      
      if (placementEnd === 'left') {
          exposedLeft = tile.left === openEnds.left ? tile.right : tile.left;
          newState.chain.unshift({ ...tile, placedEnd: 'left', exposedLeft, exposedRight: openEnds.left, orientation: tile.left === tile.right ? 'v' : 'h' });
      } else {
          exposedRight = tile.left === openEnds.right ? tile.right : tile.left;
          newState.chain.push({ ...tile, placedEnd: 'right', exposedLeft: openEnds.right, exposedRight, orientation: tile.left === tile.right ? 'v' : 'h' });
      }
  }

  newState.passCount = 0;
  newState.lastAction = { type: 'move', seat: seatIndex, tile, timestamp: Date.now() };
  
  // Check win condition BEFORE advancing turn
  if (newState.tiles[seatIndex].length === 0) {
      return finalizeRound(newState, seatIndex, false);
  } else {
      newState.currentTurn = getNextSeat(seatIndex, newState.seats);
  }
  
  return newState;
}

export function applyDraw(gameState, seatIndex) {
  const newState = JSON.parse(JSON.stringify(gameState));
  if (newState.boneyard.length > 0) {
      const tile = newState.boneyard.shift();
      newState.tiles[seatIndex].push(tile);
      newState.lastAction = { type: 'draw', seat: seatIndex, timestamp: Date.now() };
  }
  return newState;
}

export function applyPass(gameState, seatIndex) {
  const newState = JSON.parse(JSON.stringify(gameState));
  newState.passCount = (newState.passCount || 0) + 1;
  newState.lastAction = { type: 'pass', seat: seatIndex, timestamp: Date.now() };
  
  if (newState.passCount >= newState.seats) {
      // Determine winner by lowest pip count since the game locked
      let minPips = Infinity;
      let winnerIndex = -1;
      let tie = false;
      
      for (let i = 0; i < newState.seats; i++) {
          const pips = newState.tiles[i].reduce((sum, t) => sum + t.left + t.right, 0);
          if (pips < minPips) {
              minPips = pips;
              winnerIndex = i;
              tie = false;
          } else if (pips === minPips) {
              tie = true;
          }
      }
      
      // TIE on pip total: the player whose turn it would have been next wins (getNextSeat of current seatIndex)
      if (tie) {
          winnerIndex = getNextSeat(seatIndex, newState.seats);
      }
      
      return finalizeRound(newState, winnerIndex, true);
  } else {
      newState.currentTurn = getNextSeat(seatIndex, newState.seats);
  }
  
  return newState;
}

function finalizeRound(state, winnerIndex, isLocked) {
    const newState = { ...state };
    const winnerUid = newState.players[winnerIndex];
    
    // Pip calculation: sum of ALL THREE other players' pip totals (opponents + partner/others)
    let roundScore = 0;
    for (let i = 0; i < newState.seats; i++) {
        if (i === winnerIndex) continue;
        const hand = newState.tiles[i];
        const pips = hand.reduce((sum, t) => sum + t.left + t.right, 0);
        roundScore += pips;
    }
    
    newState.lastRoundScore = roundScore;
    
    if (newState.mode === 'team') {
        const team = (winnerIndex % 2 === 0) ? 'teamA' : 'teamB';
        newState.scores[team] = (newState.scores[team] || 0) + roundScore;
        // Check if game is over
        if (newState.scores[team] >= newState.targetScore) {
            newState.status = 'game_over';
            newState.winner = -1; // Reset round winner to game winner logic in UI if needed
            newState.gameWinner = team;
        } else {
            newState.status = isLocked ? 'locked' : 'finished';
        }
    } else {
        newState.playerScores[winnerUid] = (newState.playerScores[winnerUid] || 0) + roundScore;
        // Check if game is over
        if (newState.playerScores[winnerUid] >= newState.targetScore) {
            newState.status = 'game_over';
            newState.gameWinner = winnerUid;
        } else {
            newState.status = isLocked ? 'locked' : 'finished';
        }
    }
    
    newState.winner = winnerIndex;
    newState.currentTurn = -1;
    newState.roundLocked = isLocked;
    newState.roundNumber = (newState.roundNumber || 1) + 1;
    
    return newState;
}

export function isLocked(gameState) {
  return gameState.passCount >= gameState.seats;
}

export function getNextSeat(currentSeat, totalSeats) {
  return (currentSeat + 1) % totalSeats;
}
