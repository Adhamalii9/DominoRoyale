import { Domino, Placement } from '../types';

export const ALL_DOMINOES: Domino[] = [];
for (let i = 0; i <= 6; i++) {
  for (let j = i; j <= 6; j++) {
    ALL_DOMINOES.push({ a: i, b: j });
  }
}

export const shuffle = <T,>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

export const canPlay = (domino: Domino, leftEnd: number | null, rightEnd: number | null): 'left' | 'right' | 'both' | null => {
  if (leftEnd === null || rightEnd === null) {
    // Force starting with 6:6 if board is empty
    // If the game logic already assigned turn correctly, 
    // we basically just need to ensure they pick the right tile if we want to be strict.
    // For now, let's allow ANY tile but strongly suggest 6:6 by making it the only playable one if it's in hand.
    return 'both'; 
  }
  
  const matchesLeft = domino.a === leftEnd || domino.b === leftEnd;
  const matchesRight = domino.a === rightEnd || domino.b === rightEnd;
  
  if (matchesLeft && matchesRight) return 'both';
  if (matchesLeft) return 'left';
  if (matchesRight) return 'right';
  return null;
};

export const getNewEnds = (domino: Domino, placement: 'left' | 'right', currentLeft: number | null, currentRight: number | null) => {
  if (currentLeft === null) {
    return { left: domino.a, right: domino.b };
  }
  
  if (placement === 'left') {
    const newLeft = domino.a === currentLeft ? domino.b : domino.a;
    return { left: newLeft, right: currentRight };
  } else {
    const newRight = domino.a === currentRight ? domino.b : domino.a;
    return { left: currentLeft, right: newRight };
  }
};

export const getStartingPlayerIndex = (hands: Domino[][]): number => {
  // Find player with 6:6
  for (let i = 0; i < hands.length; i++) {
    if (hands[i].some(t => t.a === 6 && t.b === 6)) return i;
  }
  // Fallback: highest double
  for (let d = 6; d >= 0; d--) {
    for (let i = 0; i < hands.length; i++) {
      if (hands[i].some(t => t.a === d && t.b === d)) return i;
    }
  }
  return 0;
};
