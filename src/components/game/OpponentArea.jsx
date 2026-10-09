import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { UserPlus, Check } from 'lucide-react';
import { pipTotal } from '../../engine/tiles';

export default function OpponentArea({ 
  seats, 
  localSeatIndex, 
  turn, 
  playerNames, 
  playerPhotos,
  playerHandSizes,
  onAddFriend,
  sentRequests,
  friends,
  userTeam,
  isTeamMode,
  status,
  allTiles
}) {
   const [touchedSeats, setTouchedSeats] = useState({});
   const timeoutRefs = React.useRef({});
   
   const isLocked = ['locked', 'finished', 'game_over'].includes(status);
   
   useEffect(() => {
     return () => {
       Object.values(timeoutRefs.current).forEach(clearTimeout);
     };
   }, []);

   const getRelativePosition = (idx) => {
     if (localSeatIndex === -1) return idx; // Spectator view
     return (idx - localSeatIndex + 4) % 4;
   };

   const isFriend = (pid) => friends?.some(f => f.id === pid);
   const hasSent = (pid) => sentRequests.has(pid);

   return (
     <div className="absolute inset-0 pointer-events-none overflow-hidden z-[50]">
       {seats.map((pid, idx) => {
         const rel = getRelativePosition(idx);
         // Don't show local player in the opponent area if they are at the bottom
         if (localSeatIndex !== -1 && rel === 0) return null;
         
         const isTurn = turn === idx;
         const isPartner = isTeamMode && (localSeatIndex !== -1 ? rel === 2 : false);
         const isTouched = touchedSeats[idx];
         
         let posClasses = "absolute ";
         if (rel === 1) posClasses += "left-2 sm:left-4 top-[30%] -translate-y-1/2";
         if (rel === 2) posClasses += "top-2 sm:top-4 left-1/2 -translate-x-1/2";
         if (rel === 3) posClasses += "right-2 sm:right-4 top-[30%] -translate-y-1/2";
         if (rel === 0) posClasses += "bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2"; 

          return (pid || isTeamMode) && (
             <div 
                key={`${pid}-${idx}`} 
                onTouchStart={() => {
                    if (timeoutRefs.current[idx]) {
                        clearTimeout(timeoutRefs.current[idx]);
                    }
                    setTouchedSeats(prev => ({ ...prev, [idx]: true }));
                    timeoutRefs.current[idx] = setTimeout(() => {
                        setTouchedSeats(prev => {
                            const next = { ...prev };
                            delete next[idx];
                            return next;
                        });
                        delete timeoutRefs.current[idx];
                    }, 3000);
                }}
                onClick={() => {
                    if (timeoutRefs.current[idx]) {
                        clearTimeout(timeoutRefs.current[idx]);
                    }
                    setTouchedSeats(prev => ({ ...prev, [idx]: true }));
                    timeoutRefs.current[idx] = setTimeout(() => {
                        setTouchedSeats(prev => {
                            const next = { ...prev };
                            delete next[idx];
                            return next;
                        });
                        delete timeoutRefs.current[idx];
                    }, 3000);
                }}
                className={`${posClasses} cursor-pointer flex flex-col sm:flex-row items-center gap-1 sm:gap-3 px-1 sm:px-4 py-1 sm:py-3 rounded-lg sm:rounded-xl bg-black/60 backdrop-blur-md border ${isTurn ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] opacity-100' : (isTouched ? 'border-white/40 opacity-100 scale-105 shadow-lg' : 'border-white/10 opacity-30')} hover:opacity-100 active:opacity-100 transition-all pointer-events-auto z-[60]`}
             >
                <div className={`w-4 h-4 sm:w-10 sm:h-10 rounded-full ${isPartner ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'} flex items-center justify-center font-black text-[7px] sm:text-sm border border-white/5 overflow-hidden`}>
                    {playerPhotos?.[pid] ? (
                        <img src={playerPhotos[pid]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                        (playerNames[pid] || 'P').charAt(0)
                    )}
                </div>
                <div className="text-center sm:text-left min-w-0 short-hide landscape:hidden sm:landscape:block">
                   <div className={`text-[8px] sm:text-xs font-black uppercase tracking-tighter truncate max-w-[40px] sm:max-w-[120px] ${isPartner ? 'text-blue-400' : 'text-white'}`}>
                      {playerNames[pid] || 'Waiting...'}
                   </div>
                   <div className="text-[7px] sm:text-[10px] text-neutral-400 font-bold leading-none">
                      {playerHandSizes[idx] ?? 0} Tiles 
                      {isLocked && allTiles?.[idx] && (
                        <span className="text-amber-500 ml-1">({pipTotal(allTiles[idx])} pts)</span>
                      )}
                   </div>
                </div>

                {pid && !pid.startsWith('mock_') && !isPartner && onAddFriend && (
                   <button 
                      disabled={isFriend(pid) || hasSent(pid)}
                      onClick={(e) => {
                         e.stopPropagation();
                         onAddFriend(pid);
                      }}
                      className={`p-1 sm:p-1.5 rounded-lg transition-all pointer-events-auto shrink-0 ${
                         isFriend(pid) || hasSent(pid) 
                            ? 'bg-emerald-500/10 text-emerald-500' 
                            : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white'
                      }`}
                   >
                      {isFriend(pid) || hasSent(pid) ? <Check size={10} className="sm:w-3 sm:h-3" /> : <UserPlus size={10} className="sm:w-3 sm:h-3" />}
                   </button>
                )}
             </div>
         );
       })}
     </div>
   );
}
