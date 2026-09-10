import { createClient } from '@supabase/supabase-js';
import type { Session, Question, UserProfile, Difficulty } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not set. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// Auth helpers
export async function signInWithMagicLink(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });
  return { error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Profile helpers
export async function getOrCreateProfile(userId: string, email: string): Promise<UserProfile | null> {
  // Try to get existing profile
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (existingProfile) {
    return {
      id: existingProfile.id,
      displayName: existingProfile.display_name,
      email: existingProfile.email,
      createdAt: new Date(existingProfile.created_at),
    };
  }

  // Create new profile
  const { data: newProfile, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      email,
      display_name: email.split('@')[0], // Default display name
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating profile:', error);
    return null;
  }

  return {
    id: newProfile.id,
    displayName: newProfile.display_name,
    email: newProfile.email,
    createdAt: new Date(newProfile.created_at),
  };
}

// Session helpers
// Map a raw sessions row into a Session.
function mapSessionRow(data: Record<string, unknown>): Session {
  return {
    id: data.id as string,
    userId: data.user_id as string,
    theme: data.theme as Session['theme'],
    customTheme: (data.custom_theme as string) || undefined,
    gradeLevel: (data.grade_level as Session['gradeLevel']) || undefined,
    topics: (data.topics as Session['topics']) || undefined,
    customTopics: (data.custom_topics as string[]) || undefined,
    topicDifficulties: (data.topic_difficulties as Session['topicDifficulties']) || undefined,
    questionFormats: (data.question_formats as Session['questionFormats']) || undefined,
    sessionType: data.session_type as Session['sessionType'],
    sessionValue: data.session_value as number,
    mode: data.mode as Session['mode'],
    startedAt: new Date(data.started_at as string),
    endedAt: data.ended_at ? new Date(data.ended_at as string) : undefined,
    totalCorrect: (data.total_correct as number) ?? 0,
    totalAttempted: (data.total_attempted as number) ?? 0,
  };
}

export async function createSession(session: Omit<Session, 'id' | 'startedAt' | 'totalCorrect' | 'totalAttempted'>): Promise<Session | null> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: session.userId,
      theme: session.theme,
      custom_theme: session.customTheme,
      grade_level: session.gradeLevel,
      topics: session.topics,
      custom_topics: session.customTopics,
      topic_difficulties: session.topicDifficulties,
      question_formats: session.questionFormats,
      session_type: session.sessionType,
      session_value: session.sessionValue,
      mode: session.mode,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating session:', error);
    return null;
  }

  return mapSessionRow(data);
}

// Fetch a user's sessions, newest first (for the history screen).
export async function getUserSessions(userId: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('Error fetching sessions:', error);
    return [];
  }

  return data.map(mapSessionRow);
}

export async function updateSession(sessionId: string, updates: Partial<Pick<Session, 'endedAt' | 'totalCorrect' | 'totalAttempted'>>) {
  const { error } = await supabase
    .from('sessions')
    .update({
      ended_at: updates.endedAt?.toISOString(),
      total_correct: updates.totalCorrect,
      total_attempted: updates.totalAttempted,
    })
    .eq('id', sessionId);

  return { error };
}

// Question helpers
export async function saveQuestion(question: Omit<Question, 'id' | 'createdAt'>): Promise<Question | null> {
  const { data, error } = await supabase
    .from('questions')
    .insert({
      session_id: question.sessionId,
      question_text: question.questionText,
      correct_answer: question.correctAnswer,
      explanation: question.explanation,
      genre: question.genre,
      sub_topic: question.subTopic,
      difficulty: question.difficulty,
      user_answer: question.userAnswer,
      is_correct: question.isCorrect,
      time_spent_seconds: question.timeSpentSeconds,
      question_order: question.questionOrder,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving question:', error);
    return null;
  }

  return {
    id: data.id,
    sessionId: data.session_id,
    questionText: data.question_text,
    correctAnswer: data.correct_answer,
    explanation: data.explanation,
    genre: data.genre,
    subTopic: data.sub_topic || 'general',
    difficulty: (data.difficulty || 'medium') as Difficulty,
    userAnswer: data.user_answer,
    isCorrect: data.is_correct,
    timeSpentSeconds: data.time_spent_seconds,
    questionOrder: data.question_order,
    createdAt: new Date(data.created_at),
  };
}

export async function updateQuestion(questionId: string, updates: Partial<Pick<Question, 'userAnswer' | 'isCorrect' | 'timeSpentSeconds'>>) {
  const { error } = await supabase
    .from('questions')
    .update({
      user_answer: updates.userAnswer,
      is_correct: updates.isCorrect,
      time_spent_seconds: updates.timeSpentSeconds,
    })
    .eq('id', questionId);

  return { error };
}

export async function getSessionQuestions(sessionId: string): Promise<Question[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('session_id', sessionId)
    .order('question_order', { ascending: true });

  if (error) {
    console.error('Error fetching questions:', error);
    return [];
  }

  return data.map((q) => ({
    id: q.id,
    sessionId: q.session_id,
    questionText: q.question_text,
    correctAnswer: q.correct_answer,
    explanation: q.explanation,
    genre: q.genre,
    subTopic: q.sub_topic || 'general',
    difficulty: (q.difficulty || 'medium') as Difficulty,
    userAnswer: q.user_answer,
    isCorrect: q.is_correct,
    timeSpentSeconds: q.time_spent_seconds,
    questionOrder: q.question_order,
    createdAt: new Date(q.created_at),
  }));
}
