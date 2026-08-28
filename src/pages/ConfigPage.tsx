import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSessionStore } from '../stores/sessionStore';
import { getSavedSettings, saveSettings } from '../lib/localStorage';
import type { SelectionMode } from '../lib/localStorage';
import type { Theme, GradeLevel, SessionType, SessionMode, Topic, Difficulty, TopicDifficultySettings } from '../types';
import { THEME_LABELS, GRADE_LEVELS, TOPICS, TOPIC_LABELS, DIFFICULTIES, DIFFICULTY_LABELS, DIFFICULTY_FULL_LABELS } from '../types';

const PRESET_QUESTION_COUNTS = [5, 10, 15, 20];
const PRESET_TIME_OPTIONS = [5, 10, 15];

export function ConfigPage() {
  const navigate = useNavigate();
  const { profile, logout } = useAuthStore();
  const { setConfig, startSession } = useSessionStore();

  // Local loading state for the entire startup process
  const [isStarting, setIsStarting] = useState(false);

  // Form state
  const [theme, setTheme] = useState<Theme>('standard');
  const [customTheme, setCustomTheme] = useState('');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('grade');
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>('3');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [customTopics, setCustomTopics] = useState<string[]>([]);
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [topicDifficulties, setTopicDifficulties] = useState<TopicDifficultySettings>(() => {
    // Default: all difficulties enabled for all topics
    const defaults: TopicDifficultySettings = {} as TopicDifficultySettings;
    TOPICS.forEach(topic => {
      defaults[topic] = ['easy', 'medium', 'hard', 'super-hard'];
    });
    return defaults;
  });
  const [sessionType, setSessionType] = useState<SessionType>('count');
  const [questionCount, setQuestionCount] = useState(10);
  const [customQuestionCount, setCustomQuestionCount] = useState('');
  const [timeMinutes, setTimeMinutes] = useState(10);
  const [customTime, setCustomTime] = useState('');
  const [mode, setMode] = useState<SessionMode>('chill');

  // Load saved settings on mount
  useEffect(() => {
    const saved = getSavedSettings();
    if (saved) {
      setTheme(saved.theme);
      setCustomTheme(saved.customTheme || '');
      setSelectionMode(saved.selectionMode || 'grade');
      setGradeLevel(saved.gradeLevel);
      setTopics(saved.topics || []);
      setCustomTopics(saved.customTopics || []);
      if (saved.topicDifficulties) {
        setTopicDifficulties(saved.topicDifficulties);
      }
      setSessionType(saved.sessionType);
      setQuestionCount(saved.questionCount);
      setCustomQuestionCount(saved.customQuestionCount);
      setTimeMinutes(saved.timeMinutes);
      setCustomTime(saved.customTime);
      setMode(saved.mode);
    }
  }, []);

  // Toggle a topic selection
  const toggleTopic = (topic: Topic) => {
    setTopics(prev =>
      prev.includes(topic)
        ? prev.filter(t => t !== topic)
        : [...prev, topic]
    );
  };

  // Add the typed custom topic (trimmed, de-duplicated, case-insensitive).
  const addCustomTopic = () => {
    const value = customTopicInput.trim();
    if (!value) return;
    setCustomTopics(prev =>
      prev.some(t => t.toLowerCase() === value.toLowerCase()) ? prev : [...prev, value]
    );
    setCustomTopicInput('');
  };

  const removeCustomTopic = (topic: string) => {
    setCustomTopics(prev => prev.filter(t => t !== topic));
  };

  // Toggle a difficulty for a specific topic
  const toggleTopicDifficulty = (topic: Topic, difficulty: Difficulty) => {
    setTopicDifficulties(prev => {
      const current = prev[topic] || [];
      const newDifficulties = current.includes(difficulty)
        ? current.filter(d => d !== difficulty)
        : [...current, difficulty];
      // Ensure at least one difficulty is selected
      if (newDifficulties.length === 0) {
        return prev; // Don't allow removing the last difficulty
      }
      return { ...prev, [topic]: newDifficulties };
    });
  };

  const handleStart = async () => {
    setIsStarting(true);

    try {
      // Save settings for next time
      saveSettings({
        theme,
        customTheme,
        selectionMode,
        gradeLevel,
        topics,
        customTopics,
        topicDifficulties,
        sessionType,
        questionCount,
        customQuestionCount,
        timeMinutes,
        customTime,
        mode,
      });

      const config = {
        theme,
        customTheme: theme === 'custom' ? customTheme : undefined,
        // Only include gradeLevel if in grade mode, only include topics if in topics mode
        gradeLevel: selectionMode === 'grade' ? gradeLevel : undefined,
        topics: selectionMode === 'topics' ? topics : undefined,
        customTopics: selectionMode === 'topics' && customTopics.length > 0 ? customTopics : undefined,
        topicDifficulties: selectionMode === 'topics' ? topicDifficulties : undefined,
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
    } finally {
      setIsStarting(false);
    }
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/history')}
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-colors"
            >
              History
            </button>
            <button
              onClick={logout}
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
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

          {/* Selection Mode Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Practice By</label>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => setSelectionMode('grade')}
                className={`px-4 py-4 rounded-lg border-2 transition-all ${
                  selectionMode === 'grade'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold">Grade Level</div>
                <div className="text-sm text-gray-500">Age-appropriate mix of topics</div>
              </button>
              <button
                onClick={() => setSelectionMode('topics')}
                className={`px-4 py-4 rounded-lg border-2 transition-all ${
                  selectionMode === 'topics'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold">Specific Topics</div>
                <div className="text-sm text-gray-500">Choose what to practice</div>
              </button>
            </div>

            {/* Grade Level Selection */}
            {selectionMode === 'grade' && (
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
            )}

            {/* Topics Selection */}
            {selectionMode === 'topics' && (
              <div>
                <div className="space-y-2">
                  {TOPICS.map((topic) => (
                    <div
                      key={topic}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                        topics.includes(topic)
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <button
                        onClick={() => toggleTopic(topic)}
                        className={`flex-1 text-left font-medium ${
                          topics.includes(topic) ? 'text-purple-700' : 'text-gray-600'
                        }`}
                      >
                        {TOPIC_LABELS[topic]}
                      </button>
                      {topics.includes(topic) && (
                        <div className="flex gap-1">
                          {DIFFICULTIES.map((diff) => {
                            const isEnabled = topicDifficulties[topic]?.includes(diff);
                            return (
                              <div key={diff} className="relative group">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTopicDifficulty(topic, diff);
                                  }}
                                  className={`px-2 py-1 text-xs font-bold rounded transition-all ${
                                    isEnabled
                                      ? diff === 'easy' ? 'bg-green-500 text-white' :
                                        diff === 'medium' ? 'bg-yellow-500 text-white' :
                                        diff === 'hard' ? 'bg-orange-500 text-white' :
                                        'bg-red-500 text-white'
                                      : 'bg-gray-200 text-gray-400'
                                  }`}
                                >
                                  {DIFFICULTY_LABELS[diff]}
                                </button>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                  {DIFFICULTY_FULL_LABELS[diff]}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Custom (free-text) topics */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Add your own topic
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customTopicInput}
                      onChange={(e) => setCustomTopicInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomTopic();
                        }
                      }}
                      placeholder="e.g., Lowest common denominators"
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={addCustomTopic}
                      disabled={!customTopicInput.trim()}
                      className="px-5 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Each problem must have a single numeric answer (e.g. a number or a fraction like 3/4).
                  </p>

                  {customTopics.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {customTopics.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-700 pl-3 pr-2 py-1.5 rounded-full text-sm font-medium"
                        >
                          {t}
                          <button
                            type="button"
                            onClick={() => removeCustomTopic(t)}
                            className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-indigo-200 text-indigo-500"
                            aria-label={`Remove ${t}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {topics.length === 0 && customTopics.length === 0 && (
                  <p className="mt-3 text-sm text-amber-600">Select or add at least one topic to continue</p>
                )}
              </div>
            )}
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
            disabled={
              isStarting ||
              (theme === 'custom' && !customTheme.trim()) ||
              (selectionMode === 'topics' && topics.length === 0 && customTopics.length === 0)
            }
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 px-6 rounded-xl text-xl transition-all shadow-lg hover:shadow-xl"
          >
            {isStarting ? (
              <span className="flex items-center justify-center gap-3">
                <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating first question...
              </span>
            ) : (
              'Start Training!'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
