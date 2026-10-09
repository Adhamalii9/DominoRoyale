export function generateTileSet() {
  const tiles = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      tiles.push({ left: i, right: j, id: `${i}-${j}` });
    }
  }
  return tiles;
}

export function shuffleTiles(tiles) {
  const newArr = [...tiles];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

export function dealTiles(tiles, playerCount) {
  let activeTiles = [...tiles];
  
  if (playerCount === 3) {
      activeTiles = activeTiles.filter(t => t.id !== '0-0');
  }

  const hands = [];
  const tilesPerPlayer = playerCount === 3 ? 9 : 7;
  let currentIndex = 0;
  for (let i = 0; i < playerCount; i++) {
    hands.push(activeTiles.slice(currentIndex, currentIndex + tilesPerPlayer));
    currentIndex += tilesPerPlayer;
  }
  const boneyard = activeTiles.slice(currentIndex);
  
  const pIdx = boneyard.findIndex(t => t.id === '6-6');
  if (pIdx !== -1) {
     const randomSeat = Math.floor(Math.random() * playerCount);
     const randomHandIndex = Math.floor(Math.random() * tilesPerPlayer);
     const temp = hands[randomSeat][randomHandIndex];
     hands[randomSeat][randomHandIndex] = boneyard[pIdx];
     boneyard[pIdx] = temp;
  }
  
  return { hands, boneyard };
}

export function findStartingPlayer(hands) {
  // Find highest double
  for (let d = 6; d >= 0; d--) {
    for (let i = 0; i < hands.length; i++) {
      const tile = hands[i].find(t => t.left === d && t.right === d);
      if (tile) return { seatIndex: i, tile };
    }
  }
  // If no doubles, highest sum
  let maxSum = -1;
  let maxSeat = -1;
  let maxTile = null;
  for (let i = 0; i < hands.length; i++) {
    for (const t of hands[i]) {
      if (t.left + t.right > maxSum) {
        maxSum = t.left + t.right;
        maxSeat = i;
        maxTile = t;
      }
    }
  }
  return { seatIndex: maxSeat, tile: maxTile };
}

export function pipTotal(hand) {
  return hand.reduce((sum, tile) => sum + tile.left + tile.right, 0);
}
