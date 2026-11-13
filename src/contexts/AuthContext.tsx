import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  ADMIN_EMAIL,
  OperationType,
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
  testFirestoreConnection,
} from '../lib/firebase';
import { CONCURSO_PROFILE } from '../data/alepaSyllabus';
import { CETAP_QUESTIONS, DEFAULT_STUDY_MATERIALS } from '../data/alepaQuestions';
import {
  BlockType,
  ErrorEntry,
  ErrorReason,
  MaterialFileType,
  Question,
  SimuladoAttempt,
  StudyMaterial,
  StudySession,
  TopicProgress,
  UserProfile,
  UserRole,
} from '../types';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  authLoading: boolean;
  syncError: string | null;
  clearSyncError: () => void;
  topicProgressMap: Record<string, TopicProgress>;
  studySessions: StudySession[];
  simuladoAttempts: SimuladoAttempt[];
  errorNotebook: ErrorEntry[];
  materials: StudyMaterial[];
  questions: Question[];
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName: string, preferredRole: UserRole) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshAuthState: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfileSettings: (patch: { displayName?: string; dailyGoalMinutes?: number }) => Promise<void>;
  saveTopicProgress: (
    topicId: string,
    disciplineId: string,
    patch: Partial<Pick<TopicProgress, 'theoryDone' | 'questionsDone' | 'revisionDone' | 'notes'>>
  ) => Promise<void>;
  logStudySession: (input: {
    dateKey: string;
    disciplineId: string;
    topicTitle: string;
    blockType: BlockType;
    durationMinutes: number;
    notes?: string;
  }) => Promise<void>;
  saveSimuladoAttempt: (input: {
    title: string;
    mode: 'treino' | 'simulado';
    primaryDisciplineId: string;
    totalQuestions: number;
    correctCount: number;
    score: number;
    durationSeconds: number;
  }) => Promise<void>;
  addErrorEntry: (input: {
    questionId: string;
    disciplineId: string;
    topicTitle: string;
    questionStem: string;
    correctOption: string;
    selectedOption: string;
    errorReason: ErrorReason;
    improvementNote: string;
  }) => Promise<void>;
  updateErrorEntry: (
    entryId: string,
    patch: Partial<Pick<ErrorEntry, 'errorReason' | 'improvementNote' | 'nextReviewDate' | 'reviewCount' | 'status'>>
  ) => Promise<void>;
  deleteErrorEntry: (entryId: string) => Promise<void>;
  addMaterial: (input: {
    title: string;
    disciplineId: string;
    fileType: MaterialFileType;
    url: string;
    fileName?: string;
    description?: string;
    isShared?: boolean;
  }) => Promise<void>;
  deleteMaterial: (materialId: string) => Promise<void>;
  addCustomQuestion: (input: {
    disciplineId: string;
    topicTitle: string;
    statement: string;
    options: [string, string, string, string, string];
    correctIndex: number;
    explanation: string;
    legalBasis?: string;
    source?: string;
    isPublished?: boolean;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || `id_${Date.now()}`;
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [topicProgressMap, setTopicProgressMap] = useState<Record<string, TopicProgress>>({});
  const [studySessions, setStudySessions] = useState<StudySession[]>([]);
  const [simuladoAttempts, setSimuladoAttempts] = useState<SimuladoAttempt[]>([]);
  const [errorNotebook, setErrorNotebook] = useState<ErrorEntry[]>([]);
  const [sharedMaterials, setSharedMaterials] = useState<StudyMaterial[]>([]);
  const [myMaterials, setMyMaterials] = useState<StudyMaterial[]>([]);
  const [publishedQuestions, setPublishedQuestions] = useState<Question[]>([]);
  const [myQuestions, setMyQuestions] = useState<Question[]>([]);

  useEffect(() => {
    void testFirestoreConnection();
  }, []);

  const ensureVerified = (): User => {
    const current = auth.currentUser;
    if (!current) {
      throw new Error('Faça login para salvar seu progresso.');
    }
    if (!current.emailVerified) {
      throw new Error(
        'Confirme o link enviado para o seu e-mail (ou entre com Google) para liberar a sincronização na nuvem.'
      );
    }
    return current;
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setTopicProgressMap({});
        setStudySessions([]);
        setSimuladoAttempts([]);
        setErrorNotebook([]);
        setSharedMaterials([]);
        setMyMaterials([]);
        setPublishedQuestions([]);
        setMyQuestions([]);
        setAuthLoading(false);
        return;
      }

      if (firebaseUser.emailVerified) {
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            const isTeacherAdmin = firebaseUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
            const newProfile = {
              uid: firebaseUser.uid,
              displayName: (firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Estudante ALEPA').slice(0, 120),
              role: isTeacherAdmin ? 'teacher' : 'student',
              dailyGoalMinutes: CONCURSO_PROFILE.dailyGoalMinutes,
              examDate: CONCURSO_PROFILE.examDate,
              targetCargo: 'Cargo 03 – Técnico Legislativo (PL.AL.102)',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(userRef, newProfile);
          }
        } catch (err) {
          console.error('Erro ao inicializar perfil:', err);
        }
      } else {
        setProfile({
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Estudante ALEPA',
          role: 'student',
          dailyGoalMinutes: CONCURSO_PROFILE.dailyGoalMinutes,
          examDate: CONCURSO_PROFILE.examDate,
          targetCargo: 'Cargo 03 – Técnico Legislativo (PL.AL.102)',
        });
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;

    const uid = user.uid;
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          if (snap.exists()) {
            setProfile(snap.data() as UserProfile);
          }
        },
        (err) => {
          if (user.emailVerified) {
            handleFirestoreError(err, OperationType.GET, `users/${uid}`);
          }
        }
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'topicProgress'),
        (snap) => {
          const next: Record<string, TopicProgress> = {};
          snap.forEach((docSnap) => {
            const data = docSnap.data() as TopicProgress;
            next[docSnap.id] = data;
          });
          setTopicProgressMap(next);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/topicProgress`)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'users', uid, 'studySessions'), orderBy('createdAt', 'desc')),
        (snap) => {
          const list: StudySession[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudySession, 'id'>) }));
          setStudySessions(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/studySessions`)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'users', uid, 'simuladoAttempts'), orderBy('createdAt', 'desc')),
        (snap) => {
          const list: SimuladoAttempt[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SimuladoAttempt, 'id'>),
          }));
          setSimuladoAttempts(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/simuladoAttempts`)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'users', uid, 'errorNotebook'), orderBy('updatedAt', 'desc')),
        (snap) => {
          const list: ErrorEntry[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ErrorEntry, 'id'>) }));
          setErrorNotebook(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/errorNotebook`)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'materials'), where('isShared', '==', true)),
        (snap) => {
          setSharedMaterials(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudyMaterial, 'id'>) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'materials')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'materials'), where('ownerId', '==', uid)),
        (snap) => {
          setMyMaterials(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudyMaterial, 'id'>) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'materials')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'sharedQuestions'), where('isPublished', '==', true)),
        (snap) => {
          setPublishedQuestions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Question, 'id'>) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'sharedQuestions')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'sharedQuestions'), where('authorId', '==', uid)),
        (snap) => {
          setMyQuestions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Question, 'id'>) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'sharedQuestions')
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user]);

  const materials = React.useMemo(() => {
    const merged = new Map<string, StudyMaterial>();
    DEFAULT_STUDY_MATERIALS.forEach((m) => merged.set(m.id, m));
    sharedMaterials.forEach((m) => merged.set(m.id, m));
    myMaterials.forEach((m) => merged.set(m.id, m));
    return Array.from(merged.values());
  }, [sharedMaterials, myMaterials]);

  const questions = React.useMemo(() => {
    const merged = new Map<string, Question>();
    CETAP_QUESTIONS.forEach((q) => merged.set(q.id, q));
    publishedQuestions.forEach((q) => merged.set(q.id, q));
    myQuestions.forEach((q) => merged.set(q.id, q));
    return Array.from(merged.values());
  }, [publishedQuestions, myQuestions]);

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const registerWithEmail = async (
    email: string,
    password: string,
    displayName: string,
    _preferredRole: UserRole
  ) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(cred.user, { displayName: displayName.trim().slice(0, 120) });
    await sendEmailVerification(cred.user);
  };

  const loginWithGoogle = async () => {
    await signInWithPopup(auth, googleAuthProvider);
  };

  const resendVerification = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const refreshAuthState = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setUser({ ...auth.currentUser });
      if (auth.currentUser.emailVerified) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const isTeacherAdmin = auth.currentUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
          await setDoc(userRef, {
            uid: auth.currentUser.uid,
            displayName: (
              auth.currentUser.displayName ||
              auth.currentUser.email?.split('@')[0] ||
              'Estudante ALEPA'
            ).slice(0, 120),
            role: isTeacherAdmin ? 'teacher' : 'student',
            dailyGoalMinutes: CONCURSO_PROFILE.dailyGoalMinutes,
            examDate: CONCURSO_PROFILE.examDate,
            targetCargo: 'Cargo 03 – Técnico Legislativo (PL.AL.102)',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const updateProfileSettings = async (patch: { displayName?: string; dailyGoalMinutes?: number }) => {
    const current = ensureVerified();
    const path = `users/${current.uid}`;
    try {
      const ref = doc(db, 'users', current.uid);
      const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (patch.displayName !== undefined) updates.displayName = patch.displayName.trim().slice(0, 120);
      if (patch.dailyGoalMinutes !== undefined) {
        updates.dailyGoalMinutes = Math.max(15, Math.min(720, Math.round(patch.dailyGoalMinutes)));
      }
      await updateDoc(ref, updates);
    } catch (err) {
      setSyncError('Não foi possível atualizar seu perfil agora.');
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const saveTopicProgress = async (
    topicId: string,
    disciplineId: string,
    patch: Partial<Pick<TopicProgress, 'theoryDone' | 'questionsDone' | 'revisionDone' | 'notes'>>
  ) => {
    const current = ensureVerified();
    const safeTopicId = sanitizeId(topicId);
    const existing = topicProgressMap[safeTopicId];
    const theoryDone = patch.theoryDone ?? existing?.theoryDone ?? false;
    const questionsDone = patch.questionsDone ?? existing?.questionsDone ?? false;
    const revisionDone = patch.revisionDone ?? existing?.revisionDone ?? false;
    const notes = (patch.notes ?? existing?.notes ?? '').slice(0, 2000);
    const masteryLevel = Math.round(
      ((theoryDone ? 40 : 0) + (questionsDone ? 40 : 0) + (revisionDone ? 20 : 0))
    );

    const path = `users/${current.uid}/topicProgress/${safeTopicId}`;
    try {
      const ref = doc(db, 'users', current.uid, 'topicProgress', safeTopicId);
      if (existing) {
        await updateDoc(ref, {
          theoryDone,
          questionsDone,
          revisionDone,
          masteryLevel,
          notes,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          userId: current.uid,
          topicId: safeTopicId,
          disciplineId: disciplineId.slice(0, 80),
          theoryDone,
          questionsDone,
          revisionDone,
          masteryLevel,
          notes,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      setSyncError('Erro ao salvar progresso do tópico.');
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const logStudySession = async (input: {
    dateKey: string;
    disciplineId: string;
    topicTitle: string;
    blockType: BlockType;
    durationMinutes: number;
    notes?: string;
  }) => {
    const current = ensureVerified();
    const sessionId = sanitizeId(`ses_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const path = `users/${current.uid}/studySessions/${sessionId}`;
    try {
      await setDoc(doc(db, 'users', current.uid, 'studySessions', sessionId), {
        userId: current.uid,
        dateKey: input.dateKey.slice(0, 20),
        disciplineId: input.disciplineId.slice(0, 80),
        topicTitle: input.topicTitle.trim().slice(0, 200) || 'Sessão de estudo',
        blockType: input.blockType,
        durationMinutes: Math.max(1, Math.min(600, Math.round(input.durationMinutes))),
        notes: (input.notes || '').slice(0, 1000),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      setSyncError('Erro ao registrar sessão de estudo.');
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const saveSimuladoAttempt = async (input: {
    title: string;
    mode: 'treino' | 'simulado';
    primaryDisciplineId: string;
    totalQuestions: number;
    correctCount: number;
    score: number;
    durationSeconds: number;
  }) => {
    const current = ensureVerified();
    const attemptId = sanitizeId(`sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const path = `users/${current.uid}/simuladoAttempts/${attemptId}`;
    try {
      await setDoc(doc(db, 'users', current.uid, 'simuladoAttempts', attemptId), {
        userId: current.uid,
        title: input.title.trim().slice(0, 160),
        mode: input.mode,
        primaryDisciplineId: input.primaryDisciplineId.slice(0, 80),
        totalQuestions: Math.max(1, Math.min(200, Math.round(input.totalQuestions))),
        correctCount: Math.max(0, Math.min(input.totalQuestions, Math.round(input.correctCount))),
        score: Math.max(0, Math.min(10, Number(input.score.toFixed(2)))),
        durationSeconds: Math.max(0, Math.min(36000, Math.round(input.durationSeconds))),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      setSyncError('Erro ao salvar resultado do simulado.');
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const addErrorEntry = async (input: {
    questionId: string;
    disciplineId: string;
    topicTitle: string;
    questionStem: string;
    correctOption: string;
    selectedOption: string;
    errorReason: ErrorReason;
    improvementNote: string;
  }) => {
    const current = ensureVerified();
    const safeQuestionId = sanitizeId(input.questionId);
    const entryId = sanitizeId(`err_${safeQuestionId}`);
    const path = `users/${current.uid}/errorNotebook/${entryId}`;
    const existing = errorNotebook.find((e) => e.id === entryId);
    try {
      if (existing) {
        await updateDoc(doc(db, 'users', current.uid, 'errorNotebook', entryId), {
          errorReason: input.errorReason,
          improvementNote: input.improvementNote.slice(0, 2000),
          nextReviewDate: addDaysIso(1),
          reviewCount: existing.reviewCount + 1,
          status: 'pending',
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'users', current.uid, 'errorNotebook', entryId), {
          userId: current.uid,
          questionId: safeQuestionId,
          disciplineId: input.disciplineId.slice(0, 80),
          topicTitle: input.topicTitle.slice(0, 200),
          questionStem: input.questionStem.slice(0, 2000),
          correctOption: input.correctOption.slice(0, 500),
          selectedOption: input.selectedOption.slice(0, 500),
          errorReason: input.errorReason,
          improvementNote: input.improvementNote.slice(0, 2000),
          nextReviewDate: addDaysIso(1),
          reviewCount: 0,
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      setSyncError('Erro ao salvar no Caderno de Erros.');
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const updateErrorEntry = async (
    entryId: string,
    patch: Partial<Pick<ErrorEntry, 'errorReason' | 'improvementNote' | 'nextReviewDate' | 'reviewCount' | 'status'>>
  ) => {
    const current = ensureVerified();
    const safeId = sanitizeId(entryId);
    const existing = errorNotebook.find((e) => e.id === safeId);
    if (!existing) return;
    const path = `users/${current.uid}/errorNotebook/${safeId}`;
    try {
      await updateDoc(doc(db, 'users', current.uid, 'errorNotebook', safeId), {
        errorReason: patch.errorReason ?? existing.errorReason,
        improvementNote: (patch.improvementNote ?? existing.improvementNote).slice(0, 2000),
        nextReviewDate: (patch.nextReviewDate ?? existing.nextReviewDate).slice(0, 20),
        reviewCount: patch.reviewCount ?? existing.reviewCount,
        status: patch.status ?? existing.status,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setSyncError('Erro ao atualizar revisão.');
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const deleteErrorEntry = async (entryId: string) => {
    const current = ensureVerified();
    const safeId = sanitizeId(entryId);
    const path = `users/${current.uid}/errorNotebook/${safeId}`;
    try {
      await deleteDoc(doc(db, 'users', current.uid, 'errorNotebook', safeId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const addMaterial = async (input: {
    title: string;
    disciplineId: string;
    fileType: MaterialFileType;
    url: string;
    fileName?: string;
    description?: string;
    isShared?: boolean;
  }) => {
    const current = ensureVerified();
    const materialId = sanitizeId(`mat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const isAdminUser = current.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const canShare = Boolean(input.isShared && isAdminUser);
    const path = `materials/${materialId}`;
    try {
      await setDoc(doc(db, 'materials', materialId), {
        ownerId: current.uid,
        title: input.title.trim().slice(0, 200),
        disciplineId: input.disciplineId.slice(0, 80),
        fileType: input.fileType,
        url: input.url.trim().slice(0, 2000),
        fileName: (input.fileName || '').slice(0, 240),
        description: (input.description || '').slice(0, 1000),
        isShared: canShare,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setSyncError('Erro ao salvar material.');
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const deleteMaterial = async (materialId: string) => {
    ensureVerified();
    const safeId = sanitizeId(materialId);
    const path = `materials/${safeId}`;
    try {
      await deleteDoc(doc(db, 'materials', safeId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const addCustomQuestion = async (input: {
    disciplineId: string;
    topicTitle: string;
    statement: string;
    options: [string, string, string, string, string];
    correctIndex: number;
    explanation: string;
    legalBasis?: string;
    source?: string;
    isPublished?: boolean;
  }) => {
    const current = ensureVerified();
    const questionId = sanitizeId(`q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const isAdminUser = current.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const canPublish = Boolean(input.isPublished && isAdminUser);
    const path = `sharedQuestions/${questionId}`;
    try {
      await setDoc(doc(db, 'sharedQuestions', questionId), {
        authorId: current.uid,
        disciplineId: input.disciplineId.slice(0, 80),
        topicTitle: input.topicTitle.trim().slice(0, 200),
        statement: input.statement.trim().slice(0, 2500),
        options: input.options.map((o) => o.trim().slice(0, 500)),
        correctIndex: Math.max(0, Math.min(4, Math.round(input.correctIndex))),
        explanation: input.explanation.trim().slice(0, 2000),
        legalBasis: (input.legalBasis || '').slice(0, 400),
        source: (input.source || 'Cadastro Meu Campus').slice(0, 160),
        isPublished: canPublish,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      setSyncError('Erro ao salvar questão.');
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        authLoading,
        syncError,
        clearSyncError: () => setSyncError(null),
        topicProgressMap,
        studySessions,
        simuladoAttempts,
        errorNotebook,
        materials,
        questions,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        resendVerification,
        refreshAuthState,
        logout,
        updateProfileSettings,
        saveTopicProgress,
        logStudySession,
        saveSimuladoAttempt,
        addErrorEntry,
        updateErrorEntry,
        deleteErrorEntry,
        addMaterial,
        deleteMaterial,
        addCustomQuestion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser utilizado dentro de AuthProvider');
  return ctx;
}
