import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSessionStore } from '../stores/sessionStore';
import {
  THEME_LABELS,
  TOPIC_LABELS,
  DIFFICULTY_LABELS,
  DIFFICULTY_FULL_LABELS,
  DIFFICULTIES,
  sessionToConfig,
} from '../types';
import type { Session, Difficulty } from '../types';

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

  // Snapshot the history once on mount (it won't change while on this page).
  const sessions = useMemo(() => getSessionHistory(), [getSessionHistory]);
  const [startingId, setStartingId] = useState<string | null>(null);

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

        {sessions.length === 0 ? (
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
  const isTopicMode = !!session.topics && session.topics.length > 0;

  const accuracy = session.totalAttempted > 0
    ? Math.round((session.totalCorrect / session.totalAttempted) * 100)
    : 0;

  const sessionTypeLabel = session.sessionType === 'count'
    ? `${session.sessionValue} questions`
    : `${session.sessionValue} min${session.mode === 'race' ? ' • Race' : ' • Chill'}`;

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
        {isTopicMode && session.topics!.map((topic) => {
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
      </div>

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
