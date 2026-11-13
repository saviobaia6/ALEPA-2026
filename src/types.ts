export type UserRole = 'student' | 'teacher';

export type NavSection =
  | 'dashboard'
  | 'disciplines'
  | 'schedule'
  | 'simulados'
  | 'revisions'
  | 'materials'
  | 'performance';

export type BlockType = 'theory' | 'questions' | 'correction' | 'revision';

export type MaterialFileType = 'pdf' | 'pptx' | 'xlsx' | 'drive' | 'video';

export type ErrorReason = 'atencao' | 'teoria' | 'lei_seca' | 'banca_cetap';

export interface UserProfile {
  uid: string;
  displayName: string;
  role: UserRole;
  dailyGoalMinutes: number;
  examDate: string;
  targetCargo: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SyllabusTopic {
  id: string;
  disciplineId: string;
  title: string;
  subtopics: string[];
  highYield: boolean;
}

export interface Discipline {
  id: string;
  name: string;
  shortName: string;
  editalBlock:
    | 'Conhecimentos Específicos'
    | 'Legislação e Ética'
    | 'Língua Portuguesa'
    | 'Raciocínio Lógico'
    | 'Noções de Informática';
  priorityRank: number;
  examQuestions: number;
  examPoints: number;
  tieBreakerOrder: number;
  recommendedMinutesPerCycle: number;
  topics: SyllabusTopic[];
}

export interface TopicProgress {
  topicId: string;
  userId: string;
  disciplineId: string;
  theoryDone: boolean;
  questionsDone: boolean;
  revisionDone: boolean;
  masteryLevel: number;
  notes?: string;
  updatedAt?: unknown;
}

export interface StudySession {
  id: string;
  userId: string;
  dateKey: string;
  disciplineId: string;
  topicTitle: string;
  blockType: BlockType;
  durationMinutes: number;
  notes?: string;
  createdAt?: unknown;
}

export interface Question {
  id: string;
  disciplineId: string;
  topicTitle: string;
  statement: string;
  options: [string, string, string, string, string];
  correctIndex: number;
  explanation: string;
  legalBasis?: string;
  source?: string;
  authorId?: string;
  isPublished?: boolean;
}

export interface SimuladoAttempt {
  id: string;
  userId: string;
  title: string;
  mode: 'treino' | 'simulado';
  primaryDisciplineId: string;
  totalQuestions: number;
  correctCount: number;
  score: number;
  durationSeconds: number;
  createdAt?: unknown;
}

export interface ErrorEntry {
  id: string;
  userId: string;
  questionId: string;
  disciplineId: string;
  topicTitle: string;
  questionStem: string;
  correctOption: string;
  selectedOption: string;
  errorReason: ErrorReason;
  improvementNote: string;
  nextReviewDate: string;
  reviewCount: number;
  status: 'pending' | 'mastered';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudyMaterial {
  id: string;
  ownerId: string;
  title: string;
  disciplineId: string;
  fileType: MaterialFileType;
  url: string;
  fileName?: string;
  description?: string;
  isShared: boolean;
  isSystemDefault?: boolean;
  localBlobKey?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}
