import React, { useState } from 'react';
import { loginWithGoogle } from '../firebase';
import { Chrome } from 'lucide-react';

export default function Auth() {
  const [error, setError] = useState('');

  const handleGoogle = async () => {
    setError('');
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error('Google Auth Error:', err.code, err.message);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled or popup closed. Please try again.');
        return;
      }
      if (err.code === 'auth/popup-blocked') {
        setError('Popup blocked. Please enable popups for this site so you can sign in with Google.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Google login is not enabled in your Firebase project. Please go to the Firebase Console -> Authentication -> Sign-in method and enable Google.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized for Firebase Auth. Please add it in Firebase Console -> Authentication -> Settings -> Authorized domains.');
      } else {
        setError(`Google login failed: ${err.message}.`);
      }
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto flex flex-col items-center py-10 sm:py-20 px-4 text-center">
      <h2 className="text-3xl sm:text-5xl font-medium mb-4 sm:mb-6 text-white leading-tight">Tactile. Digital.<br/>Domino Royale.</h2>
      <p className="text-base sm:text-xl text-neutral-500 max-w-xl mb-8 sm:mb-12 font-medium">
        Play 1v1, 1v2, 1v3, or Team Mode with friends and bots.
      </p>

      <div className="w-full max-w-md bg-neutral-900/80 backdrop-blur-xl p-6 sm:p-8 rounded-[24px] sm:rounded-[32px] border border-white/10 shadow-2xl mb-10 text-center">
        <h3 className="text-2xl font-bold mb-6 text-white">Welcome Back</h3>
        
        {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-medium">{error}</div>}

        <p className="text-neutral-400 text-sm mb-8 leading-relaxed">
          Sign in with your Google account to track your wins, manage friends, and enter the arena.
        </p>

        <button 
          onClick={handleGoogle}
          className="w-full py-4 bg-white text-black rounded-xl font-bold text-lg hover:bg-neutral-100 active:scale-[0.98] transition-all flex items-center justify-center gap-3 mb-6 shadow-xl"
        >
          <Chrome size={22} />
          Sign in with Google
        </button>

        <p className="text-[10px] text-neutral-600 uppercase font-black tracking-widest">
          Secure Authentication via Firebase
        </p>
      </div>
    </div>
  );
}
