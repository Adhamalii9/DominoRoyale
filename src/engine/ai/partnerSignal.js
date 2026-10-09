export function readPartnerSignal(partnerMoves) {
  if (!partnerMoves || partnerMoves.length === 0) return null;
  // first non-double play
  for (const move of partnerMoves) {
     if (move.tile.left !== move.tile.right) {
        // Did they match their left to the board right end?
        // Let's just assume the exposed end they left behind is what they want
        return move.exposedLeft !== undefined ? move.exposedLeft : move.exposedRight;
     }
  }
  return null;
}

export function shouldSupportPartner(myHand, partnerSignal, openEnds) {
  if (partnerSignal === null) return false;
  // Only support if it doesn't hurt us too much, or if we have it
  return myHand.some(t => t.left === partnerSignal || t.right === partnerSignal);
}

export function getPartnerSupportMove(validMoves, partnerSignal) {
  const supportMoves = validMoves.filter(m => {
      // Find moves that leave the partnerSignal exposed
      const exposed = m.end === 'left' ? 
          (m.tile.left === m.openEnds.left ? m.tile.right : m.tile.left) :
          (m.tile.left === m.openEnds.right ? m.tile.right : m.tile.left);
      return exposed === partnerSignal;
  });
  if (supportMoves.length > 0) return supportMoves[0]; // just pick first that supports
  
  // Or at least match it if it's already on the board? 
  // Actually, partner signal implies they want the board to HAVE that signal OPEN.
  return null;
}
