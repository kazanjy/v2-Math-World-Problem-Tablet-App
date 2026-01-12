import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSessionStore } from '../stores/sessionStore';
import type { Theme, GradeLevel, SessionType, SessionMode } from '../types';
import { THEME_LABELS, GRADE_LEVELS } from '../types';

const PRESET_QUESTION_COUNTS = [5, 10, 15, 20];
const PRESET_TIME_OPTIONS = [5, 10, 15];

export function ConfigPage() {
  const navigate = useNavigate();
  const { profile, logout } = useAuthStore();
  const { setConfig, startSession, isLoading } = useSessionStore();

  // Form state
  const [theme, setTheme] = useState<Theme>('standard');
  const [customTheme, setCustomTheme] = useState('');
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>('3');
  const [sessionType, setSessionType] = useState<SessionType>('count');
  const [questionCount, setQuestionCount] = useState(10);
  const [customQuestionCount, setCustomQuestionCount] = useState('');
  const [timeMinutes, setTimeMinutes] = useState(10);
  const [customTime, setCustomTime] = useState('');
  const [mode, setMode] = useState<SessionMode>('chill');

  const handleStart = async () => {
    const config = {
      theme,
      customTheme: theme === 'custom' ? customTheme : undefined,
      gradeLevel,
      sessionType,
      questionCount: sessionType === 'count'
        ? (customQuestionCount ? parseInt(customQuestionCount) : questionCount)
        : undefined,
      timeMinutes: sessionType === 'timed'
        ? (customTime ? parseInt(customTime) : timeMinutes)
        : undefined,
      mode,
    };

    setConfig(config);
    await startSession(profile!.id);
    navigate('/play');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-500 to-purple-600 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Michael's Math Gymnasium</h1>
            <p className="text-blue-100">Welcome, {profile?.displayName}!</p>
          </div>
          <button
            onClick={logout}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* Configuration Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 space-y-6">
          <h2 className="text-xl font-bold text-gray-800">Configure Your Session</h2>

          {/* Theme Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Theme</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(THEME_LABELS) as Theme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`px-4 py-3 rounded-lg border-2 transition-all ${
                    theme === t
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {THEME_LABELS[t]}
                </button>
              ))}
            </div>
            {theme === 'custom' && (
              <input
                type="text"
                value={customTheme}
                onChange={(e) => setCustomTheme(e.target.value)}
                placeholder="Enter your custom theme (e.g., Dinosaurs, Space)"
                className="mt-3 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {/* Grade Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Grade Level</label>
            <div className="flex flex-wrap gap-2">
              {GRADE_LEVELS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGradeLevel(g)}
                  className={`px-4 py-3 rounded-lg border-2 min-w-[50px] transition-all ${
                    gradeLevel === g
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Session Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Session Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSessionType('count')}
                className={`px-4 py-4 rounded-lg border-2 transition-all ${
                  sessionType === 'count'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold">Question Count</div>
                <div className="text-sm text-gray-500">Answer a set number of questions</div>
              </button>
              <button
                onClick={() => setSessionType('timed')}
                className={`px-4 py-4 rounded-lg border-2 transition-all ${
                  sessionType === 'timed'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold">Timed Session</div>
                <div className="text-sm text-gray-500">Practice for a set duration</div>
              </button>
            </div>
          </div>

          {/* Question Count or Time Options */}
          {sessionType === 'count' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Number of Questions
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_QUESTION_COUNTS.map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setQuestionCount(n);
                      setCustomQuestionCount('');
                    }}
                    className={`px-4 py-3 rounded-lg border-2 min-w-[60px] transition-all ${
                      questionCount === n && !customQuestionCount
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  value={customQuestionCount}
                  onChange={(e) => setCustomQuestionCount(e.target.value)}
                  placeholder="Custom"
                  min={1}
                  max={100}
                  className={`px-4 py-3 border-2 rounded-lg w-24 transition-all ${
                    customQuestionCount
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Session Duration (minutes)
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_TIME_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setTimeMinutes(n);
                      setCustomTime('');
                    }}
                    className={`px-4 py-3 rounded-lg border-2 min-w-[60px] transition-all ${
                      timeMinutes === n && !customTime
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {n} min
                  </button>
                ))}
                <input
                  type="number"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  placeholder="Custom"
                  min={1}
                  max={60}
                  className={`px-4 py-3 border-2 rounded-lg w-24 transition-all ${
                    customTime
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                />
              </div>
            </div>
          )}

          {/* Mode Selection (only for timed) */}
          {sessionType === 'timed' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Timer Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode('chill')}
                  className={`px-4 py-4 rounded-lg border-2 transition-all ${
                    mode === 'chill'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">Chill Mode</div>
                  <div className="text-sm text-gray-500">Finish current question when time ends</div>
                </button>
                <button
                  onClick={() => setMode('race')}
                  className={`px-4 py-4 rounded-lg border-2 transition-all ${
                    mode === 'race'
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">Race Mode</div>
                  <div className="text-sm text-gray-500">Session ends immediately at time</div>
                </button>
              </div>
            </div>
          )}

          {/* Start Button */}
          <button
            onClick={handleStart}
            disabled={isLoading || (theme === 'custom' && !customTheme.trim())}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 px-6 rounded-xl text-xl transition-all shadow-lg hover:shadow-xl"
          >
            {isLoading ? 'Starting...' : 'Start Training!'}
          </button>
        </div>
      </div>
    </div>
  );
}
