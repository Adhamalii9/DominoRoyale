# Security Specification - Domino Royale

## Data Invariants
1. **Users**: A user can only manage their own profile. Other users can search (read) basic profile info.
2. **Friends**: Friend list is a subcollection. A user can only see their own friends. Addition/Removal happens via Friend Request logic.
3. **Friend Requests**: Only the sender can create. Only the receiver can accept (via update/delete). Both can see requests where they are involved.
4. **Invites**: Only the sender can create. Only the receiver can see and respond.
5. **Games**: Any signed-in user can list waiting games. Players can read/write their specific games.

## Identity, Integrity, and State Invariants
- `userId` in `friend_requests` or `invites` must match `request.auth.uid`.
- `status` transitions must be strictly enforced.
- No shadow fields or unauthorized key updates.

## The Dirty Dozen (Test Payloads)
1. **ID Spoofing**: User A tries to update User B's profile. (`PERMISSION_DENIED`)
2. **Ghost Request**: User A sends a friend request from User B's UID. (`PERMISSION_DENIED`)
3. **Friendship Theft**: User A adds User B as a friend directly without a request. (`PERMISSION_DENIED`)
4. **Invite Hijack**: User A views an invite sent to User B. (`PERMISSION_DENIED`)
5. **Status Skip**: User A updates a friend request status from 'pending' to 'accepted' while they are the sender. (`PERMISSION_DENIED`)
6. **Data Poisoning**: Injecting a 1MB string into a username. (`PERMISSION_DENIED`)
7. **Score Tampering**: User A updates their own score in a game they are not playing. (`PERMISSION_DENIED`)
8. **Shadow Field**: Adding `isAdmin: true` to a user profile update. (`PERMISSION_DENIED`)
9. **Relational Orphan**: Sending a friend request to a non-existent user. (`PERMISSION_DENIED`)
10. **Timestamp Lie**: Providing a past timestamp for `createdAt`. (`PERMISSION_DENIED`)
11. **Boneyard Peek**: Reading the boneyard collection of a game while not a player. (`PERMISSION_DENIED`)
12. **Blind Delete**: User B tries to delete User A's game. (`PERMISSION_DENIED`)
