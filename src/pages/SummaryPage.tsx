import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { formatMathText } from '../lib/openai';
import { MistakeAnalysis } from '../components/MistakeAnalysis';
import { THEME_LABELS } from '../types';

export function SummaryPage() {
  const navigate = useNavigate();
  const { session, questions, config, reset } = useSessionStore();

  const handleNewSession = () => {
    reset();
    navigate('/');
  };

  const handlePlayAgain = () => {
    // Keep the config but reset the session
    const currentConfig = config;
    reset();
    if (currentConfig) {
      useSessionStore.getState().setConfig(currentConfig);
    }
    navigate('/');
  };

  if (!session || !config) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 text-center">
          <p className="text-gray-600 mb-4">No session data found.</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const correctCount = questions.filter(q => q.isCorrect).length;
  const totalCount = questions.length;
  const percentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const totalTime = questions.reduce((sum, q) => sum + (q.timeSpentSeconds || 0), 0);
  const avgTime = totalCount > 0 ? Math.round(totalTime / totalCount) : 0;

  const getPerformanceEmoji = () => {
    if (percentage >= 90) return '🏆';
    if (percentage >= 70) return '🌟';
    if (percentage >= 50) return '👍';
    return '💪';
  };

  const getPerformanceMessage = () => {
    if (percentage >= 90) return 'Outstanding!';
    if (percentage >= 70) return 'Great job!';
    if (percentage >= 50) return 'Good effort!';
    return 'Keep practicing!';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-500 to-purple-600 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center text-white mb-6">
          <h1 className="text-3xl font-bold">Session Complete!</h1>
          <p className="text-blue-200">
            {THEME_LABELS[config.theme]} • Grade {config.gradeLevel}
          </p>
        </div>

        {/* Score Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 mb-4">
          <div className="text-center mb-6">
            <span className="text-6xl">{getPerformanceEmoji()}</span>
            <h2 className="text-2xl font-bold text-gray-800 mt-2">{getPerformanceMessage()}</h2>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="text-3xl font-bold text-blue-600">{correctCount}/{totalCount}</div>
              <div className="text-sm text-gray-600">Correct</div>
            </div>
            <div className="bg-green-50 rounded-xl p-4">
              <div className="text-3xl font-bold text-green-600">{percentage}%</div>
              <div className="text-sm text-gray-600">Accuracy</div>
            </div>
            <div className="bg-purple-50 rounded-xl p-4">
              <div className="text-3xl font-bold text-purple-600">{avgTime}s</div>
              <div className="text-sm text-gray-600">Avg Time</div>
            </div>
          </div>
        </div>

        {/* Question Review */}
        <div className="bg-white rounded-2xl shadow-2xl p-4 mb-4">
          <h3 className="font-bold text-gray-800 mb-4">Question Review</h3>

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {questions.map((q, index) => (
              <div
                key={q.id}
                className={`rounded-xl p-4 border-2 ${
                  q.isCorrect
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`text-xl ${q.isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                    {q.isCorrect ? '✓' : '✗'}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-500">#{index + 1}</span>
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                        {q.genre}
                      </span>
                      {q.timeSpentSeconds && (
                        <span className="text-xs text-gray-400">
                          {q.timeSpentSeconds}s
                        </span>
                      )}
                    </div>
                    <p className="text-gray-800 text-sm mb-2">{formatMathText(q.questionText)}</p>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <span className="text-gray-600">
                        Your answer: <strong className={q.isCorrect ? 'text-green-600' : 'text-red-600'}>{q.userAnswer || '(none)'}</strong>
                      </span>
                      {!q.isCorrect && (
                        <span className="text-gray-600">
                          Correct: <strong className="text-green-600">{formatMathText(q.correctAnswer)}</strong>
                        </span>
                      )}
                    </div>
                    {!q.isCorrect && (
                      <div className="mt-2 text-sm text-gray-500 bg-white rounded p-2">
                        {formatMathText(q.explanation)}
                      </div>
                    )}
                    {!q.isCorrect && (
                      <MistakeAnalysis
                        className="mt-2"
                        question={q.questionText}
                        userAnswer={q.userAnswer}
                        correctAnswer={q.correctAnswer}
                        explanation={q.explanation}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handlePlayAgain}
            className="bg-white hover:bg-gray-50 text-gray-800 font-bold py-4 px-6 rounded-xl transition-colors"
          >
            Same Settings
          </button>
          <button
            onClick={handleNewSession}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-xl transition-colors"
          >
            New Session
          </button>
        </div>
      </div>
    </div>
  );
}
