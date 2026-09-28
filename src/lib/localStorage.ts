import type { Session, Question, UserProfile, Theme, GradeLevel, SessionType, SessionMode, Topic, TopicDifficultySettings, QuestionFormat, SessionConfig } from '../types';

const STORAGE_KEYS = {
  PROFILE: 'mmg_profile',
  SESSIONS: 'mmg_sessions',
  QUESTIONS: 'mmg_questions',
  SETTINGS: 'mmg_settings',
  RECENT_CUSTOM_TOPICS: 'mmg_recent_custom_topics',
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
export type SelectionMode = 'grade' | 'topics';

export interface SavedSettings {
  theme: Theme;
  customTheme?: string;
  selectionMode: SelectionMode;
  gradeLevel: GradeLevel;
  topics: Topic[];
  customTopics?: string[];
  topicDifficulties?: TopicDifficultySettings;
  questionFormats?: QuestionFormat[];
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

// Preset choices shown on the config page (shared so derived settings match).
export const PRESET_QUESTION_COUNTS = [5, 10, 15, 20];
export const PRESET_TIME_OPTIONS = [5, 10, 15];

// Derive the config page's saved form state from a session configuration, so
// the "New Session" page reflects whatever session was last started — including
// one relaunched from History — rather than the last manually-entered form.
// Fields the config doesn't carry (e.g. gradeLevel in topics mode) fall back to
// the existing saved values so the user doesn't lose them.
export function configToSavedSettings(config: SessionConfig, existing?: SavedSettings | null): SavedSettings {
  const isTopics = (config.topics?.length ?? 0) > 0 || (config.customTopics?.length ?? 0) > 0;
  const count = config.questionCount;
  const mins = config.timeMinutes;
  return {
    theme: config.theme,
    customTheme: config.customTheme ?? existing?.customTheme ?? '',
    selectionMode: isTopics ? 'topics' : 'grade',
    gradeLevel: config.gradeLevel ?? existing?.gradeLevel ?? '3',
    topics: isTopics ? (config.topics ?? []) : (existing?.topics ?? []),
    customTopics: isTopics ? (config.customTopics ?? []) : (existing?.customTopics ?? []),
    topicDifficulties: isTopics ? (config.topicDifficulties ?? existing?.topicDifficulties) : existing?.topicDifficulties,
    questionFormats: config.questionFormats ?? existing?.questionFormats,
    sessionType: config.sessionType,
    questionCount: count != null && PRESET_QUESTION_COUNTS.includes(count) ? count : (existing?.questionCount ?? 10),
    customQuestionCount: count != null && !PRESET_QUESTION_COUNTS.includes(count) ? String(count) : '',
    timeMinutes: mins != null && PRESET_TIME_OPTIONS.includes(mins) ? mins : (existing?.timeMinutes ?? 10),
    customTime: mins != null && !PRESET_TIME_OPTIONS.includes(mins) ? String(mins) : '',
    mode: config.mode,
  };
}

// Recently used custom ("special") topics, most recent first, offered as a
// quick-add dropdown on the config page. Updated whenever a session starts
// with custom topics.
const MAX_RECENT_CUSTOM_TOPICS = 12;

export function getRecentCustomTopics(): string[] {
  const data = localStorage.getItem(STORAGE_KEYS.RECENT_CUSTOM_TOPICS);
  if (!data) return [];
  try {
    const parsed: unknown = JSON.parse(data);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function addRecentCustomTopics(topics: string[]): void {
  const incoming = topics.map(t => t.trim()).filter(Boolean);
  if (incoming.length === 0) return;
  // New topics go to the front; de-duplicate case-insensitively; cap the list.
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const t of [...incoming, ...getRecentCustomTopics()]) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(t);
    if (merged.length >= MAX_RECENT_CUSTOM_TOPICS) break;
  }
  localStorage.setItem(STORAGE_KEYS.RECENT_CUSTOM_TOPICS, JSON.stringify(merged));
}
