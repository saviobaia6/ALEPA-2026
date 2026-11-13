# Security Specification — Meu Campus ALEPA

## 1. Data Invariants
1. Every document under `/users/{userId}` and its subcollections (`topicProgress`, `studySessions`, `simuladoAttempts`, `errorNotebook`) belongs strictly to `userId == request.auth.uid`.
2. Users cannot self-assign `role: 'teacher'` unless they are verified admins (`isAdmin()`). Students are always created with `role == 'student'` and `role` is immutable for non-admins.
3. Subcollection writes (`topicProgress`, `studySessions`, `simuladoAttempts`, `errorNotebook`) verify parent `/users/{userId}` document existence via `exists(...)` (Master Gate).
4. Timestamps (`createdAt`, `updatedAt`) are strictly validated against `request.time`.
5. `createdAt`, `uid`, `userId`, `ownerId`, and `authorId` are immutable after creation.
6. Shared `/materials/{materialId}` and `/sharedQuestions/{questionId}` can only be created/modified by their verified owner (`ownerId == request.auth.uid` / `authorId == request.auth.uid`), and `isShared: true` / `isPublished: true` requires `isAdmin()` or owner control (only `isAdmin()` can publish shared class-wide resources to prevent spam, while any verified user can save personal resources with `isShared: false` / `isPublished: false`).
7. All `allow list` rules explicitly evaluate `resource.data` (no blanket `isSignedIn()` lists and no `get()` inside `allow list`).
8. All writes require `request.auth.token.email_verified == true`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. Unauthenticated read/write on `/users/u1` -> PERMISSION_DENIED.
2. Unverified email (`email_verified: false`) writing `/users/u1` -> PERMISSION_DENIED.
3. Student spoofing `role: 'teacher'` on `/users/u1` create -> PERMISSION_DENIED.
4. Student injecting shadow field `isVerified: true` on `/users/u1` -> PERMISSION_DENIED.
5. User A reading/listing User B's `/users/u2/errorNotebook` -> PERMISSION_DENIED.
6. User A creating `/users/u1/studySessions/s1` with client-forged `createdAt` != `request.time` -> PERMISSION_DENIED.
7. User A updating immutable `createdAt` or `userId` on `/users/u1/errorNotebook/e1` -> PERMISSION_DENIED.
8. User A creating `/users/u1/topicProgress/bad..id` with invalid path ID -> PERMISSION_DENIED.
9. User A injecting >2500 chars into `statement` on `/sharedQuestions/q1` -> PERMISSION_DENIED.
10. Non-admin student setting `isShared: true` on `/materials/m1` -> PERMISSION_DENIED.
11. User A deleting User B's `/materials/m2` -> PERMISSION_DENIED.
12. Blanket query on `/materials` without filtering or trying to read private `isShared: false` doc owned by another user -> PERMISSION_DENIED.
