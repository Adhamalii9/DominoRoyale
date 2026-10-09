import React from 'react';
import GamePage from '../pages/GamePage';
import { User } from 'firebase/auth';

interface Props {
  gameId: string;
  onBack: () => void;
  user: User;
}

export default function GameView({ gameId, onBack, user }: Props) {
  // We wrap the new GamePage system inside GameView to maintain App.tsx purity
  return <GamePage gameId={gameId} onBack={onBack} user={user} />;
}

