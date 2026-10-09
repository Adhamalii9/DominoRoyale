import React, { useEffect, useState } from 'react';
import GameBoard from '../components/game/GameBoard';
import OpponentArea from '../components/game/OpponentArea';
import { useGameSync } from '../hooks/useGameSync';
import { useGameStore } from '../store/gameStore';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Play, Users, X, Trophy, Award, History, RotateCcw, UserPlus, Check, Volume2, VolumeX } from 'lucide-react';
import { auth, db } from '../firebase';
import { getValidMoves, getOpenEnds } from '../engine/rules';
import { generateTileSet, shuffleTiles, dealTiles, findStartingPlayer, pipTotal } from '../engine/tiles';
import { doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { useFriends } from '../hooks/useFriends';
import { soundManager } from '../lib/sounds';

export default function GamePage({ gameId, onBack, user }) {
  const { gameState, submitMove, submitDraw, submitPass } = useGameSync(gameId);
  const { friends, sendRequest } = useFriends(user);
  const [activePlacementTile, setActivePlacementTile] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [roundRestartCountdown, setRoundRestartCountdown] = useState(null);
  const [sentRequests, setSentRequests] = useState(new Set());
  const [muted, setMuted] = useState(soundManager.isMuted());
  const [requestingStart, setRequestingStart] = useState(false);
  const [lastActionTimestamp, setLastActionTimestamp] = useState(0);
  const [lastTurn, setLastTurn] = useState(-1);
  const [showResults, setShowResults] = useState(false);

  // Determine local seat BEFORE any early returns
  const localSeatIndex = gameState?.players ? gameState.players.indexOf(user?.uid) : -1;
  const isHost = localSeatIndex === (gameState?.hostSeatIndex ?? -1);
  const userTeam = localSeatIndex !== -1 ? (localSeatIndex % 2 === 0 ? 'teamA' : 'teamB') : null;
  
  // Set local seat explicitly so hooks have access (above early return constraint)
  useEffect(() => {
     useGameStore.setState({ localSeatIndex });
  }, [localSeatIndex]);

  // Handle audio unlocking on first click
  useEffect(() => {
    const handleGlobalClick = () => {
      soundManager.unlock();
      // Remove itself after first click
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('touchstart', handleGlobalClick);
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('touchstart', handleGlobalClick);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('touchstart', handleGlobalClick);
    };
  }, []);

  // Guard active placement state (must stay above early return)
  useEffect(() => {
    if (gameState?.status && gameState.status !== 'active') {
      setActivePlacementTile(null);
    }
  }, [gameState?.status]);

  // Handle sounds for game actions
  useEffect(() => {
    if (!gameState) return;

    // 1. Reset state markers when a new round starts (from finished back to active)
    if (gameState.status === 'active' && lastActionTimestamp === -1) {
      setLastActionTimestamp(0);
      setLastTurn(-1);
    }

    // 2. Handle Action Sounds first (so finishing moves have their "click" sound)
    if (gameState.status === 'active' || gameState.status === 'finished' || gameState.status === 'game_over' || gameState.status === 'locked') {
      if (gameState.lastAction && gameState.lastAction.timestamp > lastActionTimestamp && lastActionTimestamp !== -1) {
          const { type } = gameState.lastAction;
          if (type === 'move') soundManager.play('play');
          
          // If this move ended the game, we'll handle 'win' in a moment, 
          // but we still update the timestamp so we don't repeat this action sound.
          setLastActionTimestamp(gameState.lastAction.timestamp);
      }
    }

    // 3. Handle Game End Sounds
    const isEndState = ['finished', 'game_over', 'locked'].includes(gameState.status);
    if (isEndState && lastActionTimestamp !== -1) {
      // Small delay for win sound so it doesn't clash with the move sound
      setTimeout(() => {
        soundManager.play('win');
      }, 300);
      setLastActionTimestamp(-1); // Mark as played for this state
      return;
    }

    if (gameState.status !== 'active') return;

    // 4. Update Turn Tracking (sound removed by user request)
    setLastTurn(gameState.currentTurn);
  }, [gameState?.lastAction?.timestamp, gameState?.status, gameState?.currentTurn, localSeatIndex, lastActionTimestamp, lastTurn]);

  // Delayed Results Modal
  useEffect(() => {
    if (gameState?.status && ['finished', 'locked', 'game_over'].includes(gameState.status)) {
       const timer = setTimeout(() => setShowResults(true), 2000);
       return () => clearTimeout(timer);
    } else {
       setShowResults(false);
    }
  }, [gameState?.status]);

  // Automatic start logic
  useEffect(() => {
    const playerCount = gameState?.players?.filter(Boolean).length || 0;
    if (gameState?.status === 'waiting' && playerCount === gameState.seats) {
      if (countdown === null) {
        setCountdown(5); // 5 seconds countdown
      } else if (countdown > -5) { // Allow countdown to go below 0 for fallback
        const timer = setTimeout(() => {
          setCountdown(countdown - 1);
          // Auto-trigger for host at exactly 0
          if (isHost && countdown === 1) {
            startGame().catch(err => console.error("Auto-start error:", err));
          }
          // Auto-trigger for anyone as fallback at -3
          if (countdown === -2 && localSeatIndex !== -1) {
            console.log("Fallback start triggered");
            startGame().catch(err => console.error("Fallback-start error:", err));
          }
        }, 1000);
        return () => clearTimeout(timer);
      }
    } else if (countdown !== null) {
      setCountdown(null);
    }
  }, [gameState?.status, gameState?.players, gameState?.seats, countdown, isHost, localSeatIndex]);

  // Automatic round restart logic
  useEffect(() => {
    const isRoundOver = gameState?.status === 'finished' || gameState?.status === 'locked';
    if (isRoundOver && showResults) { // Only start countdown ONCE results are shown
      if (roundRestartCountdown === null) {
        setRoundRestartCountdown(3); // 3 seconds countdown
      } else if (roundRestartCountdown > 0) {
        const timer = setTimeout(() => setRoundRestartCountdown(roundRestartCountdown - 1), 1000);
        return () => clearTimeout(timer);
      } else if (roundRestartCountdown === 0 && isHost) {
        handleNextRound();
        setRoundRestartCountdown(null);
      }
    } else if (roundRestartCountdown !== null) {
      setRoundRestartCountdown(null);
    }
  }, [gameState?.status, roundRestartCountdown, isHost, showResults]);

  if (!gameState) {
      return (
          <div className="flex flex-col h-[100dvh] items-center justify-center bg-neutral-950 text-white p-8">
              <div className="animate-pulse mb-4 uppercase tracking-[0.2em] font-bold text-neutral-500">Connecting to Arena...</div>
              <button 
                onClick={() => onBack()} 
                className="px-6 py-2 bg-neutral-800 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-neutral-700 transition-colors"
              >
                Abort & Return
              </button>
          </div>
      );
  }

  const joinGame = async (targetSeatIndex) => {
      let seatIdx = targetSeatIndex;
      if (seatIdx === undefined) {
         seatIdx = gameState.players.findIndex(p => !p);
      }
      if (seatIdx === -1 || seatIdx >= gameState.seats || gameState.players[seatIdx]) return; 

      const newPlayers = [...gameState.players];
      
      // Enable switching seats: find if player is already in a seat and clear it
      const existingSeatIdx = newPlayers.indexOf(user?.uid);
      if (existingSeatIdx !== -1) {
          newPlayers[existingSeatIdx] = '';
      }

      newPlayers[seatIdx] = user?.uid;

      const newNames = { ...gameState.playerNames, [user?.uid]: user?.displayName || user?.email || 'Player' };
      const newPhotos = { ...gameState.playerPhotos, [user?.uid]: user?.photoURL || null };
      const newSeatsData = { ...gameState.seatsData };
      
      // Update seatsData: clear old one if it was an AI (though unlikely for player)
      // and set current one
      newSeatsData[seatIdx] = { isAI: false };
      if (existingSeatIdx !== -1) {
          delete newSeatsData[existingSeatIdx];
      }
      
      const newPlayerScores = { ...gameState.playerScores };
      // Keep score if switching seats? In waiting phase scores are usually 0 anyway.
      newPlayerScores[user.uid] = 0;

      const newState = {
          ...gameState,
          players: newPlayers,
          playerNames: newNames,
          playerPhotos: newPhotos,
          seatsData: newSeatsData,
          playerScores: newPlayerScores,
          hostSeatIndex: existingSeatIdx === gameState.hostSeatIndex ? seatIdx : gameState.hostSeatIndex,
          version: (gameState.version || 0) + 1
      };
      await updateDoc(doc(db, 'domino_games', gameId), { 
          state: newState,
          players: newPlayers 
      });
  };

  const startGame = async () => {
       // Prevents double-start if two players trigger at once
       const docRef = doc(db, 'domino_games', gameId);
       const docSnap = await getDoc(docRef);
       if (!docSnap.exists() || docSnap.data().status !== 'waiting') return;

       const tilesArr = shuffleTiles(generateTileSet());
       const { hands, boneyard } = dealTiles(tilesArr, gameState.seats);
       const { seatIndex } = findStartingPlayer(hands);

       const handsObj = {};
       hands.forEach((h, i) => handsObj[i] = h);

       const newState = {
           ...gameState,
           status: 'active',
           roundNumber: 1,
           tiles: handsObj,
           boneyard,
           currentTurn: seatIndex,
           version: (gameState.version || 0) + 1
       };

       await updateDoc(doc(db, 'domino_games', gameId), {
           status: 'active',
           state: newState
       });
  };

  const fillWithBots = async () => {
        const newPlayers = [...gameState.players];
        const newNames = { ...gameState.playerNames };
        const newPhotos = { ...gameState.playerPhotos || {} };
        const newSeatsData = { ...gameState.seatsData };
        const newPlayerScores = { ...gameState.playerScores };

        let botCount = 1;
        for (let i = 0; i < gameState.seats; i++) {
            if (!newPlayers[i]) {
                const mockId = `mock_${i}_${gameId}`;
                newPlayers[i] = mockId;
                newNames[mockId] = `Pro Bot ${botCount++}`;
                newPhotos[mockId] = `https://api.dicebear.com/7.x/bottts/svg?seed=${mockId}`;
                newSeatsData[i] = { isAI: true };
                newPlayerScores[mockId] = 0;
            }
        }

        const tilesArr = shuffleTiles(generateTileSet());
        const { hands, boneyard } = dealTiles(tilesArr, gameState.seats);
        const { seatIndex } = findStartingPlayer(hands);

        const handsObj = {};
        hands.forEach((h, i) => handsObj[i] = h);

        const newState = {
            ...gameState,
            status: 'active',
            roundNumber: 1,
            players: newPlayers,
            playerNames: newNames,
            playerPhotos: newPhotos,
            seatsData: newSeatsData,
            playerScores: newPlayerScores,
            tiles: handsObj,
            boneyard,
            currentTurn: seatIndex,
            version: (gameState.version || 0) + 1
        };

        await updateDoc(doc(db, 'domino_games', gameId), {
            status: 'active',
            state: newState,
            players: newPlayers
        });
  };

  const handleNextRound = async () => {
       const tilesArr = shuffleTiles(generateTileSet());
       const { hands, boneyard } = dealTiles(tilesArr, gameState.seats);
       
       const nextRoundNumber = (gameState.roundNumber || 1) + 1;
       const lastWinner = gameState.winner;
       const lastWinnerTeam = lastWinner !== -1 ? (gameState.mode === 'team' ? lastWinner % 2 : -1) : -1;

       // Winning team indices
       const winningTeamIndices = gameState.players.map((p, i) => i).filter(i => {
          if (gameState.mode === 'team') return (i % 2) === lastWinnerTeam;
          return i === lastWinner;
       });
       
       // Real players on the winning team
       const humanWinningTeamMembers = winningTeamIndices.filter(i => 
          gameState.players[i] && !gameState.seatsData?.[i]?.isAI
       );
       
       // ONLY show the selection dialog if there are 2 or more HUMAN players on the winning team
       const needsConsensus = gameState.mode === 'team' && humanWinningTeamMembers.length >= 2;

       let seatIndex = -1;
       if (needsConsensus) {
           seatIndex = -1; // This triggers the selection UI
       } else {
           // Automatic: last individual winner starts
           seatIndex = lastWinner !== -1 ? lastWinner : 0;
       }

       const handsObj = {};
       hands.forEach((h, i) => handsObj[i] = h);

       const newState = {
           ...gameState,
           status: 'active',
           roundNumber: nextRoundNumber,
           tiles: handsObj,
           boneyard,
           chain: [],
           currentTurn: seatIndex,
           lastWinner: lastWinner,
           lastWinnerTeam: lastWinnerTeam,
           passCount: 0,
           lastAction: null,
           roundLocked: false,
           winner: -1,
           lastRoundScore: 0,
           preferredStarter: -1,
           starterVotes: {},
           version: (gameState.version || 0) + 1
       };

       await updateDoc(doc(db, 'domino_games', gameId), {
           status: 'active',
           state: newState
       });
  };

  const claimStart = async (choiceIdx) => {
    if (!gameId) return;
    
    // Only allow voting if the player belongs to the winning team
    const myTeam = localSeatIndex % 2;
    const isWinnerTeam = (gameState.mode === 'team') 
        ? (myTeam === gameState.lastWinnerTeam) 
        : (localSeatIndex === gameState.lastWinner);

    if (!isWinnerTeam && !isHost) return;

    const votes = { ...(gameState.starterVotes || {}), [localSeatIndex]: choiceIdx };
    
    // Check consensus for the winning team
    const teamIndices = gameState.players.map((p, i) => i).filter(i => {
        if (gameState.mode === 'team') return (i % 2) === gameState.lastWinnerTeam;
        return i === gameState.lastWinner;
    });

    // Identify human players on this team
    const humanTeamIndices = teamIndices.filter(i => gameState.players[i] && !gameState.seatsData?.[i]?.isAI);
    
    let consensusReached = false;
    if (humanTeamIndices.length <= 1) {
        // Solo human or bot-only team (handled by host), choice is final
        consensusReached = true;
    } else {
        // Multiple humans, check if they voted for the same person
        const allHumansVoted = humanTeamIndices.every(i => votes[i] !== undefined);
        const uniqueChoices = new Set(humanTeamIndices.map(i => votes[i]).filter(v => v !== undefined));
        if (allHumansVoted && uniqueChoices.size === 1) {
            consensusReached = true;
        }
    }

    const updates = {
      'state.starterVotes': votes,
      'state.version': (gameState.version || 0) + 1
    };

    if (consensusReached) {
      updates['state.currentTurn'] = choiceIdx;
      updates['state.starterVotes'] = {};
    }

    await updateDoc(doc(db, 'domino_games', gameId), updates);
  };

  const setStarterRequest = async (seatIdx) => {
       if (!isHost) {
           await updateDoc(doc(db, 'domino_games', gameId), {
               'state.preferredStarter': seatIdx,
               'state.version': gameState.version + 1
           });
       }
  };

  // Enhanced Leave response
  const handleLeave = () => {
    console.log("Leave Arena clicked");
    onBack(); // Switch UI state FIRST for maximum responsiveness
    
    // Cleanup in background
    (async () => {
      try {
        if (gameState && user) {
          const uid = user.uid;
          const localSeat = gameState.players.indexOf(uid);

          if (localSeat !== -1) {
            const newPlayers = [...gameState.players];
            newPlayers[localSeat] = '';
            
            const remainingReal = newPlayers.filter(id => id && !id.startsWith('mock_')).filter(Boolean);

            if (remainingReal.length === 0) {
              console.log("No real players left, deleting match");
              await deleteDoc(doc(db, 'domino_games', gameId));
            } else {
              const newNames = { ...gameState.playerNames };
              delete newNames[uid];
              const newScores = { ...gameState.playerScores };
              delete newScores[uid];

              const newState = {
                ...gameState,
                players: newPlayers,
                playerNames: newNames,
                playerScores: newScores,
                hostSeatIndex: localSeat === gameState.hostSeatIndex ? newPlayers.findIndex(p => p && !p.startsWith('mock_')) : gameState.hostSeatIndex,
                version: (gameState.version || 0) + 1
              };
              if (newState.hostSeatIndex === -1) newState.hostSeatIndex = 0;
              console.log("Updating game state for remaining players");
              await updateDoc(doc(db, 'domino_games', gameId), { 
                  state: newState,
                  players: newPlayers
              });
            }
          }
        }
      } catch (err) {
        console.error("Background leave error:", err);
      }
    })();
  };

  const deleteMatch = () => {
    if (window.confirm("Are you sure you want to dismantle this arena?")) {
      onBack(); // Responsive first
      deleteDoc(doc(db, 'domino_games', gameId)).catch(err => console.error("Error deleting match:", err));
    }
  };

  if (gameState.status === 'waiting') {
      return (
          <div className="flex flex-col h-[100dvh] overflow-hidden bg-neutral-950 px-4 md:px-0">
             <div className="flex items-center justify-between py-4 shrink-0 px-4 relative z-[100]">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLeave();
                  }} 
                  className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest cursor-pointer py-2"
                >
                   <ChevronLeft size={20} /> <span className="short-hide">Leave Arena</span>
                </button>
             </div>
             
             <div className="flex-1 flex flex-col items-center justify-center -mt-10 overflow-hidden pb-8">
                 <div className="bg-neutral-900 border border-neutral-800 p-6 sm:p-8 rounded-[24px] sm:rounded-[32px] w-full max-w-sm shadow-2xl text-center">
                     <Users size={32} className="mx-auto mb-4 text-emerald-500 sm:w-12 sm:h-12" />
                     <h2 className="text-xl sm:text-3xl font-bold mb-1 text-white uppercase tracking-tight">Recruiting</h2>
                     <p className="text-xs sm:text-sm text-neutral-500 mb-6 font-medium">TABLE LIMIT: {gameState.targetScore} PTS</p>
                     
                     {gameState.mode === 'team' ? (
                        <div className="flex flex-col gap-6 w-full mb-8">
                            {[
                                { name: 'Team A', indices: [0, 2], color: 'emerald' },
                                { name: 'Team B', indices: [1, 3], color: 'blue' }
                            ].map((team) => (
                                <div key={team.name} className="flex flex-col gap-2">
                                    <div className={`text-[10px] font-black uppercase tracking-widest text-left px-1 ${team.color === 'emerald' ? 'text-emerald-500' : 'text-blue-400'}`}>
                                        {team.name}
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        {team.indices.map((i) => {
                                            const pid = gameState.players[i];
                                            const isMySeat = pid === user?.uid;
                                            const colorClass = team.color === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-blue-500/30 bg-blue-500/5';
                                            const activeColorClass = team.color === 'emerald' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-blue-500 ring-2 ring-blue-500/20';

                                            return (
                                                <div 
                                                    key={i} 
                                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                                                        pid 
                                                            ? `bg-neutral-800 ${isMySeat ? activeColorClass : 'border-neutral-700'}` 
                                                            : `${colorClass} border-dashed hover:border-white/20 cursor-pointer`
                                                    }`}
                                                    onClick={() => !pid && joinGame(i)} // Removed localSeatIndex === -1 check to allow switching
                                                >
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shrink-0 overflow-hidden ${
                                                        pid ? (team.color === 'emerald' ? 'bg-emerald-600' : 'bg-blue-600') : 'bg-neutral-800 text-neutral-600'
                                                    }`}>
                                                        {pid && gameState.playerPhotos?.[pid] ? (
                                                            <img src={gameState.playerPhotos[pid]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                        ) : (
                                                            pid ? (gameState.playerNames[pid]?.charAt(0) || 'U') : (i + 1)
                                                        )}
                                                    </div>
                                                    <div className="flex-1 text-left font-medium text-white text-sm sm:text-base">
                                                        {pid ? (
                                                            <div className="flex items-center justify-between">
                                                                <span className="truncate">{gameState.playerNames[pid]}</span>
                                                                {isMySeat && <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest ml-2">You</span>}
                                                            </div>
                                                        ) : (
                                                            <span className="text-neutral-500 italic text-sm">Empty Slot</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                     ) : (
                        <div className="flex flex-col gap-3 mb-8 w-full">
                            {Array.from({ length: gameState.seats }).map((_, i) => {
                                const pid = gameState.players[i];
                                const isMySeat = pid === user?.uid;
                                
                                return (
                                    <div 
                                        key={i} 
                                        className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                                            pid 
                                                ? 'bg-neutral-800 border-neutral-700' 
                                                : 'bg-neutral-900/50 border-neutral-800 border-dashed hover:border-emerald-500/50 cursor-pointer'
                                        }`}
                                        onClick={() => !pid && joinGame(i)}
                                    >
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white overflow-hidden ${
                                            pid ? 'bg-neutral-700' : 'bg-neutral-800 text-neutral-600'
                                        }`}>
                                            {pid && gameState.playerPhotos?.[pid] ? (
                                                <img src={gameState.playerPhotos[pid]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                            ) : (
                                                pid ? (gameState.playerNames[pid]?.charAt(0) || 'U') : (i + 1)
                                            )}
                                        </div>
                                        <div className="flex-1 text-left font-medium text-white">
                                            {pid ? (
                                                <div className="flex items-center justify-between">
                                                    <span>{gameState.playerNames[pid]}</span>
                                                    {isMySeat && <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">You</span>}
                                                </div>
                                            ) : (
                                                <span className="text-neutral-600 italic text-sm">Join Seat {i + 1}</span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                     )}
                     
                     {localSeatIndex === -1 && gameState.players.filter(Boolean).length < gameState.seats && (
                         <button onClick={joinGame} className="w-full px-6 py-4 bg-emerald-600 rounded-xl text-white font-bold hover:bg-emerald-500 transition-all text-lg shadow-lg">
                             Join the Match
                         </button>
                     )}
                     
                     {isHost && gameState.players.filter(Boolean).length < gameState.seats && (
                         <button onClick={fillWithBots} className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-white text-black rounded-xl font-bold hover:bg-neutral-200 transition-all text-lg shadow-lg">
                             <Play size={20} /> Start match with Bots
                         </button>
                     )}

                     {gameState.players.filter(Boolean).length === gameState.seats && (
                         <div className="mt-4">
                             {countdown !== null && (
                                 <p className="text-emerald-500 font-bold mb-4 animate-pulse">
                                     Starting in {countdown}s...
                                 </p>
                             )}
                             {localSeatIndex !== -1 && (
                                 <button onClick={startGame} className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition-all text-lg shadow-lg">
                                     <Play size={20} /> Start Now
                                 </button>
                             )}
                         </div>
                     )}
                 </div>
             </div>
          </div>
      );
  }

  const handleAddFriend = async (targetId) => {
    if (targetId.startsWith('mock_')) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', targetId));
      if (userDoc.exists()) {
        await sendRequest({ uid: targetId, ...userDoc.data() });
        setSentRequests(prev => new Set([...prev, targetId]));
      }
    } catch (err) {
      console.error("Error adding friend:", err);
    }
  };

  const hand = localSeatIndex !== -1 && gameState.tiles ? gameState.tiles[localSeatIndex] : [];
  const openEnds = gameState.chain ? getOpenEnds(gameState.chain) : { left: null, right: null };
  const isFirstRound = (gameState.roundNumber || 1) === 1;
  const isFirstMoveOfRound = (gameState.chain || []).length === 0;
  const validMoves = hand ? getValidMoves(hand, openEnds, isFirstMoveOfRound, isFirstRound) : [];
  // Ensure we are not showing "My Turn" if the game is over
  const isMyTurn = gameState.currentTurn === localSeatIndex && gameState.status === 'active';

  const DominoDots = ({ value, orientation }) => {
    const isV = orientation === 'v';
    const getPips = () => {
        const pips = [];
        const r = 7.6; // Matched board ratio (3.8/32 * 64)
        if (value === 1 || value === 3 || value === 5) pips.push({ r, cx: 32, cy: 32 });
        if (value > 1) {
            pips.push({ r, cx: 16, cy: 16 });
            pips.push({ r, cx: 48, cy: 48 });
        }
        if (value > 3) {
            pips.push({ r, cx: 48, cy: 16 });
            pips.push({ r, cx: 16, cy: 48 });
        }
        if (value === 6) {
            if (isV) {
                pips.push({ r, cx: 16, cy: 32 });
                pips.push({ r, cx: 48, cy: 32 });
            } else {
                pips.push({ r, cx: 32, cy: 16 });
                pips.push({ r, cx: 32, cy: 48 });
            }
        }
        return pips;
    };

    return (
      <svg viewBox="0 0 64 64" className="w-full h-full overflow-visible" style={{ shapeRendering: 'geometricPrecision' }}>
          <defs>
              <radialGradient id="pipGradient" cx="30%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#222222" />
                  <stop offset="100%" stopColor="#080808" />
              </radialGradient>
              {/* Filter for subtle pip depth */}
              <filter id="pipDepth" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="-0.5" dy="-0.5" stdDeviation="0.4" floodColor="white" floodOpacity="0.1" />
                  <feDropShadow dx="0.5" dy="0.5" stdDeviation="0.4" floodColor="black" floodOpacity="0.4" />
              </filter>
          </defs>
          {getPips().map((p, i) => (
              <g key={i}>
                <circle 
                  cx={p.cx} 
                  cy={p.cy} 
                  r={p.r} 
                  fill="url(#pipGradient)" 
                  filter="url(#pipDepth)"
                />
                {/* Micro-highlight for 'shiny' carved feel */}
                <circle 
                  cx={p.cx - 1.2} 
                  cy={p.cy - 1.2} 
                  r={p.r * 0.3} 
                  fill="rgba(255,255,255,0.08)" 
                />
              </g>
          ))}
      </svg>
    );
  };

  return (
      <div className="flex flex-col h-[100dvh] bg-neutral-950 overflow-hidden">
        <div className="flex items-center justify-between py-1.5 sm:py-3 px-3 sm:px-4 overflow-hidden shrink-0 border-b border-neutral-800 relative z-[100]">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handleLeave();
            }} 
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors shrink-0 text-xs sm:text-sm font-bold uppercase tracking-widest cursor-pointer py-1"
          >
            <ChevronLeft size={20} /> <span className="short-hide">Leave</span>
          </button>

          <button 
            onClick={(e) => {
              e.stopPropagation();
              const newMuted = soundManager.toggleMute();
              setMuted(newMuted);
            }} 
            className="flex items-center justify-center p-2 text-neutral-400 hover:text-white transition-colors bg-neutral-900 border border-neutral-800 rounded-full"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          
          <div className="flex flex-col items-end gap-1 overflow-hidden ml-2 sm:ml-4">
            {gameState.mode === 'team' ? (
               <div className="flex flex-col items-end gap-1">
                 <div className="flex bg-neutral-900 rounded-lg sm:rounded-xl border border-neutral-800 p-0.5 divide-x divide-neutral-800">
                   <div className={`px-1.5 py-0.5 sm:px-4 sm:py-2 text-[8px] sm:text-xs font-bold shrink-0 ${userTeam === 'teamA' ? 'text-emerald-400' : 'text-neutral-400'}`}>
                     Team A: <span className="text-white ml-0.5">{gameState.scores?.teamA || 0}</span>
                   </div>
                   <div className={`px-1.5 py-0.5 sm:px-4 sm:py-2 text-[8px] sm:text-xs font-bold shrink-0 ${userTeam === 'teamB' ? 'text-emerald-400' : 'text-neutral-400'}`}>
                     Team B: <span className="text-white ml-0.5">{gameState.scores?.teamB || 0}</span>
                   </div>
                 </div>
                 <div className="text-[7px] sm:text-[9px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                   Target: {gameState.targetScore}
                 </div>
               </div>
            ) : (
               <div className="flex flex-col items-end gap-1">
                 <div className="flex bg-neutral-900 rounded-lg sm:rounded-xl border border-neutral-800 p-0.5">
                    <div className="flex overflow-x-auto no-scrollbar max-w-[120px] sm:max-w-md">
                        {gameState.players.map((pid) => pid && (
                           <div key={pid} className={`px-1.5 py-0.5 sm:px-4 sm:py-2 text-[8px] sm:text-xs font-bold border-r border-neutral-800 last:border-0 whitespace-nowrap shrink-0 ${pid === user?.uid ? 'text-emerald-400' : 'text-neutral-400'}`}>
                              {gameState.playerNames?.[pid]?.split(' ')[0]}: <span className="text-white ml-0.5">{gameState.playerScores?.[pid] || 0}</span>
                           </div>
                        ))}
                    </div>
                 </div>
                 <div className="text-[7px] sm:text-[9px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                   Target: {gameState.targetScore}
                 </div>
               </div>
            )}
          </div>
        </div>

      <div className="flex-1 bg-[#1a472a] border border-[#2a5a3a] sm:rounded-3xl relative overflow-hidden flex flex-col shadow-[inset_0_2px_60px_rgba(0,0,0,0.7)]">
        <div className="absolute inset-0 opacity-[0.4] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffffff 0.8px, transparent 0.8px)', backgroundSize: '64px 64px' }}></div>
        <div className="absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-white/10 pointer-events-none"></div>
        <div className="absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.4)] pointer-events-none"></div>
        <div className="relative flex-1 shrink-0 overflow-hidden">
            <GameBoard 
               activePlacementTile={activePlacementTile} 
               onPlacementSelect={(end) => {
                  submitMove(activePlacementTile.tile, end);
                  setActivePlacementTile(null);
               }} 
            />
            
            {/* Targeting instruction removed per user request */}

            {/* Starter Selection for New Round */}
            {gameState.status === 'active' && gameState.chain?.length === 0 && gameState.currentTurn === -1 && (
                <div className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
                    <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl">
                        <Trophy className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                        <h3 className="text-xl sm:text-2xl font-black text-white mb-2 uppercase tracking-tighter">Round Starting</h3>
                        
                        {(() => {
                           const myTeam = localSeatIndex % 2;
                           const amOnWinnerTeam = (gameState.mode === 'team') 
                               ? (myTeam === gameState.lastWinnerTeam) 
                               : (localSeatIndex === gameState.lastWinner);
                           
                           const winningTeamMembers = gameState.players.map((p, i) => i).filter(i => {
                               if (gameState.mode === 'team') return (i % 2) === gameState.lastWinnerTeam;
                               return i === gameState.lastWinner;
                           });

                           const humanWinningTeamMembers = winningTeamMembers.filter(i => gameState.players[i] && !gameState.seatsData?.[i]?.isAI);
                           const needsConsensus = humanWinningTeamMembers.length > 1;

                           return (
                             <>
                                <p className="text-neutral-400 text-sm sm:text-base mb-8">
                                    {amOnWinnerTeam 
                                        ? (needsConsensus ? "Discuss with your partner! Both must select the same starter." : "You won the last round! Choose who starts.")
                                        : (gameState.mode === 'team' ? `Waiting for Team ${gameState.lastWinnerTeam === 0 ? 'A' : 'B'} to decide...` : `Waiting for ${gameState.playerNames[gameState.players[gameState.lastWinner]]} to decide...`)
                                    }
                                </p>
                                
                                <div className="flex flex-col gap-3 w-full">
                                   {winningTeamMembers.map((idx) => {
                                       const pid = gameState.players[idx];
                                       const isMeRow = idx === localSeatIndex;
                                       const votesForThisPlayer = Object.entries(gameState.starterVotes || {})
                                           .filter(([voterIdx, choiceIdx]) => choiceIdx === idx)
                                           .map(([voterIdx]) => parseInt(voterIdx));
                                       
                                       const myVote = (gameState.starterVotes || {})[localSeatIndex];
                                       const isMySelection = myVote === idx;

                                       return (
                                           <button
                                               key={idx}
                                               disabled={!amOnWinnerTeam && !isHost}
                                               onClick={() => claimStart(idx)}
                                               className={`w-full py-4 px-6 rounded-2xl font-bold flex flex-col items-center gap-1 transition-all border ${
                                                   isMySelection 
                                                       ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg' 
                                                       : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-500 disabled:opacity-80'
                                               } ${!amOnWinnerTeam && !isHost ? 'cursor-default' : 'hover:scale-[1.02] active:scale-95'}`}
                                           >
                                               <div className="flex w-full items-center justify-between">
                                                   <span className="flex items-center gap-2">
                                                       {gameState.playerNames[pid]} 
                                                       {isMeRow && <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] uppercase font-black">You</span>}
                                                   </span>
                                                   {amOnWinnerTeam && !isMySelection && <ChevronRight size={20} className="text-neutral-500" />}
                                                   {isMySelection && <Check size={20} className="text-white" />}
                                               </div>
                                               
                                               {/* Vote indicators */}
                                               {votesForThisPlayer.length > 0 && (
                                                   <div className="flex gap-1 mt-1 w-full justify-start">
                                                       {votesForThisPlayer.map(voterIdx => (
                                                           <div key={voterIdx} className="text-[8px] bg-black/30 px-2 py-0.5 rounded text-white/70">
                                                               {voterIdx === localSeatIndex ? "Your vote" : `${gameState.playerNames[gameState.players[voterIdx]]?.split(' ')[0]}'s vote`}
                                                           </div>
                                                       ))}
                                                   </div>
                                               )}
                                           </button>
                                       );
                                   })}
                                </div>
                             </>
                           );
                        })()}
                    </div>
                </div>
            )}
         </div>

        <OpponentArea 
           seats={gameState.players || []} 
           localSeatIndex={localSeatIndex} 
           turn={gameState.currentTurn}
           playerNames={gameState.playerNames || {}}
           playerPhotos={gameState.playerPhotos || {}}
           playerHandSizes={gameState.players.map((_, i) => gameState.tiles?.[i]?.length || 0)}
           onAddFriend={handleAddFriend}
           sentRequests={sentRequests}
           friends={friends}
           isTeamMode={gameState.mode === 'team'}
           userTeam={userTeam}
           status={gameState.status}
           allTiles={gameState.tiles}
        />
      </div>

      {['locked', 'finished', 'game_over'].includes(gameState.status) && (
         <div className="fixed bottom-[max(20px,env(safe-area-inset-bottom)+12px)] left-1/2 transform -translate-x-1/2 bg-neutral-900/95 backdrop-blur-md text-white font-bold text-[10px] sm:text-sm px-5 sm:px-7 py-2 sm:py-2.5 rounded-full uppercase tracking-widest shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[70] border border-amber-500/40 transition-all duration-700 animate-in fade-in slide-in-from-bottom-4">
            Your Remaining Points: <span className="text-amber-500 ml-1">{gameState.tiles?.[localSeatIndex] ? pipTotal(gameState.tiles[localSeatIndex]) : 0}</span>
         </div>
      )}

        <div className={`
          h-[30vh]
          landscape:h-auto landscape:max-h-[30vh] landscape:py-4
          bg-[#0d1a10] border-t border-[#1a2e1d] flex flex-col items-center justify-center 
          px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] sm:p-4 relative shrink-0 transition-all duration-500 
          ${gameState.status !== 'active' ? 'translate-y-full' : 'translate-y-0'}
        `}>
            {isMyTurn && !activePlacementTile && gameState.status === 'active' && <div className="absolute top-0 transform -translate-y-1/2 bg-emerald-500 text-black font-bold text-[8px] sm:text-xs px-3 sm:px-4 py-0.5 sm:py-1 rounded-full uppercase tracking-widest shadow-xl z-[60]">Your Turn</div>}
            {/* Targeting badge removed per user request */}
           
           <div className={`flex w-full justify-center items-center px-1 sm:px-4 h-full relative ${activePlacementTile ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                {(() => {
                   const row1 = hand.slice(0, 9);
                   const remaining = hand.slice(9);
                   const otherRows = [];
                   for (let i = 0; i < remaining.length; i += 8) {
                       otherRows.push(remaining.slice(i, i + 8));
                   }
                   const allRows = [row1, ...otherRows].filter(r => r.length > 0);

                   let tileWidth = 'w-8 sm:w-16'; 
                   let tileHeight = 'h-16 sm:h-32';
                   if (hand.length > 9) {
                     tileWidth = 'w-7 sm:w-14';
                     tileHeight = 'h-14 sm:h-28';
                   }
                   if (hand.length > 18) {
                      tileWidth = 'w-6 sm:w-12';
                      tileHeight = 'h-12 sm:h-24';
                   }
                   
                   return (
                       <div className="py-2 overflow-y-auto no-scrollbar flex flex-col items-center justify-center gap-2 w-full h-full">
                           {allRows.map((row, rowIdx) => (
                               <div key={rowIdx} className="flex flex-wrap gap-1 sm:gap-4 justify-center items-center w-full">
                                   {row.map((tile) => {
                                      const validTileMoves = validMoves.filter(m => m.tile.id === tile.id);
                                      const isPlayable = isMyTurn && validTileMoves.length > 0;
                                      
                                      return (
                                          <div 
                                             key={tile.id}
                                             onClick={() => {
                                                 if (isPlayable) {
                                                     const sameValueEnds = validTileMoves.length === 2 && openEnds.left === openEnds.right;
                                                     if (validTileMoves.length === 1 || validTileMoves[0].end === 'both' || sameValueEnds) {
                                                         submitMove(validTileMoves[0].tile, validTileMoves[0].end);
                                                     } else {
                                                         setActivePlacementTile({ tile: validTileMoves[0].tile, moves: validTileMoves });
                                                     }
                                                 }
                                             }}
                                             className={`
                                                relative flex-shrink-0 
                                                ${tileWidth} ${tileHeight}
                                                landscape:h-full landscape:aspect-[1/2] landscape:w-auto
                                                bg-[#fcfaf2] rounded-md sm:rounded-[18px] 
                                                shadow-[0_12px_28px_rgba(0,0,0,0.65),inset_0_-1.5px_2.5px_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.3)] 
                                                border border-black/80 flex flex-col justify-between p-2 sm:p-3 cursor-pointer transition-all 
                                                z-0
                                                ${isPlayable ? 'hover:-translate-y-4 sm:hover:-translate-y-10 sm:hover:scale-110 !border-white/90 shadow-[0_0_30px_rgba(255,255,255,0.5)] active:scale-95 z-10' : 'opacity-85 grayscale-[0.05] border-neutral-500'}
                                             `}
                                          >
                                             {/* Physical Depth & Bevels */}
                                             <div className="absolute inset-0 bg-gradient-to-br from-white/95 via-transparent to-black/10 rounded-[inherit] pointer-events-none" />
                                             <div className="absolute inset-[1.5px] border border-white/90 rounded-md sm:rounded-[17px] pointer-events-none" />
                                             
                                             <div className="relative z-10 flex-1 w-full"><DominoDots value={tile.left} orientation="v" /></div>
                                             
                                             {/* Inset Physical Divider */}
                                             <div className="relative z-10 w-full h-[2.5px] bg-[#121212] my-1 sm:my-2 shadow-[0_1px_0_rgba(255,255,255,0.4)]" />
                 
                                             <div className="relative z-10 flex-1 w-full"><DominoDots value={tile.right} orientation="v" /></div>
                                             
                                             {isPlayable && <div className="absolute inset-0 rounded-md sm:rounded-[18px] ring-[5px] ring-white/40 ring-inset pointer-events-none animate-pulse" />}
                                          </div>
                                      )
                                   })}
                               </div>
                           ))}
                       </div>
                   );
                })()}
                
                {isMyTurn && validMoves.length === 0 && (
                    <div className="flex-shrink-0 ml-2">
                        <button 
                            onClick={() => {
                                if (gameState.boneyard && gameState.boneyard.length > 0) {
                                    submitDraw();
                                } else {
                                    submitPass();
                                }
                            }}
                            className="px-4 sm:px-6 py-4 bg-emerald-600 rounded-xl text-white font-black text-xs sm:text-base shadow-xl active:scale-95 transition-transform border border-emerald-400/20"
                        >
                            {gameState.boneyard && gameState.boneyard.length > 0 ? "Draw" : "Pass"}
                        </button>
                    </div>
                )}
            </div>
          </div>



       {showResults && (gameState.status === 'finished' || gameState.status === 'locked' || gameState.status === 'game_over') && (
           <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center backdrop-blur-md px-4 overflow-y-auto pt-10 pb-[calc(env(safe-area-inset-bottom)+40px)]">
               <motion.div 
                   initial={{ scale: 0.95, opacity: 0 }} 
                   animate={{ scale: 1, opacity: 1 }} 
                   className="text-center p-6 sm:p-10 bg-neutral-900 border border-neutral-800 rounded-[32px] shadow-2xl max-w-sm sm:max-w-md w-full my-auto shrink-0"
               >
                   <div className="mb-4 flex justify-center">
                       {gameState.status === 'game_over' ? (
                           <Trophy size={48} sm:size={64} className="text-yellow-500" />
                       ) : (
                           <div className="w-12 h-12 sm:w-16 sm:h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500">
                               <Award size={24} sm:size={32} />
                           </div>
                       )}
                   </div>
                   
                   <h2 className="text-2xl sm:text-4xl font-black text-white mb-1 tracking-tighter">
                       {gameState.status === 'game_over' ? 'Season Winner!' : (gameState.status === 'locked' ? 'Blocked!' : 'Domino!')}
                   </h2>
                   
                   <div className="text-base sm:text-xl text-emerald-400 font-bold mb-4">
                       {gameState.status === 'game_over' ? (
                           gameState.mode === 'team' ? (
                               gameState.gameWinner === 'teamA' ? 'Team A Wins!' : 'Team B Wins!'
                           ) : (
                               `${gameState.playerNames[gameState.gameWinner] || 'Host'} Claims Victory!`
                           )
                       ) : (
                           gameState.winner === localSeatIndex ? 'You Won!' : 
                           (gameState.winner !== -1 ? `${gameState.playerNames[gameState.players[gameState.winner]]} Won!` : 'Tie Game!')
                       )}
                   </div>

                   {roundRestartCountdown !== null && gameState.status !== 'game_over' && (
                       <div className="flex flex-col items-center">
                           <div className="mb-2 text-emerald-500 font-bold animate-pulse text-sm">
                               Next round starting in {roundRestartCountdown}s...
                           </div>
                       </div>
                   )}

                   <div className="bg-neutral-800/50 rounded-2xl p-3 sm:p-4 mb-6 border border-neutral-700/50 flex flex-col items-center">
                       <div className="text-[8px] sm:text-[9px] uppercase font-black tracking-[0.2em] text-neutral-500 mb-1">Points Gained</div>
                       <div className="text-3xl sm:text-4xl font-black text-white">+{gameState.lastRoundScore || 0}</div>
                   </div>

                   <div className="flex flex-col gap-3 sm:gap-4">
                       {gameState.status !== 'game_over' && localSeatIndex !== -1 && (
                           <button 
                               onClick={() => handleNextRound()} 
                               className="w-full flex items-center justify-center gap-2 sm:gap-3 px-6 py-4 sm:px-8 sm:py-5 bg-emerald-500 text-black rounded-2xl font-black hover:bg-emerald-400 transition-all text-lg sm:text-xl shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                           >
                               <RotateCcw size={20} sm:size={24} />
                               Next Round
                           </button>
                       )}
                       <button 
                           onClick={(e) => {
                             e.stopPropagation();
                             handleLeave();
                           }} 
                           className="w-full px-6 py-4 sm:px-8 sm:py-5 bg-neutral-800 text-white rounded-2xl font-black hover:bg-neutral-700 transition-all text-lg sm:text-xl border border-neutral-700 cursor-pointer"
                       >
                           {gameState.status === 'game_over' ? 'Leave Match' : 'Return to Lobby'}
                       </button>
                   </div>
               </motion.div>
           </div>
       )}
     </div>
  );
}
