import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSessionStore } from '../stores/sessionStore';
import { getSavedSettings, saveSettings, recentCustomTopicsFromSessions, PRESET_QUESTION_COUNTS, PRESET_TIME_OPTIONS } from '../lib/localStorage';
import type { SelectionMode } from '../lib/localStorage';
import type { Theme, GradeLevel, SessionType, SessionMode, Topic, Difficulty, TopicDifficultySettings, QuestionFormat } from '../types';
import { THEME_LABELS, GRADE_LEVELS, TOPICS, TOPIC_LABELS, DIFFICULTIES, DIFFICULTY_LABELS, DIFFICULTY_FULL_LABELS, QUESTION_FORMATS, QUESTION_FORMAT_LABELS, QUESTION_FORMAT_DESCRIPTIONS } from '../types';

// Visual flair for the pickers.
const THEME_EMOJI: Record<Theme, string> = {
  football: '🏈',
  baseball: '⚾',
  princesses: '👑',
  pokemon: '⚡',
  minecraft: '⛏️',
  lego: '🧱',
  standard: '🌍',
  custom: '✨',
};

const TOPIC_EMOJI: Record<Topic, string> = {
  'addition': '➕',
  'subtraction': '➖',
  'multiplication': '✖️',
  'division': '➗',
  'fractions': '🍕',
  'decimals': '🔟',
  'percentages': '💯',
  'integers': '🌡️',
  'exponents-roots': '🧮',
  'statistics': '📊',
  'word-problems': '📖',
  'pre-algebra': '🔤',
  'algebra': '🧩',
  'geometry': '📐',
  'trigonometry': '📏',
  'pre-calculus': '📈',
  'calculus': '∫',
};

