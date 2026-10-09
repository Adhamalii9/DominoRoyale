export interface Domino {
  a: number;
  b: number;
}

export interface Placement {
  domino: Domino;
  x: number;
  y: number;
  rotation: number;
  sideIndex: number; // 0 or 1, which side was matched
}

export interface GameState {
  id: string;
  status: 'waiting' | 'active' | 'finished';
  mode?: string;
  maxPlayers?: number;
  seats?: number;
  players: string[];
  playerNames: Record<string, string>;
  playerPhotos?: Record<string, string>;
  turn: number;
  board: Placement[];
  leftEnd: number | null;
  rightEnd: number | null;
  lastMoveAt: number;
  winner?: string;
  deck: Domino[];
  scores: Record<string, number>;
  playerScores?: Record<string, number>;
  targetScore?: number;
  goal: number;
}

export interface PlayerHand {
  tiles: Domino[];
}
