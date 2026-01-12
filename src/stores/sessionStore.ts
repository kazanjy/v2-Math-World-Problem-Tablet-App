import { create } from 'zustand';
import type { SessionConfig, Session, Question, GeneratedQuestion } from '../types';
import { generateQuestion, checkAnswer } from '../lib/openai';
import { createSession, saveQuestion, updateQuestion, updateSession } from '../lib/supabase';

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

  // Session results
  questions: Question[];

  // Loading state
  isLoading: boolean;
  isGenerating: boolean;

  // Actions
  setConfig: (config: SessionConfig) => void;
  startSession: (userId: string) => Promise<void>;
  nextQuestion: () => Promise<void>;
  submitAnswer: (userAnswer: string) => Promise<{ isCorrect: boolean; correctAnswer: string; explanation: string }>;
  endSession: () => Promise<void>;
  tick: () => void; // For timer
  reset: () => void;
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
  questions: [],
  isLoading: false,
  isGenerating: false,

  setConfig: (config) => set({ config }),

  startSession: async (userId: string) => {
    const { config } = get();
    if (!config) return;

    set({ isLoading: true });

    const session = await createSession({
      userId,
      theme: config.theme,
      customTheme: config.customTheme,
      gradeLevel: config.gradeLevel,
      sessionType: config.sessionType,
      sessionValue: config.sessionType === 'count' ? config.questionCount! : config.timeMinutes!,
      mode: config.mode,
    });

    if (session) {
      set({
        session,
        startTime: new Date(),
        timeRemaining: config.sessionType === 'timed' ? config.timeMinutes! * 60 : null,
        isLoading: false,
        questions: [],
        retryQueue: [],
        questionNumber: 0,
      });

      // Generate first question
      await get().nextQuestion();
    } else {
      set({ isLoading: false });
    }
  },

  nextQuestion: async () => {
    const { config, session, questionNumber, questions, retryQueue } = get();
    if (!config || !session) return;

    set({ isGenerating: true, questionStartTime: new Date() });

    const nextNumber = questionNumber + 1;

    // Check if we should do a retry question
    const retryItem = retryQueue.find(r => r.scheduledPosition === nextNumber);
    const isRetry = !!retryItem;

    // Get the previous question for variety (if not a retry)
    const previousQuestion = !isRetry && questions.length > 0
      ? questions[questions.length - 1].questionText
      : undefined;

    try {
      const generated = await generateQuestion({
        theme: config.theme,
        customTheme: config.customTheme,
        gradeLevel: config.gradeLevel,
        previousQuestion,
        isRetry,
        retryGenre: retryItem?.genre,
      });

      // Save question to database (without answer yet)
      const savedQuestion = await saveQuestion({
        sessionId: session.id,
        questionText: generated.question,
        correctAnswer: generated.answer,
        explanation: generated.explanation,
        genre: generated.genre,
        questionOrder: nextNumber,
      });

      if (savedQuestion) {
        set({
          currentQuestion: { ...savedQuestion, generated },
          questionNumber: nextNumber,
          isGenerating: false,
        });
      }
    } catch (error) {
      console.error('Error generating question:', error);
      set({ isGenerating: false });
    }
  },

  submitAnswer: async (userAnswer: string) => {
    const { currentQuestion, session, questions, questionNumber, questionStartTime, retryQueue } = get();
    if (!currentQuestion || !session) {
      return { isCorrect: false, correctAnswer: '', explanation: '' };
    }

    const timeSpent = questionStartTime
      ? Math.round((new Date().getTime() - questionStartTime.getTime()) / 1000)
      : 0;

    const isCorrect = checkAnswer(userAnswer, currentQuestion.correctAnswer);

    // Update question in database
    await updateQuestion(currentQuestion.id, {
      userAnswer,
      isCorrect,
      timeSpentSeconds: timeSpent,
    });

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

    await updateSession(session.id, {
      totalCorrect,
      totalAttempted: newQuestions.length,
    });

    set({
      questions: newQuestions,
      retryQueue: newRetryQueue,
      session: {
        ...session,
        totalCorrect,
        totalAttempted: newQuestions.length,
      },
    });

    return {
      isCorrect,
      correctAnswer: currentQuestion.correctAnswer,
      explanation: currentQuestion.explanation,
    };
  },

  endSession: async () => {
    const { session, questions } = get();
    if (!session) return;

    const totalCorrect = questions.filter(q => q.isCorrect).length;

    await updateSession(session.id, {
      endedAt: new Date(),
      totalCorrect,
      totalAttempted: questions.length,
    });

    set({
      session: {
        ...session,
        endedAt: new Date(),
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
      questions: [],
      isLoading: false,
      isGenerating: false,
    });
  },
}));
