import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  addDoc, 
  deleteDoc,
  serverTimestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import { User } from 'firebase/auth';

export interface GameInvite {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  gameId: string;
  status: 'pending';
  timestamp: any;
}

export function useInvites(user: User | null) {
  const [invites, setInvites] = useState<GameInvite[]>([]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'invites'), 
      where('toId', '==', user.uid), 
      where('status', '==', 'pending')
    );
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const i = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GameInvite));
        setInvites(i);
      },
      (error) => {
        handleFirestoreError(error, 'list', 'invites');
      }
    );

    return unsubscribe;
  }, [user]);

  const sendInvite = async (friendId: string, gameId: string) => {
    if (!user) return;
    
    await addDoc(collection(db, 'invites'), {
      fromId: user.uid,
      fromName: user.displayName || user.email?.split('@')[0] || 'Unknown',
      toId: friendId,
      gameId: gameId,
      status: 'pending',
      timestamp: serverTimestamp()
    });
  };

  const acceptInvite = async (invite: GameInvite) => {
    // We just return the gameId and delete the invite
    await deleteDoc(doc(db, 'invites', invite.id));
    return invite.gameId;
  };

  const declineInvite = async (invite: GameInvite) => {
    await deleteDoc(doc(db, 'invites', invite.id));
  };

  return { invites, sendInvite, acceptInvite, declineInvite };
}
