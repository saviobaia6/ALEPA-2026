/**
 * Security Rules Verification Suite (Dirty Dozen Test Matrix)
 * Used to document and verify all 12 adversarial payloads against firestore.rules.
 */
export const dirtyDozenPayloads = [
  { id: 1, name: 'Unauthenticated user profile write', path: '/users/u1', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Unverified email write', path: '/users/u1', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Self-assigned teacher role spoofing', path: '/users/u1', payload: { role: 'teacher' }, expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Shadow field injection on profile', path: '/users/u1', payload: { isVerified: true }, expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Cross-user errorNotebook read/list', path: '/users/u2/errorNotebook', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Client-forged createdAt timestamp', path: '/users/u1/studySessions/s1', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Immutable userId/createdAt mutation', path: '/users/u1/errorNotebook/e1', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Invalid path ID injection', path: '/users/u1/topicProgress/bad..id', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Oversized question statement (>2500 chars)', path: '/sharedQuestions/q1', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Non-admin setting isShared: true', path: '/materials/m1', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Cross-user material deletion', path: '/materials/m2', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Blanket list query without owner/shared filter', path: '/materials', expected: 'PERMISSION_DENIED' },
] as const;
