import { create } from 'zustand';
import type { SessionConfig, Session, Question, GeneratedQuestion } from '../types';
import { generateQuestion, checkAnswer } from '../lib/openai';
import { createSession, saveQuestion, updateQuestion, updateSession } from '../lib/supabase';
import {
  saveLocalSession,
  updateLocalSession,
  saveLocalQuestion,
  updateLocalQuestion,
  getLocalSessions,
  getLocalSessionQuestions,
} from '../lib/localStorage';
import { useAuthStore } from './authStore';

// Check if we should use local storage (demo mode OR demo login)
const shouldUseLocalStorage = () => {
  const isDemoMode = !import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co';
  const isUsingDemoLogin = useAuthStore.getState().isUsingDemoLogin;
  return isDemoMode || isUsingDemoLogin;
};

// Persist a generated question to Supabase (or localStorage in demo mode) and
// return the saved Question record.
const persistGeneratedQuestion = async (
  sessionId: string,
  generated: GeneratedQuestion,
  questionOrder: number
): Promise<Question> => {
  let savedQuestion: Question | null = null;

  if (!shouldUseLocalStorage()) {
    savedQuestion = await saveQuestion({
      sessionId,
      questionText: generated.question,
      correctAnswer: generated.answer,
      explanation: generated.explanation,
      genre: generated.genre,
      subTopic: generated.subTopic,
      difficulty: generated.difficulty,
      questionOrder,
    });
  }

  // Demo mode or Supabase fallback: create local question
  if (!savedQuestion) {
    savedQuestion = {
      id: `demo-q-${Date.now()}-${questionOrder}`,
      sessionId,
      questionText: generated.question,
      correctAnswer: generated.answer,
      explanation: generated.explanation,
      genre: generated.genre,
      subTopic: generated.subTopic,
      difficulty: generated.difficulty,
      questionOrder,
      createdAt: new Date(),
    };

    if (shouldUseLocalStorage()) {
      saveLocalQuestion(savedQuestion);
    }
  }

  return savedQuestion;
};

interface RetryItem {
  genre: string;
  originalQuestionId: string;
  scheduledPosition: number;
  retryAttempt: number; // 1 = first retry (+3), 2 = second retry (+9)
}

interface SessionState {
  // Configuration
  config: SessionConfig | null;

  // Active session
  session: Session | null;
  currentQuestion: (Question & { generated: GeneratedQuestion }) | null;
  questionNumber: number;

  // Timer
  startTime: Date | null;
  questionStartTime: Date | null;
  timeRemaining: number | null; // seconds remaining for timed sessions

  // Retry queue for spaced repetition
  retryQueue: RetryItem[];

  // Recent sub-topics for variety (last 5)
  recentSubTopics: string[];

  // Session results
  questions: Question[];

  // Loading state
  isLoading: boolean;
  isGenerating: boolean;

  // Actions
  setConfig: (config: SessionConfig) => void;
  startSession: (userId: string) => Promise<void>;
  nextQuestion: () => Promise<void>;
  tryAgainSimilar: () => Promise<void>;
  submitAnswer: (userAnswer: string) => Promise<{ isCorrect: boolean; correctAnswer: string; explanation: string; genre: string; subTopic: string; difficulty: string; timeSpent: number }>;
  endSession: () => Promise<void>;
  tick: () => void; // For timer
  reset: () => void;

  // History actions (for demo mode)
  getSessionHistory: () => Session[];
  getSessionQuestions: (sessionId: string) => Question[];
}

