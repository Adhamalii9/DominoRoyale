import { getValidMoves, getOpenEnds } from '../rules.js';
import { scoreMoveAI, shouldPassInstead } from './strategy.js';

const delay = (ms) => new Promise(res => setTimeout(res, ms));

export async function chooseMove(gameState, mySeat, tracker, partnerSeat) {
  const hand = gameState.tiles[mySeat];
  const openEnds = getOpenEnds(gameState.chain);
  
  const validMoves = getValidMoves(hand, openEnds);

  if (validMoves.length === 0) {
      if (gameState.boneyard.length > 0) {
          return { action: "draw" };
      }
      return { action: "pass" };
  }

  // Artificial thinking delay
  await delay(600 + Math.random() * 600);

  // Score
  // Note: partner moves tracking is omitted for brevity, passing null for signal
  let bestMove = null;
  let highestScore = -Infinity;

  for (const move of validMoves) {
       // Patch move object specifically for scoring
       const evalMove = { ...move, openEnds };
       // Assuming chainLeftEnd / RightEnd format for strategy hook
       const mockState = { ...gameState, chainLeftEnd: openEnds.left, chainRightEnd: openEnds.right };
       
       const score = scoreMoveAI(evalMove, mockState, mySeat, tracker, null);
       if (score > highestScore) {
           highestScore = score;
           bestMove = move;
       }
  }

  return { action: "play", tile: bestMove.tile, end: bestMove.end };
}
