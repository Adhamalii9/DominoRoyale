import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError } from '../firebase';
import { GameState } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Users, Clock, ArrowRight, Settings, Bell, X, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { User } from 'firebase/auth';
import FriendsList from './FriendsList';
import { useInvites } from '../hooks/useInvites';

interface Props {
  onSelectGame: (id: string) => void;
  user: User;
}

export default function Lobby({ onSelectGame, user }: Props) {
  const [games, setGames] = useState<GameState[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [gameMode, setGameMode] = useState('1v1'); 
  const [targetScore, setTargetScore] = useState(100);
  const [showFriends, setShowFriends] = useState(false);
  
  const { invites, acceptInvite, declineInvite, sendInvite } = useInvites(user);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    // Fetch games that are waiting for players
    const q = query(
      collection(db, 'domino_games'),
      where('status', '==', 'waiting')
    );
      const unsubscribe = onSnapshot(q, 
        (snapshot) => {
          const g = snapshot.docs.map(doc => {
              const data = doc.data();
              const status = data.status || (data.state && data.state.status);
              const players = (data.state && data.state.players) || data.players || [];
              const seats = (data.state && data.state.seats) || data.seats || 2;
              const playerNames = (data.state && data.state.playerNames) || data.playerNames || {};
              const playerPhotos = (data.state && data.state.playerPhotos) || data.playerPhotos || {};
              
              return { 
                id: doc.id, 
                status,
                players,
                seats,
                playerNames,
                playerPhotos,
                ...(data.state || {}) 
              } as GameState;
          }).filter(game => {
              if (!game || !game.players) return false;
              const realPlayers = game.players.filter(pid => pid && !pid.startsWith('mock_'));
              const isFull = game.players.filter(Boolean).length >= (game.seats || 2);
              const isWaiting = game.status === 'waiting';
              
              return isWaiting && realPlayers.length > 0 && !isFull;
          });
          setGames(g);
          setLoading(false);
        }, 
        (err) => {
          console.error("Lobby snapshot error:", err);
          handleFirestoreError(err, 'list', 'domino_games');
          setLoading(false);
        }
      );
    return unsubscribe;
  }, [user]);

  const createGame = async () => {
    if (!user) return null;
    setIsCreating(true);
    
    let maxPlayers = 2;
    if (gameMode === '1v2') maxPlayers = 3;
    if (gameMode === '1v3' || gameMode === 'team') maxPlayers = 4;

    try {
      const ps = Array(maxPlayers).fill('');
      ps[0] = user.uid;
      
      const docRef = await addDoc(collection(db, 'domino_games'), {
        status: 'waiting',
        seats: maxPlayers,
        players: ps,
        state: {
          status: 'waiting',
          mode: gameMode,
          seats: maxPlayers,
          players: ps,
          playerNames: { [user.uid]: user.displayName || user.email || 'Player 1' },
          playerPhotos: { [user.uid]: user.photoURL || '' },
          seatsData: { 0: { isAI: false } },
          hostSeatIndex: 0,
          currentTurn: 0,
          chain: [],
          boneyard: [],
          tiles: Object.fromEntries(Array(maxPlayers).fill(0).map((_, i) => [i, []])),
          targetScore,
          version: 1,
          scores: { teamA: 0, teamB: 0 },
          playerScores: { [user.uid]: 0 },
          createdAt: Date.now()
        }
      });
      onSelectGame(docRef.id);
      return docRef.id;
    } catch (err) {
      console.error("Create game error:", err);
      return null;
    } finally {
      setIsCreating(false);
      setShowConfig(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6 sm:space-y-8 overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 shrink-0">
        <div>
          <h2 className="text-2xl sm:text-4xl font-medium mb-2 sm:mb-3 text-white tracking-tight">Active Arenas</h2>
          <p className="text-xs sm:text-base text-neutral-500 font-medium font-serif italic uppercase tracking-widest">Domino Royale Arena Lobby</p>
        </div>
        
        <div className="flex gap-2 sm:gap-4 w-full md:w-auto">
          <button 
            onClick={() => setShowFriends(!showFriends)}
            className={`relative flex items-center justify-center gap-2 px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold transition-all border ${showFriends ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-neutral-800 text-white border-neutral-700 hover:bg-neutral-700'}`}
          >
            <Users size={20} />
          </button>
          <button 
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center justify-center gap-2 px-4 sm:px-6 py-3 sm:py-4 bg-neutral-800 text-white rounded-xl sm:rounded-2xl font-bold hover:bg-neutral-700 transition-all border border-neutral-700"
          >
            <Settings size={20} />
          </button>
          <button 
            onClick={createGame}
            disabled={isCreating}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-emerald-600 text-white rounded-xl sm:rounded-2xl font-bold hover:bg-emerald-500 transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-50"
          >
            <Plus size={20} />
            <span className="text-sm sm:text-base">{isCreating ? 'Deploying...' : 'Deploy Arena'}</span>
          </button>
        </div>
      </div>

      {invites.length > 0 && (
        <div className="flex flex-col gap-3 shrink-0">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-2 px-1">
            <Bell size={12} />
            Battle Invitations
          </h4>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {invites.map(invite => (
              <motion.div 
                key={invite.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-4 bg-neutral-900 border border-amber-500/30 p-3 rounded-2xl min-w-[280px]"
              >
                <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center font-bold">
                  {invite.fromName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-neutral-400 font-medium truncate">{invite.fromName}</p>
                  <p className="text-sm text-white font-bold truncate">Invite to Match</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => declineInvite(invite)} className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-500 transition-colors">
                    <X size={18} />
                  </button>
                  <button onClick={async () => onSelectGame(await acceptInvite(invite))} className="p-2 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400 transition-colors">
                    <Check size={18} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {showConfig && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="p-4 sm:p-8 bg-neutral-900 rounded-2xl sm:rounded-[32px] border border-neutral-800 flex flex-col sm:flex-row flex-wrap gap-6 sm:gap-8 shrink-0 overflow-y-auto no-scrollbar max-h-48">
          <div className="w-full sm:w-auto">
            <label className="block text-[10px] sm:text-sm font-bold text-neutral-400 mb-2 sm:mb-3 uppercase tracking-widest leading-none">Game Mode</label>
            <div className="flex flex-wrap gap-2 sm:gap-4">
              {['1v1', '1v2', '1v3', 'team'].map(m => (
                <button
                  key={m}
                  onClick={() => setGameMode(m)}
                  className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold transition-all ${gameMode === m ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
                >
                  {m === 'team' ? '2v2 Team' : m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <label className="block text-[10px] sm:text-sm font-bold text-neutral-400 mb-2 sm:mb-3 uppercase tracking-widest leading-none">Target Score</label>
            <div className="flex gap-2 sm:gap-4">
              {[50, 100, 150].map(s => (
                <button
                  key={s}
                  onClick={() => setTargetScore(s)}
                  className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold transition-all ${targetScore === s ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row gap-8">
        <div className={`flex-1 overflow-y-auto no-scrollbar pb-10 ${showFriends ? 'hidden lg:block' : ''}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
          {loading ? (
            <div className="col-span-full py-20 sm:py-32 flex flex-col items-center justify-center border-2 border-dashed border-neutral-800 rounded-[32px] sm:rounded-[40px] bg-neutral-900/20">
               <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
               <p className="text-xl sm:text-2xl text-neutral-600 font-medium tracking-tight uppercase tracking-[0.2em]">Scouting Arenas...</p>
            </div>
          ) : games.length === 0 ? (
            <div className="col-span-full py-20 sm:py-32 flex flex-col items-center justify-center border-2 border-dashed border-neutral-800 rounded-[32px] sm:rounded-[40px] bg-neutral-900/20">
              <Users size={48} className="mb-4 sm:mb-6 text-neutral-800" />
              <p className="text-xl sm:text-2xl text-neutral-600 font-medium tracking-tight">No active tables found.</p>
              <p className="mt-2 text-neutral-500 text-sm">Real-time updates are active</p>
            </div>
          ) : (
            games.map((game, idx) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => onSelectGame(game.id)}
              className="group bg-neutral-900 p-6 sm:p-8 rounded-[24px] sm:rounded-[32px] border border-neutral-800 hover:border-emerald-500/50 transition-all cursor-pointer shadow-lg hover:shadow-emerald-500/5 flex flex-col justify-between h-64 sm:h-72 relative overflow-hidden"
            >
              <div>
                <div className="flex justify-between items-start mb-6">
                  <div className={`px-2 py-1 rounded-lg text-[8px] sm:text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] ${game.status === 'waiting' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                    {game.status === 'waiting' ? 'Recruiting' : 'In Battle'}
                  </div>
                  <div className="flex items-center gap-1.5 text-neutral-500 text-[10px] font-black uppercase tracking-widest">
                    <Clock size={14} />
                    {formatDistanceToNow(game.lastMoveAt || Date.now())}
                  </div>
                </div>
                
                <h3 className="text-2xl font-medium mb-2 text-white tracking-tight">
                  <span className="text-emerald-500">{game.mode === 'team' ? '2v2 Team' : game.mode?.toUpperCase()}</span>
                </h3>
                <p className="text-sm text-neutral-500 mb-5">Target: {game.targetScore}</p>

                <div className="flex -space-x-3">
                  {game.players.filter(Boolean).map((pid) => (
                    <div key={`p-${pid}`} className="w-10 h-10 rounded-xl bg-neutral-800 border-2 border-neutral-900 flex items-center justify-center text-xs font-bold text-neutral-300 shadow-lg overflow-hidden">
                      {game.playerPhotos?.[pid] ? (
                        <img src={game.playerPhotos[pid]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        (game.playerNames?.[pid] || 'U').charAt(0)
                      )}
                    </div>
                  ))}
                  {[...Array((game.seats || 4) - game.players.filter(Boolean).length)].map((_, i) => (
                    <div key={`empty-${i}`} className="w-10 h-10 rounded-xl bg-neutral-800/30 border-2 border-neutral-900 border-dashed flex items-center justify-center" />
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center mt-auto">
                <div className="flex flex-col">
                  <span className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">Squad Size</span>
                  <span className="text-lg font-bold text-white leading-tight">
                    {game.players ? game.players.filter(Boolean).length : 0}<span className="text-neutral-500">/{game.seats || 4}</span>
                  </span>
                </div>
                <div className="w-12 h-12 bg-neutral-800 flex items-center justify-center rounded-2xl group-hover:bg-emerald-500 group-hover:text-black transition-all">
                  <ArrowRight size={24} />
                </div>
              </div>
            </motion.div>
          ))
          )}
        </div>
      </div>

      {showFriends && (
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full md:w-80 lg:w-96 h-full shrink-0"
        >
          <FriendsList 
            user={user} 
            onInvite={async (friendId) => {
              const gid = await createGame();
              if (gid) {
                await sendInvite(friendId, gid);
                alert("Arena ready. Invite sent!");
              }
            }}
          />
        </motion.div>
      )}
    </div>
  </div>
  );
}
