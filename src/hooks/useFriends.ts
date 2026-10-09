import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc, 
  deleteDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import { User } from 'firebase/auth';

export interface FriendRequest {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  status: 'pending' | 'accepted';
  timestamp: any;
}

export interface UserProfile {
  uid: string;
  username: string;
  photoURL?: string;
}

export function useFriends(user: User | null) {
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Listen to root friendships collection
    const friendshipsRef = collection(db, 'friendships');
    const qFriends = query(friendshipsRef, where('uids', 'array-contains', user.uid));
    
    const unsubFriends = onSnapshot(qFriends, 
      (snapshot) => {
        const friendIds = snapshot.docs.map(doc => {
          const data = doc.data();
          return data.uids.find((id: string) => id !== user.uid);
        });

        if (friendIds.length === 0) {
          setFriends([]);
          setLoading(false);
          return;
        }

        // Fetch profiles for these IDs (async inside sync callback)
        const fetchProfiles = async () => {
          const profiles: UserProfile[] = [];
          for (const fid of friendIds) {
            if (!fid) continue;
            try {
              const pDoc = await getDoc(doc(db, 'users', fid));
              if (pDoc.exists()) {
                profiles.push({ uid: fid, ...pDoc.data() } as UserProfile);
              }
            } catch (err) {
              console.error("Error fetching friend profile:", err);
            }
          }
          setFriends(profiles);
          setLoading(false);
        };
        fetchProfiles();
      },
      (error) => {
        handleFirestoreError(error, 'list', 'friendships');
      }
    );

    // Listen to incoming friend requests
    const requestsRef = collection(db, 'friend_requests');
    const q = query(requestsRef, where('toId', '==', user.uid), where('status', '==', 'pending'));
    const unsubRequests = onSnapshot(q, 
      (snapshot) => {
        const r = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FriendRequest));
        setRequests(r);
      },
      (error) => {
        handleFirestoreError(error, 'list', 'friend_requests');
      }
    );

    return () => {
      unsubFriends();
      unsubRequests();
    };
  }, [user]);

  const sendRequest = async (targetUser: UserProfile) => {
    if (!user) return;
    
    // Check if already friends or request exists
    const q = query(
      collection(db, 'friend_requests'), 
      where('fromId', '==', user.uid), 
      where('toId', '==', targetUser.uid),
      where('status', '==', 'pending')
    );
    const existing = await getDocs(q);
    if (!existing.empty) return;

    await addDoc(collection(db, 'friend_requests'), {
      fromId: user.uid,
      fromName: user.displayName || user.email?.split('@')[0] || 'Unknown',
      toId: targetUser.uid,
      status: 'pending',
      timestamp: serverTimestamp()
    });
  };

  const acceptRequest = async (request: FriendRequest) => {
    if (!user) return;

    // Create a friendship document
    const friendshipId = [user.uid, request.fromId].sort().join('_');
    await setDoc(doc(db, 'friendships', friendshipId), {
      uids: [user.uid, request.fromId],
      status: 'active',
      timestamp: serverTimestamp()
    });

    // Delete the request
    await deleteDoc(doc(db, 'friend_requests', request.id));
  };

  const searchUsers = async (searchTerm: string) => {
    if (!searchTerm) return [];
    const usersRef = collection(db, 'users');
    // Basic search on startAt/endAt for username
    const q = query(
      usersRef, 
      where('username', '>=', searchTerm), 
      where('username', '<=', searchTerm + '\uf8ff'),
      limit(10)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
      .filter(u => u.uid !== user?.uid); // Exclude self
  };

  return { friends, requests, loading, sendRequest, acceptRequest, searchUsers };
}
