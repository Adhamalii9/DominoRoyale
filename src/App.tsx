/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, logout, db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Auth from './components/Auth';
import Lobby from './components/Lobby';
import GameView from './components/GameView';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut } from 'lucide-react';

export default function App() {
  const [user, loading] = useAuthState(auth);
  const [activeGameId, setActiveGameId] = useState<string | null>(() => {
    return localStorage.getItem('active_domino_game_id');
  });

  useEffect(() => {
    if (activeGameId) {
      localStorage.setItem('active_domino_game_id', activeGameId);
    } else {
      localStorage.removeItem('active_domino_game_id');
    }
  }, [activeGameId]);

  useEffect(() => {
    if (!loading && !user) {
      setActiveGameId(null);
    }
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    const syncProfile = async () => {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          username: user.displayName || user.email || 'Unknown Player',
          email: user.email,
          photoURL: user.photoURL || '',
          createdAt: Date.now()
        });
      }
    };
    syncProfile();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-xl font-medium animate-pulse text-neutral-500 uppercase tracking-widest">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-neutral-950 text-neutral-200 font-sans selection:bg-emerald-500/20 overflow-hidden flex flex-col">
      {!activeGameId && (
        <header className="border-b border-neutral-800 px-4 sm:px-8 py-3 sm:py-5 flex justify-between items-center bg-neutral-900/50 backdrop-blur-md sticky top-0 z-50 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-500 text-black flex items-center justify-center rounded-lg sm:rounded-xl font-bold text-lg sm:text-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] shrink-0">
              D
            </div>
            <div className="min-w-0">
              <h1 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 truncate">Domino Royale</h1>
              <p className="text-sm sm:text-lg font-medium leading-tight truncate">Multiplayer Arena</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {user && (
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 border border-neutral-700 shadow-sm overflow-hidden max-w-[200px]">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-black shrink-0 overflow-hidden">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      user.displayName?.charAt(0) || user.email?.charAt(0)
                    )}
                  </div>
                  <span className="text-sm font-medium truncate">{user.displayName || user.email}</span>
                </div>
                <button 
                  onClick={logout}
                  className="p-2 sm:p-2.5 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400 hover:text-white"
                  title="Logout"
                >
                  <LogOut size={20} />
                </button>
              </div>
            )}
          </div>
        </header>
      )}

      <main className={`flex-1 overflow-hidden ${!activeGameId ? 'max-w-7xl mx-auto p-4 sm:p-8 w-full' : ''}`}>
        <AnimatePresence mode="wait">
          {!user ? (
            <motion.div key="auth-gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <Auth />
            </motion.div>
          ) : activeGameId ? (
            <GameView 
              key="game-view"
              gameId={activeGameId} 
              onBack={() => setActiveGameId(null)} 
              user={user}
            />
          ) : (
            <Lobby 
              key="lobby-view"
              onSelectGame={setActiveGameId} 
              user={user}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
