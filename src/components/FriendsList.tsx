import React, { useState } from 'react';
import { useFriends, UserProfile, FriendRequest } from '../hooks/useFriends';
import { User as FirebaseUser } from 'firebase/auth';
import { Search, UserPlus, Check, X, Users, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  user: FirebaseUser;
  onInvite?: (friendId: string) => void;
}

export default function FriendsList({ user, onInvite }: Props) {
  const { friends, requests, searchUsers, sendRequest, acceptRequest } = useFriends(user);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm) return;
    setIsSearching(true);
    const results = await searchUsers(searchTerm);
    setSearchResults(results);
    setIsSearching(false);
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 border border-neutral-800 rounded-[32px] overflow-hidden">
      <div className="p-6 border-b border-neutral-800">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Users size={20} className="text-emerald-500" />
            Social Hub
          </h3>
          <div className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
            {friends.length} Friends
          </div>
        </div>

        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
          <input 
            type="text" 
            placeholder="Search by username..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </form>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8">
        {/* Search Results */}
        {searchResults.length > 0 && (
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-4 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              Discovery
            </h4>
            <div className="space-y-3">
              {searchResults.map(result => (
                <div key={result.uid} className="flex items-center justify-between p-3 rounded-2xl bg-neutral-800/50 border border-neutral-700/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold text-black uppercase">
                      {result.username.charAt(0)}
                    </div>
                    <span className="text-sm font-medium text-white">{result.username}</span>
                  </div>
                  <button 
                    onClick={() => sendRequest(result)}
                    className="p-2 hover:bg-emerald-500 hover:text-black rounded-lg transition-colors text-emerald-500"
                    title="Send Friend Request"
                  >
                    <UserPlus size={18} />
                  </button>
                </div>
              ))}
              <button 
                onClick={() => setSearchResults([])}
                className="text-[10px] text-neutral-500 hover:text-white transition-colors"
              >
                Clear results
              </button>
            </div>
          </section>
        )}

        {/* Requests */}
        {requests.length > 0 && (
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-4 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
              Pending Requests
            </h4>
            <div className="space-y-3">
              {requests.map(req => (
                <div key={req.id} className="flex items-center justify-between p-3 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-xs font-bold text-black uppercase">
                      {req.fromName.charAt(0)}
                    </div>
                    <span className="text-sm font-medium text-white">{req.fromName}</span>
                  </div>
                  <button 
                    onClick={() => acceptRequest(req)}
                    className="p-2 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400 transition-colors"
                  >
                    <Check size={18} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Friends List */}
        <section>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-4">Your Circle</h4>
          {friends.length === 0 ? (
            <div className="py-12 border border-dashed border-neutral-800 rounded-2xl flex flex-col items-center justify-center text-center px-4">
              <Users size={32} className="text-neutral-800 mb-3" />
              <p className="text-sm text-neutral-600 font-medium tracking-tight leading-relaxed">Your list is quiet.<br/>Invite some rivals.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {friends.map(friend => (
                <div key={friend.uid} className="group flex items-center justify-between p-3 rounded-2xl bg-neutral-800/30 border border-neutral-700/30 hover:border-emerald-500/30 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-300 uppercase">
                      {friend.username.charAt(0)}
                    </div>
                    <span className="text-sm font-medium text-white group-hover:text-emerald-400 transition-colors">{friend.username}</span>
                  </div>
                  {onInvite && (
                    <button 
                      onClick={() => onInvite(friend.uid)}
                      className="p-2 opacity-0 group-hover:opacity-100 bg-neutral-800 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-black transition-all"
                    >
                      <Send size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