export const useSessionStore = create<SessionState>((set, get) => ({
  config: null,
  session: null,
  currentQuestion: null,
  questionNumber: 0,
  startTime: null,
  questionStartTime: null,
  timeRemaining: null,
  retryQueue: [],
  recentSubTopics: [],
  questions: [],
  isLoading: false,
  isGenerating: false,

  setConfig: (config) => set({ config }),

  startSession: async (userId: string) => {
    const { config } = get();
    if (!config) return;

    set({ isLoading: true });

    let session: Session | null = null;

    if (!shouldUseLocalStorage()) {
      session = await createSession({
        userId,
        theme: config.theme,
        customTheme: config.customTheme,
        gradeLevel: config.gradeLevel,
        sessionType: config.sessionType,
        sessionValue: config.sessionType === 'count' ? config.questionCount! : config.timeMinutes!,
        mode: config.mode,
      });
    }

    // Demo mode or Supabase fallback: create local session
    if (!session) {
      console.warn('Using local session (demo mode)');
      session = {
        id: `demo-session-${Date.now()}`,
        userId,
        theme: config.theme,
        customTheme: config.customTheme,
        gradeLevel: config.gradeLevel,
        topics: config.topics,
        customTopics: config.customTopics,
        topicDifficulties: config.topicDifficulties,
        sessionType: config.sessionType,
        sessionValue: config.sessionType === 'count' ? config.questionCount! : config.timeMinutes!,
        mode: config.mode,
        startedAt: new Date(),
        totalCorrect: 0,
        totalAttempted: 0,
      };

      // Persist to localStorage in demo mode
      if (shouldUseLocalStorage()) {
        saveLocalSession(session);
      }
    }

    set({
      session,
      startTime: new Date(),
      timeRemaining: config.sessionType === 'timed' ? config.timeMinutes! * 60 : null,
      isLoading: false,
      questions: [],
      retryQueue: [],
      recentSubTopics: [],
      questionNumber: 0,
    });

    // Generate first question
    await get().nextQuestion();
  },

  nextQuestion: async () => {
    const { config, session, questionNumber, questions, retryQueue, recentSubTopics } = get();
    if (!config || !session) return;

    set({ isGenerating: true, questionStartTime: new Date() });

    const nextNumber = questionNumber + 1;

    // Check if we should do a retry question
    const retryItem = retryQueue.find(r => r.scheduledPosition === nextNumber);
    const isRetry = !!retryItem;

    // Get the previous question details for variety (if not a retry)
    const lastQuestion = !isRetry && questions.length > 0 ? questions[questions.length - 1] : undefined;
    const previousQuestion = lastQuestion?.questionText;
    const previousGenre = lastQuestion?.genre;
    const previousSubTopic = lastQuestion?.subTopic;

    // Randomly pick one topic from the combined preset + custom pool (for
    // variety). A single-topic pool still passes the one topic explicitly.
    const topicPool: string[] = [...(config.topics ?? []), ...(config.customTopics ?? [])];
    let selectedTopic: string | undefined;
    if (topicPool.length > 0 && !isRetry) {
      selectedTopic = topicPool[Math.floor(Math.random() * topicPool.length)];
    }

    try {
      const generated = await generateQuestion({
        theme: config.theme,
        customTheme: config.customTheme,
        gradeLevel: config.gradeLevel,
        topics: config.topics,
        customTopics: config.customTopics,
        topicDifficulties: config.topicDifficulties,
        previousQuestion,
        previousGenre,
        previousSubTopic,
        recentSubTopics,
        selectedTopic,
        isRetry,
        retryGenre: retryItem?.genre,
      });

      const savedQuestion = await persistGeneratedQuestion(session.id, generated, nextNumber);

      // Update recent sub-topics (keep last 5)
      const newRecentSubTopics = [...recentSubTopics, generated.subTopic].slice(-5);

      set({
        currentQuestion: { ...savedQuestion, generated },
        questionNumber: nextNumber,
        recentSubTopics: newRecentSubTopics,
        isGenerating: false,
      });
    } catch (error) {
      console.error('Error generating question:', error);
      set({ isGenerating: false });
    }
  },

  // Generate a fresh question testing the same concept as the one just answered,
  // so the student can immediately "try again" with a similar but different problem.
  tryAgainSimilar: async () => {
    const { config, session, currentQuestion, questionNumber } = get();
    if (!config || !session || !currentQuestion) return;

    set({ isGenerating: true, questionStartTime: new Date() });

    const nextNumber = questionNumber + 1;

    try {
      const generated = await generateQuestion({
        theme: config.theme,
        customTheme: config.customTheme,
        gradeLevel: config.gradeLevel,
        topics: config.topics,
        customTopics: config.customTopics,
        topicDifficulties: config.topicDifficulties,
        isRetry: true,
        retryGenre: currentQuestion.genre,
        retrySubTopic: currentQuestion.subTopic,
      });

      const savedQuestion = await persistGeneratedQuestion(session.id, generated, nextNumber);

      set({
        currentQuestion: { ...savedQuestion, generated },
        questionNumber: nextNumber,
        isGenerating: false,
      });
    } catch (error) {
      console.error('Error generating similar question:', error);
      set({ isGenerating: false });
    }
  },

  submitAnswer: async (userAnswer: string) => {
    const { currentQuestion, session, questions, questionNumber, questionStartTime, retryQueue } = get();
    if (!currentQuestion || !session) {
      return { isCorrect: false, correctAnswer: '', explanation: '', genre: '', subTopic: '', difficulty: '', timeSpent: 0 };
    }

    const timeSpent = questionStartTime
      ? Math.round((new Date().getTime() - questionStartTime.getTime()) / 1000)
      : 0;

    const isCorrect = checkAnswer(userAnswer, currentQuestion.correctAnswer);

    // Update question in database or localStorage
    if (shouldUseLocalStorage()) {
      updateLocalQuestion(currentQuestion.id, {
        userAnswer,
        isCorrect,
        timeSpentSeconds: timeSpent,
      });
    } else {
      await updateQuestion(currentQuestion.id, {
        userAnswer,
        isCorrect,
        timeSpentSeconds: timeSpent,
      });
    }

    // Update local question record
    const updatedQuestion: Question = {
      ...currentQuestion,
      userAnswer,
      isCorrect,
      timeSpentSeconds: timeSpent,
    };

    // Handle retry queue for spaced repetition
    let newRetryQueue = [...retryQueue];

    if (!isCorrect) {
      // Find if this was a retry question
      const retryItem = retryQueue.find(r => r.scheduledPosition === questionNumber);

      if (retryItem) {
        // They got a retry wrong - reset to +3
        newRetryQueue = newRetryQueue.filter(r => r.scheduledPosition !== questionNumber);
        newRetryQueue.push({
          genre: currentQuestion.genre,
          originalQuestionId: retryItem.originalQuestionId,
          scheduledPosition: questionNumber + 3,
          retryAttempt: 1,
        });
      } else {
        // New wrong answer - schedule retry at +3
        newRetryQueue.push({
          genre: currentQuestion.genre,
          originalQuestionId: currentQuestion.id,
          scheduledPosition: questionNumber + 3,
          retryAttempt: 1,
        });
      }
    } else {
      // Correct answer - check if this was a retry
      const retryItem = retryQueue.find(r => r.scheduledPosition === questionNumber);

      if (retryItem) {
        // Remove from queue
        newRetryQueue = newRetryQueue.filter(r => r.scheduledPosition !== questionNumber);

        if (retryItem.retryAttempt === 1) {
          // First retry correct - schedule second retry at +9 from now
          newRetryQueue.push({
            genre: retryItem.genre,
            originalQuestionId: retryItem.originalQuestionId,
            scheduledPosition: questionNumber + 9,
            retryAttempt: 2,
          });
        }
        // If retryAttempt === 2 and correct, they're done with this concept!
      }
    }

    // Update session totals
    const newQuestions = [...questions, updatedQuestion];
    const totalCorrect = newQuestions.filter(q => q.isCorrect).length;

    const updatedSession = {
      ...session,
      totalCorrect,
      totalAttempted: newQuestions.length,
    };

    if (shouldUseLocalStorage()) {
      updateLocalSession(session.id, {
        totalCorrect,
        totalAttempted: newQuestions.length,
      });
    } else {
      await updateSession(session.id, {
        totalCorrect,
        totalAttempted: newQuestions.length,
      });
    }

    set({
      questions: newQuestions,
      retryQueue: newRetryQueue,
      session: updatedSession,
    });

    return {
      isCorrect,
      correctAnswer: currentQuestion.correctAnswer,
      explanation: currentQuestion.explanation,
      genre: currentQuestion.genre,
      subTopic: currentQuestion.subTopic,
      difficulty: currentQuestion.difficulty,
      timeSpent,
    };
  },

  endSession: async () => {
    const { session, questions } = get();
    if (!session) return;

    const totalCorrect = questions.filter(q => q.isCorrect).length;
    const endedAt = new Date();

    if (shouldUseLocalStorage()) {
      updateLocalSession(session.id, {
        endedAt,
        totalCorrect,
        totalAttempted: questions.length,
      });
    } else {
      await updateSession(session.id, {
        endedAt,
        totalCorrect,
        totalAttempted: questions.length,
      });
    }

    set({
      session: {
        ...session,
        endedAt,
        totalCorrect,
        totalAttempted: questions.length,
      },
    });
  },

  tick: () => {
    const { timeRemaining, config } = get();
    if (timeRemaining === null || config?.sessionType !== 'timed') return;

    const newTime = timeRemaining - 1;
    set({ timeRemaining: newTime });

    // In race mode, end immediately when time hits 0
    // In chill mode, allow current question to finish (handled in UI)
  },

  reset: () => {
    set({
      config: null,
      session: null,
      currentQuestion: null,
      questionNumber: 0,
      startTime: null,
      questionStartTime: null,
      timeRemaining: null,
      retryQueue: [],
      recentSubTopics: [],
      questions: [],
      isLoading: false,
      isGenerating: false,
    });
  },

  // History helpers for demo mode
  getSessionHistory: () => {
    if (shouldUseLocalStorage()) {
      return getLocalSessions().sort((a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );
    }
    return [];
  },

  getSessionQuestions: (sessionId: string) => {
    if (shouldUseLocalStorage()) {
      return getLocalSessionQuestions(sessionId);
    }
    return [];
  },
}));
