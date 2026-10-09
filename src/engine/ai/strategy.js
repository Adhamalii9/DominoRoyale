export function scoreMoveAI(move, gameState, mySeat, tracker, partnerSignal) {
  let score = 0;
  
  const pipValuePlayed = move.tile.left + move.tile.right;
  score += pipValuePlayed * 0.5;

  if (move.tile.left === move.tile.right) {
      score += 20; // Double bonus
  }

  const myHand = gameState.tiles[mySeat];
  
  // Expected new open end
  const exposed = move.end === 'left' ? 
      (move.tile.left === gameState.chainLeftEnd ? move.tile.right : move.tile.left) :
      (move.tile.left === gameState.chainRightEnd ? move.tile.right : move.tile.left);

  // Suit control bonus
  const suitCount = myHand.filter(t => t.id !== move.tile.id && (t.left === exposed || t.right === exposed)).length;
  score += suitCount * 10;

  // Opponent logic
  const nextSeat = (mySeat + 1) % gameState.seats;
  if (tracker.absences[nextSeat] && tracker.absences[nextSeat].has(exposed)) {
      score += 25; // Block bonus
  }

  // Partner bonus
  if (partnerSignal === exposed) {
      score += 10;
  }

  if (isEndgame(gameState)) {
      score += pipValuePlayed * 1.5; // heavy weight on high pips
  }

  return score;
}

export function isEndgame(gameState) {
  for (let i = 0; i < gameState.seats; i++) {
     if (gameState.tiles[i].length <= 3) return true;
  }
  return false;
}

export function getBestDraw(gameState, mySeat, tracker) {
  return true; // Always draw
}

export function shouldPassInstead(gameState, mySeat) {
  return gameState.boneyard.length === 0;
}