// A settings section: white card with a colored icon bubble in the header.
function SectionCard({
  icon,
  title,
  subtitle,
  accent,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  accent: string; // tailwind bg class for the icon bubble
  children: ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl shadow-xl p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center text-xl shadow-sm`}>{icon}</div>
        <div>
          <h2 className="text-lg font-bold text-gray-800 leading-tight">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function ConfigPage() {
  const navigate = useNavigate();
  const { profile, logout, login, isDemoMode, isUsingDemoLogin } = useAuthStore();
  const { setConfig, startSession, getSessionHistory } = useSessionStore();

  // Local loading state for the entire startup process
  const [isStarting, setIsStarting] = useState(false);

  // Local-play banner: lets the user (re)send the sign-in link that merges
  // this device's play into their account.
  const [linkSent, setLinkSent] = useState(false);
  const handleResendLink = async () => {
    if (!profile?.email) return;
    const { error } = await login(profile.email);
    if (!error) setLinkSent(true);
  };

  // Progress stats for the welcome strip, derived from session history.
  const [stats, setStats] = useState({ sessions: 0, questions: 0, correct: 0 });

  // Form state
  const [theme, setTheme] = useState<Theme>('standard');
  const [customTheme, setCustomTheme] = useState('');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('grade');
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>('3');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [customTopics, setCustomTopics] = useState<string[]>([]);
  const [customTopicInput, setCustomTopicInput] = useState('');
  // Recently used custom ("special") topics, offered in a dropdown when the
  // input is focused. Tapping one adds it to the selected custom topics.
  const [recentTopics, setRecentTopics] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  // Derive recents (and the welcome-strip stats) from session history — the
  // sessions on the History page — so past custom topics are offered, not
  // just ones from newly started sessions. Falls back to the locally recorded
  // recents if history fails.
  useEffect(() => {
    let active = true;
    getSessionHistory()
      .then((sessions) => {
        if (!active) return;
        setRecentTopics(recentCustomTopicsFromSessions(sessions));
        setStats({
          sessions: sessions.length,
          questions: sessions.reduce((sum, s) => sum + (s.totalAttempted || 0), 0),
          correct: sessions.reduce((sum, s) => sum + (s.totalCorrect || 0), 0),
        });
      })
      .catch(() => { if (active) setRecentTopics(recentCustomTopicsFromSessions([])); });
    return () => { active = false; };
  }, [getSessionHistory]);
  // Recents not already selected, filtered by whatever has been typed so far.
  const recentTopicQuery = customTopicInput.trim().toLowerCase();
  const recentTopicOptions = recentTopics.filter(
    (t) =>
      !customTopics.some((c) => c.toLowerCase() === t.toLowerCase()) &&
      (recentTopicQuery === '' || t.toLowerCase().includes(recentTopicQuery))
  );
  const [topicDifficulties, setTopicDifficulties] = useState<TopicDifficultySettings>(() => {
    // Default: all difficulties enabled for all topics
    const defaults: TopicDifficultySettings = {} as TopicDifficultySettings;
    TOPICS.forEach(topic => {
      defaults[topic] = ['easy', 'medium', 'hard', 'super-hard'];
    });
    return defaults;
  });
  const [questionFormats, setQuestionFormats] = useState<QuestionFormat[]>(['word']);
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
      if (saved.questionFormats && saved.questionFormats.length > 0) {
        setQuestionFormats(saved.questionFormats);
      }
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

  // Add a custom topic (trimmed, de-duplicated, case-insensitive).
  const addCustomTopicValue = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setCustomTopics(prev =>
      prev.some(t => t.toLowerCase() === value.toLowerCase()) ? prev : [...prev, value]
    );
  };

  // Add whatever was typed in the input, then clear it.
  const addCustomTopic = () => {
    addCustomTopicValue(customTopicInput);
    setCustomTopicInput('');
  };

  const removeCustomTopic = (topic: string) => {
    setCustomTopics(prev => prev.filter(t => t !== topic));
  };

  // Toggle a problem style, keeping at least one selected.
  const toggleFormat = (fmt: QuestionFormat) => {
    setQuestionFormats(prev => {
      if (prev.includes(fmt)) {
        const next = prev.filter(f => f !== fmt);
        return next.length === 0 ? prev : next; // don't allow removing the last
      }
      return [...prev, fmt];
    });
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
        questionFormats,
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
        questionFormats,
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

  // Derived bits for the summary/quick-start UI.
  const canStart =
    !isStarting &&
    !(theme === 'custom' && !customTheme.trim()) &&
    !(selectionMode === 'topics' && topics.length === 0 && customTopics.length === 0);
  const effectiveCount = customQuestionCount ? parseInt(customQuestionCount) : questionCount;
  const effectiveMinutes = customTime ? parseInt(customTime) : timeMinutes;
  const themeSummary = theme === 'custom' ? (customTheme.trim() || 'Custom theme') : THEME_LABELS[theme];
  const practiceSummary = selectionMode === 'grade'
    ? `Grade ${gradeLevel}`
    : (() => {
        const names = [...topics.map((t) => TOPIC_LABELS[t]), ...customTopics];
        if (names.length === 0) return 'No topics yet';
        return names.length <= 2 ? names.join(' & ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
      })();
  const styleSummary = questionFormats.map((f) => QUESTION_FORMAT_LABELS[f]).join(' + ');
  const lengthSummary = sessionType === 'count'
    ? `${effectiveCount} questions`
    : `${effectiveMinutes} min · ${mode === 'race' ? 'Race' : 'Chill'}`;
  const accuracy = stats.questions > 0 ? Math.round((stats.correct / stats.questions) * 100) : null;
  const firstName = profile?.displayName?.split(/[\s@.]/)[0] || 'there';

  const summaryChips = [
    { icon: THEME_EMOJI[theme], text: themeSummary },
    { icon: selectionMode === 'grade' ? '🎓' : '🎯', text: practiceSummary },
    { icon: questionFormats.includes('numerical') && !questionFormats.includes('word') ? '🔢' : '📖', text: styleSummary },
    { icon: sessionType === 'count' ? '🔢' : '⏱️', text: lengthSummary },
  ];

  const startButtonContent = isStarting ? (
    <span className="flex items-center justify-center gap-3">
      <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      Generating first question...
    </span>
  ) : (
    '🏋️ Start Training!'
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-500 via-indigo-600 to-purple-700 p-4 pb-28">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Welcome strip */}
        <header className="text-white">
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div>
              <p className="text-sm font-semibold text-blue-100 tracking-wide uppercase">Michael's Math Gymnasium</p>
              <h1 className="text-3xl sm:text-4xl font-extrabold mt-1">
                Welcome back, {firstName}! <span className="inline-block">🏋️</span>
              </h1>
              <p className="text-blue-100 mt-1">Ready to train your brain? Set up a session below.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/history')}
                className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-colors"
              >
                📚 History
              </button>
              <button
                onClick={logout}
                className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Progress stats */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-center">
              <div className="text-3xl font-extrabold">{stats.sessions}</div>
              <div className="text-xs sm:text-sm text-blue-100 mt-1">Sessions</div>
            </div>
            <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-center">
              <div className="text-3xl font-extrabold">{stats.questions}</div>
              <div className="text-xs sm:text-sm text-blue-100 mt-1">Questions</div>
            </div>
            <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-center">
              <div className="text-3xl font-extrabold">{accuracy === null ? '—' : `${accuracy}%`}</div>
              <div className="text-xs sm:text-sm text-blue-100 mt-1">Accuracy</div>
            </div>
          </div>
        </header>

        {/* Local-play notice: a backend is configured but this device hasn't
            signed in yet. Tapping the emailed link merges local play into the
            account and switches to cloud storage. */}
        {!isDemoMode && isUsingDemoLogin && (
          <div className="bg-white/15 border border-white/30 text-white rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold">Playing locally as {profile?.email}.</span>{' '}
              Tap the sign-in link we emailed you to save your progress to your account and sync across devices.
            </div>
            <button
              onClick={handleResendLink}
              disabled={linkSent}
              className="text-sm font-semibold bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-70 px-3 py-1.5 rounded-lg transition-colors"
            >
              {linkSent ? 'Link sent ✓' : 'Resend link'}
            </button>
          </div>
        )}

        {/* Quick start */}
        <section className="bg-gradient-to-r from-amber-300 to-orange-400 rounded-2xl shadow-xl p-5 sm:p-6 text-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-extrabold">⚡ Quick start</h2>
              <p className="text-sm text-gray-800/80 mt-0.5">Jump straight in with your current setup — or tweak it below.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {summaryChips.map((c) => (
                  <span key={c.text + c.icon} className="inline-flex items-center gap-1 bg-white/70 text-gray-800 text-sm font-medium px-3 py-1 rounded-full">
                    <span>{c.icon}</span>{c.text}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="bg-gray-900 hover:bg-black disabled:bg-gray-500 text-white font-bold py-3 px-6 rounded-xl text-lg shadow-lg transition-colors whitespace-nowrap"
            >
              {isStarting ? 'Starting…' : 'Go! →'}
            </button>
          </div>
        </section>

        {/* Theme */}
        <SectionCard icon="🎭" title="Pick a theme" subtitle="Every problem gets a story from this world" accent="bg-pink-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(THEME_LABELS) as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-3 py-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                  theme === t
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md scale-[1.02]'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <span className="text-3xl leading-none">{THEME_EMOJI[t]}</span>
                <span className="text-sm font-semibold">{THEME_LABELS[t]}</span>
              </button>
            ))}
          </div>
          {theme === 'custom' && (
            <input
              type="text"
              value={customTheme}
              onChange={(e) => setCustomTheme(e.target.value)}
              placeholder="Enter your custom theme (e.g., Dinosaurs, Space)"
              className="mt-3 w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          )}
        </SectionCard>

        {/* Practice by */}
        <SectionCard icon="🎯" title="What to practice" subtitle="By grade level, or hand-pick the topics" accent="bg-purple-100">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              onClick={() => setSelectionMode('grade')}
              className={`px-4 py-4 rounded-xl border-2 text-left transition-all ${
                selectionMode === 'grade'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-semibold">🎓 Grade Level</div>
              <div className="text-sm text-gray-500">Age-appropriate mix of topics</div>
            </button>
            <button
              onClick={() => setSelectionMode('topics')}
              className={`px-4 py-4 rounded-xl border-2 text-left transition-all ${
                selectionMode === 'topics'
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-semibold">🎯 Specific Topics</div>
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
                  className={`px-4 py-3 rounded-xl border-2 min-w-[52px] font-semibold transition-all ${
                    gradeLevel === g
                      ? 'border-blue-500 bg-blue-500 text-white shadow-md'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
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
              <div className="grid gap-2 sm:grid-cols-2">
                {TOPICS.map((topic) => (
                  <div
                    key={topic}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                      topics.includes(topic)
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200'
                    }`}
                  >
                    <button
                      onClick={() => toggleTopic(topic)}
                      className={`flex-1 text-left font-medium flex items-center gap-2 ${
                        topics.includes(topic) ? 'text-purple-700' : 'text-gray-600'
                      }`}
                    >
                      <span className="text-lg leading-none">{TOPIC_EMOJI[topic]}</span>
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
                  ✨ Add your own special topic
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={customTopicInput}
                      onChange={(e) => setCustomTopicInput(e.target.value)}
                      onFocus={() => setShowRecent(true)}
                      onBlur={() => setShowRecent(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomTopic();
                        }
                      }}
                      placeholder="e.g., Lowest common denominators"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />

                    {/* Most recent special topics — tap to add to the selection */}
                    {showRecent && recentTopicOptions.length > 0 && (
                      <div
                        // Keep the input focused when tapping an option so the
                        // list stays open and several can be added in a row.
                        onMouseDown={(e) => e.preventDefault()}
                        className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border-2 border-gray-200 rounded-lg shadow-lg overflow-hidden"
                      >
                        <div className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-200">
                          Most recent special topics — tap to add
                        </div>
                        {recentTopicOptions.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => addCustomTopicValue(t)}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 active:bg-indigo-100 transition-colors"
                          >
                            + {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
        </SectionCard>

        {/* Problem style */}
        <SectionCard icon="🧠" title="Problem style" subtitle="Story problems, plain equations, or both" accent="bg-blue-100">
          <div className="grid grid-cols-2 gap-3">
            {QUESTION_FORMATS.map((fmt) => {
              const selected = questionFormats.includes(fmt);
              return (
                <button
                  key={fmt}
                  onClick={() => toggleFormat(fmt)}
                  className={`px-4 py-4 rounded-xl border-2 text-left transition-all ${
                    selected
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
                      selected ? 'bg-blue-500 text-white' : 'bg-gray-200 text-transparent'
                    }`}>✓</span>
                    <span className="font-semibold">{fmt === 'word' ? '📖 ' : '🔢 '}{QUESTION_FORMAT_LABELS[fmt]}</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">{QUESTION_FORMAT_DESCRIPTIONS[fmt]}</div>
                </button>
              );
            })}
          </div>
          {questionFormats.length === 2 && (
            <p className="mt-2 text-xs text-gray-500">Both selected — questions will mix word problems and plain equations.</p>
          )}
        </SectionCard>

        {/* Session length */}
        <SectionCard icon="⏱️" title="How long" subtitle="A set number of questions, or a timer" accent="bg-green-100">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSessionType('count')}
              className={`px-4 py-4 rounded-xl border-2 text-left transition-all ${
                sessionType === 'count'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-semibold">🔢 Question Count</div>
              <div className="text-sm text-gray-500">Answer a set number of questions</div>
            </button>
            <button
              onClick={() => setSessionType('timed')}
              className={`px-4 py-4 rounded-xl border-2 text-left transition-all ${
                sessionType === 'timed'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-semibold">⏱️ Timed Session</div>
              <div className="text-sm text-gray-500">Practice for a set duration</div>
            </button>
          </div>

          {/* Question Count or Time Options */}
          {sessionType === 'count' ? (
            <div className="mt-4">
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
                    className={`px-4 py-3 rounded-xl border-2 min-w-[60px] font-semibold transition-all ${
                      questionCount === n && !customQuestionCount
                        ? 'border-blue-500 bg-blue-500 text-white shadow-md'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
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
                  className={`px-4 py-3 border-2 rounded-xl w-24 transition-all ${
                    customQuestionCount
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                />
              </div>
            </div>
          ) : (
            <div className="mt-4">
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
                    className={`px-4 py-3 rounded-xl border-2 min-w-[60px] font-semibold transition-all ${
                      timeMinutes === n && !customTime
                        ? 'border-blue-500 bg-blue-500 text-white shadow-md'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
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
                  className={`px-4 py-3 border-2 rounded-xl w-24 transition-all ${
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
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Timer Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode('chill')}
                  className={`px-4 py-4 rounded-xl border-2 text-left transition-all ${
                    mode === 'chill'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">😌 Chill Mode</div>
                  <div className="text-sm text-gray-500">Finish current question when time ends</div>
                </button>
                <button
                  onClick={() => setMode('race')}
                  className={`px-4 py-4 rounded-xl border-2 text-left transition-all ${
                    mode === 'race'
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">🏁 Race Mode</div>
                  <div className="text-sm text-gray-500">Session ends immediately at time</div>
                </button>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Sticky start bar: always reachable, shows what's been picked */}
        <div className="sticky bottom-4 z-30">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-3 sm:p-4 border border-white/60">
            <div className="flex flex-wrap gap-1.5 mb-3 justify-center">
              {summaryChips.map((c) => (
                <span key={c.text + c.icon} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-1 rounded-full">
                  <span>{c.icon}</span>{c.text}
                </span>
              ))}
            </div>
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 px-6 rounded-xl text-xl transition-all shadow-lg hover:shadow-xl"
            >
              {startButtonContent}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
