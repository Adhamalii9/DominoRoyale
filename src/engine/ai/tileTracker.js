export class TileTracker {
  constructor(mySeatIndex, myHand, totalSeats) {
    this.mySeatIndex = mySeatIndex;
    this.totalSeats = totalSeats;
    this.playedTiles = new Set();
    // Maps seatIndex -> Set of pip values they likely don't have
    this.absences = Array.from({ length: totalSeats }, () => new Set());
    this.draws = Array.from({ length: totalSeats }, () => 0);
    this.myInitialHand = new Set(myHand.map(t => t.id));
  }

  recordPlay(seatIndex, tile) {
    this.playedTiles.add(tile.id);
  }

  recordPass(seatIndex, openEnds) {
    if (openEnds.left !== null) this.absences[seatIndex].add(openEnds.left);
    if (openEnds.right !== null) this.absences[seatIndex].add(openEnds.right);
  }

  recordDraw(seatIndex) {
    this.draws[seatIndex]++;
  }

  getProbableHolders(pipValue) {
    const holders = [];
    for (let i = 0; i < this.totalSeats; i++) {
       if (i !== this.mySeatIndex && !this.absences[i].has(pipValue)) {
          holders.push(i);
       }
    }
    return holders;
  }

  getDeducedAbsences(seatIndex) {
    return this.absences[seatIndex];
  }

  getUnseenTiles() {
    const unseen = [];
    for (let i = 0; i <= 6; i++) {
       for (let j = i; j <= 6; j++) {
          const id = `${i}-${j}`;
          if (!this.playedTiles.has(id) && !this.myInitialHand.has(id)) {
             unseen.push({ left: i, right: j, id });
          }
       }
    }
    return unseen;
  }

  estimateHandStrength(seatIndex) {
    // Extremely rough estimate: fewer absences = stronger
    return 7 - this.absences[seatIndex].size;
  }
}
