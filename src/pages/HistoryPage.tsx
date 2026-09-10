import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSessionStore } from '../stores/sessionStore';
import { formatMathText, analyzeMistake } from '../lib/openai';
import {
  THEME_LABELS,
  TOPIC_LABELS,
  DIFFICULTY_LABELS,
  DIFFICULTY_FULL_LABELS,
  DIFFICULTIES,
  sessionToConfig,
} from '../types';
import type { Session, Question, Difficulty } from '../types';

const DIFFICULTY_CHIP_COLORS: Record<Difficulty, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard: 'bg-orange-100 text-orange-700',
  'super-hard': 'bg-red-100 text-red-700',
};

function formatDate(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function HistoryPage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { getSessionHistory, setConfig, startSession, reset } = useSessionStore();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);

  // Load history on mount (localStorage in demo mode, Supabase otherwise).
  useEffect(() => {
    let active = true;
    getSessionHistory()
      .then((s) => { if (active) setSessions(s); })
      .catch((err) => console.error('Error loading history:', err))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [getSessionHistory]);

  const handleStartAgain = async (session: Session) => {
    if (!profile || startingId) return;

    setStartingId(session.id);
    try {
      // Clear any leftover state, then start fresh with the saved settings.
      reset();
      setConfig(sessionToConfig(session));
      await startSession(profile.id);
      navigate('/play');
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-500 to-purple-600 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Session History</h1>
            <p className="text-blue-100">Replay any past session with the same settings</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Back
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
            <p className="text-gray-500">Loading your sessions…</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <span className="text-5xl">📚</span>
            <h2 className="text-xl font-bold text-gray-800 mt-3 mb-1">No past sessions yet</h2>
            <p className="text-gray-500 mb-6">Finish a session and it will show up here so you can run it again.</p>
            <button
              onClick={() => navigate('/')}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-3 px-6 rounded-xl transition-all"
            >
              Start a New Session
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isStarting={startingId === session.id}
                disabled={startingId !== null}
                onStartAgain={() => handleStartAgain(session)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SessionCardProps {
  session: Session;
  isStarting: boolean;
  disabled: boolean;
  onStartAgain: () => void;
}

function SessionCard({ session, isStarting, disabled, onStartAgain }: SessionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const presetTopics = session.topics ?? [];
  const customTopics = session.customTopics ?? [];
  const isTopicMode = presetTopics.length > 0 || customTopics.length > 0;

  const accuracy = session.totalAttempted > 0
    ? Math.round((session.totalCorrect / session.totalAttempted) * 100)
    : 0;

  const sessionTypeLabel = session.sessionType === 'count'
    ? `${session.sessionValue} questions`
    : `${session.sessionValue} min${session.mode === 'race' ? ' • Race' : ' • Chill'}`;

  const toggleReview = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && questions === null && !loadingQuestions) {
      setLoadingQuestions(true);
      try {
        const qs = await useSessionStore.getState().getSessionQuestions(session.id);
        setQuestions(qs);
      } catch (err) {
        console.error('Error loading questions:', err);
        setQuestions([]);
      } finally {
        setLoadingQuestions(false);
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-4">
      <div className="flex justify-between items-start gap-3 mb-3">
        <div>
          <h3 className="font-bold text-gray-800">
            {THEME_LABELS[session.theme]}
            {session.theme === 'custom' && session.customTheme ? `: ${session.customTheme}` : ''}
          </h3>
          <p className="text-xs text-gray-400">{formatDate(session.startedAt)}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-gray-800">
            {session.totalCorrect}/{session.totalAttempted}
          </div>
          <div className="text-xs text-gray-500">{accuracy}% correct</div>
        </div>
      </div>

      {/* Settings metadata */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
          {isTopicMode ? 'Topics' : `Grade ${session.gradeLevel ?? '3'}`}
        </span>
        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
          {sessionTypeLabel}
        </span>
        {presetTopics.map((topic) => {
          const diffs = session.topicDifficulties?.[topic];
          const limited = diffs && diffs.length > 0 && diffs.length < DIFFICULTIES.length;
          return (
            <span
              key={topic}
              className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-100 px-2 py-1 rounded-full"
            >
              {TOPIC_LABELS[topic]}
              {limited && (
                <span className="inline-flex gap-0.5">
                  {diffs!.map((d) => (
                    <span
                      key={d}
                      title={DIFFICULTY_FULL_LABELS[d]}
                      className={`px-1 rounded ${DIFFICULTY_CHIP_COLORS[d]}`}
                    >
                      {DIFFICULTY_LABELS[d]}
                    </span>
                  ))}
                </span>
              )}
            </span>
          );
        })}
        {customTopics.map((t) => (
          <span
            key={t}
            className="text-xs font-medium text-indigo-700 bg-indigo-100 px-2 py-1 rounded-full"
          >
            {t}
          </span>
        ))}
      </div>

      {/* Question review (lazy-loaded) */}
      {session.totalAttempted > 0 && (
        <button
          onClick={toggleReview}
          className="w-full flex items-center justify-center gap-1 mb-2 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
        >
          {expanded ? 'Hide questions' : `Review ${session.totalAttempted} question${session.totalAttempted === 1 ? '' : 's'}`}
          <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </button>
      )}

      {expanded && (
        <div className="space-y-2 mb-3 max-h-[360px] overflow-y-auto">
          {loadingQuestions ? (
            <div className="flex items-center justify-center py-4 text-gray-400">
              <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400 mr-2" />
              Loading…
            </div>
          ) : questions && questions.length > 0 ? (
            questions.map((q, index) => (
              <QuestionReviewItem key={q.id} q={q} index={index} />
            ))
          ) : (
            <p className="text-sm text-gray-400 text-center py-2">No question details saved for this session.</p>
          )}
        </div>
      )}

      <button
        onClick={onStartAgain}
        disabled={disabled}
        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-2.5 px-4 rounded-xl transition-all"
      >
        {isStarting ? 'Starting…' : '▶ Start Again'}
      </button>
    </div>
  );
}

function QuestionReviewItem({ q, index }: { q: Question; index: number }) {
  const [showWork, setShowWork] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    if (analyzing) return;
    setShowWork(true);
    if (analysis !== null) return;
    setAnalyzing(true);
    try {
      const result = await analyzeMistake({
        question: q.questionText,
        userAnswer: q.userAnswer,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      });
      setAnalysis(result || "Sorry, couldn't analyze this one right now.");
    } catch {
      setAnalysis("Sorry, couldn't analyze this one right now.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div
      className={`rounded-xl p-3 border ${
        q.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`text-lg leading-none ${q.isCorrect ? 'text-green-500' : 'text-red-500'}`}>
          {q.isCorrect ? '✓' : '✗'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 mb-1">
            <span className="text-gray-400 mr-1">#{index + 1}</span>
            {formatMathText(q.questionText)}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className="text-gray-600">
              Answered:{' '}
              <strong className={q.isCorrect ? 'text-green-600' : 'text-red-600'}>
                {q.userAnswer || '(none)'}
              </strong>
            </span>
            {!q.isCorrect && (
              <span className="text-gray-600">
                Correct: <strong className="text-green-600">{formatMathText(q.correctAnswer)}</strong>
              </span>
            )}
          </div>

          {/* Wrong-answer analysis */}
          {!q.isCorrect && (
            <div className="mt-2">
              <button
                onClick={handleAnalyze}
                className="text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 px-2.5 py-1 rounded-full transition-colors"
              >
                🔍 Analyze what went wrong
              </button>

              {showWork && (
                <div className="mt-2 space-y-2">
                  {q.explanation && (
                    <div className="text-xs text-gray-600 bg-white rounded-lg p-2">
                      <span className="font-semibold text-gray-700">How to solve it: </span>
                      {formatMathText(q.explanation)}
                    </div>
                  )}
                  <div className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    <span className="font-semibold text-amber-800">What went wrong: </span>
                    {analyzing ? (
                      <span className="inline-flex items-center gap-1 text-gray-500">
                        <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400" />
                        Analyzing…
                      </span>
                    ) : (
                      analysis
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
