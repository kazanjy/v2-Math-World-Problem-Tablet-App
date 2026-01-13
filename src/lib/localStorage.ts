import type { Session, Question, UserProfile, Theme, GradeLevel, SessionType, SessionMode } from '../types';

const STORAGE_KEYS = {
  PROFILE: 'mmg_profile',
  SESSIONS: 'mmg_sessions',
  QUESTIONS: 'mmg_questions',
  SETTINGS: 'mmg_settings',
};

// Profile helpers
export function getLocalProfile(): UserProfile | null {
  const data = localStorage.getItem(STORAGE_KEYS.PROFILE);
  if (!data) return null;
  const profile = JSON.parse(data);
  return {
    ...profile,
    createdAt: new Date(profile.createdAt),
  };
}

export function saveLocalProfile(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
}

export function clearLocalProfile(): void {
  localStorage.removeItem(STORAGE_KEYS.PROFILE);
}

// Session helpers
export function getLocalSessions(): Session[] {
  const data = localStorage.getItem(STORAGE_KEYS.SESSIONS);
  if (!data) return [];
  const sessions = JSON.parse(data) as Session[];
  return sessions.map(s => ({
    ...s,
    startedAt: new Date(s.startedAt),
    endedAt: s.endedAt ? new Date(s.endedAt) : undefined,
  }));
}

export function getLocalSession(sessionId: string): Session | null {
  const sessions = getLocalSessions();
  return sessions.find(s => s.id === sessionId) || null;
}

export function saveLocalSession(session: Session): Session {
  const sessions = getLocalSessions();
  const existingIndex = sessions.findIndex(s => s.id === session.id);

  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
  } else {
    sessions.push(session);
  }

  localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  return session;
}

export function updateLocalSession(sessionId: string, updates: Partial<Session>): Session | null {
  const sessions = getLocalSessions();
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index < 0) return null;

  sessions[index] = { ...sessions[index], ...updates };
  localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  return sessions[index];
}

// Question helpers
export function getLocalQuestions(): Question[] {
  const data = localStorage.getItem(STORAGE_KEYS.QUESTIONS);
  if (!data) return [];
  const questions = JSON.parse(data) as Question[];
  return questions.map(q => ({
    ...q,
    createdAt: new Date(q.createdAt),
  }));
}

export function getLocalSessionQuestions(sessionId: string): Question[] {
  return getLocalQuestions()
    .filter(q => q.sessionId === sessionId)
    .sort((a, b) => a.questionOrder - b.questionOrder);
}

export function saveLocalQuestion(question: Question): Question {
  const questions = getLocalQuestions();
  const existingIndex = questions.findIndex(q => q.id === question.id);

  if (existingIndex >= 0) {
    questions[existingIndex] = question;
  } else {
    questions.push(question);
  }

  localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
  return question;
}

export function updateLocalQuestion(questionId: string, updates: Partial<Question>): Question | null {
  const questions = getLocalQuestions();
  const index = questions.findIndex(q => q.id === questionId);

  if (index < 0) return null;

  questions[index] = { ...questions[index], ...updates };
  localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
  return questions[index];
}

// Utility to clear all demo data
export function clearAllLocalData(): void {
  localStorage.removeItem(STORAGE_KEYS.PROFILE);
  localStorage.removeItem(STORAGE_KEYS.SESSIONS);
  localStorage.removeItem(STORAGE_KEYS.QUESTIONS);
}

// Get stats for profile
export function getLocalStats(): { totalSessions: number; totalQuestions: number; totalCorrect: number } {
  const sessions = getLocalSessions();
  const questions = getLocalQuestions();
  const totalCorrect = questions.filter(q => q.isCorrect).length;

  return {
    totalSessions: sessions.length,
    totalQuestions: questions.length,
    totalCorrect,
  };
}

// Settings helpers
export interface SavedSettings {
  theme: Theme;
  customTheme?: string;
  gradeLevel: GradeLevel;
  sessionType: SessionType;
  questionCount: number;
  customQuestionCount: string;
  timeMinutes: number;
  customTime: string;
  mode: SessionMode;
}

export function getSavedSettings(): SavedSettings | null {
  const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  if (!data) return null;
  return JSON.parse(data);
}

export function saveSettings(settings: SavedSettings): void {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}
