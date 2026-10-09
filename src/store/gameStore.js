import { create } from 'zustand';

export const useGameStore = create((set, get) => ({
  gameState: null,
  localSeatIndex: null,
  selectedTile: null,
  validMoves: [],
  animatingTile: null,
  connectionStatus: 'connected',

  setGameState: (gs) => set({ gameState: gs }),
  setLocalSeatIndex: (idx) => set({ localSeatIndex: idx }),
  
  selectTile: (tile, calculateValidMoves) => {
    set((state) => {
      // Recompute valid moves via injected function since rules.js is pure
      const openEnds = calculateValidMoves ? calculateValidMoves(state.gameState) : null;
      // We will handle logic in the component layer normally, but store it here per request
      return { selectedTile: tile, validMoves: openEnds || [] };
    });
  },
  
  clearSelection: () => set({ selectedTile: null, validMoves: [] }),
  setAnimating: (tile) => set({ animatingTile: tile }),
  clearAnimating: () => set({ animatingTile: null }),
  setConnectionStatus: (s) => set({ connectionStatus: s }),

  // Computeds implemented via getters dynamically when needed
  myHand: () => {
    const s = get();
    return s.gameState && s.localSeatIndex !== null ? s.gameState.tiles[s.localSeatIndex] : [];
  },
  isMyTurn: () => {
    const s = get();
    return s.gameState && s.gameState.currentTurn === s.localSeatIndex;
  }
}));
