import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { db, handleFirestoreError } from '../firebase';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { applyMove, applyDraw, applyPass, getOpenEnds, getValidMoves } from '../engine/rules';
import { chooseMove } from '../engine/ai/aiPlayer';
import { TileTracker } from '../engine/ai/tileTracker';

export function useGameSync(roomId, seatIndex) {
  const { gameState, setGameState, clearSelection, localSeatIndex } = useGameStore();

  useEffect(() => {
    if (!roomId) return;
    
    // We strictly use Firestore onSnapshot as AI Studio environment's set_up_firebase creates Firestore, 
    // despite prompt asking for Realtime DB.
    
    const unsub = onSnapshot(doc(db, 'domino_games', roomId), (docSnap) => {
       console.log('Snapshot received for roomId:', roomId, 'exists:', docSnap.exists());
       if (docSnap.exists()) {
           const data = docSnap.data();
           console.log('Snapshot data:', data);
           const state = data.state; // The nested game state object
           
           // Fast track: If state isn't mapped inside, fallback immediately to map root elements to ensure load
           if (!state) {
              setGameState(data);
              return;
           }
           
           setGameState(state);
       } else {
           console.log('Snapshot does not exist for this ID!');
       }
    }, (error) => {
       console.error("Snapshot error:", error);
       handleFirestoreError(error, 'get', `domino_games/${roomId}`);
    });

    return () => unsub();
  }, [roomId, setGameState]);

  useEffect(() => {
     // AI Processing Loop triggered locally by HOST only
     if (!gameState || gameState.hostSeatIndex !== localSeatIndex) return;
     if (gameState.status === 'finished') return;

     const isAITurn = gameState.seatsData[gameState.currentTurn]?.isAI;
     if (isAITurn) {
         // Prevent double triggering
         if (window.aiIsThinking === gameState.currentTurn) return;
         window.aiIsThinking = gameState.currentTurn;

         const runAI = async () => {
             // Let OpponentArea show "thinking..." dots via a quick flag to Firestore or local state
             useGameStore.setState({ isThinking: gameState.currentTurn });
             
             // Setup tracker for AI
             const tracker = new TileTracker(gameState.currentTurn, gameState.tiles[gameState.currentTurn], gameState.seats);
             
             const move = await chooseMove(gameState, gameState.currentTurn, tracker, null);
             
             if (move.action === 'play') {
                 await submitMove(move.tile, move.end, gameState.currentTurn);
             } else if (move.action === 'draw') {
                 // Simulate thought for draw
                 useGameStore.setState({ aiMessage: 'AI draws...' });
                 await new Promise(r => setTimeout(r, 600));
                 
                 const drawnState = await submitDraw(gameState.currentTurn, false);
                 
                 // Immediately re-evaluate after draw
                 const nextOpenEnds = getOpenEnds(drawnState.chain);
                 const validAfter = getValidMoves(drawnState.tiles[gameState.currentTurn], nextOpenEnds);
                 
                 if (validAfter.length > 0) {
                     await new Promise(r => setTimeout(r, 800));
                     await submitMove(validAfter[0].tile, validAfter[0].end, gameState.currentTurn, drawnState);
                 } else {
                     await new Promise(r => setTimeout(r, 800));
                     await submitPass(gameState.currentTurn, drawnState);
                 }
             } else if (move.action === 'pass') {
                 useGameStore.setState({ aiMessage: 'AI passes' });
                 await new Promise(r => setTimeout(r, 400));
                 await submitPass(gameState.currentTurn);
             }
             
             useGameStore.setState({ isThinking: null, aiMessage: null });
             window.aiIsThinking = null;
         };
         runAI();
     }
  }, [gameState, localSeatIndex]);

  const commitState = async (newState) => {
     newState.version = (newState.version || 0) + 1;
     // Optimistic update
     setGameState(newState);
     
     // Write ENTIRE state atomically to Firestore as per strict prompt rule (using Firestore instead of RTDB)
     await setDoc(doc(db, 'domino_games', roomId), { status: newState.status, state: newState }, { merge: true });
  }

  const submitMove = async (tile, end, actingSeatIndex = localSeatIndex, baseState = gameState) => {
     const newState = applyMove(baseState, actingSeatIndex, tile, end);
     await commitState(newState);
     clearSelection();
     return newState;
  };

  const submitDraw = async (actingSeatIndex = localSeatIndex, skipCommit = false) => {
     const newState = applyDraw(gameState, actingSeatIndex);
     if (!skipCommit) await commitState(newState);
     return newState;
  };

  const submitPass = async (actingSeatIndex = localSeatIndex, baseState = gameState) => {
     const newState = applyPass(baseState, actingSeatIndex);
     await commitState(newState);
     return newState;
  };

  return { gameState, submitMove, submitDraw, submitPass };
}
