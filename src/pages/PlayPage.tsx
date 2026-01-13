import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { NumericKeypad } from '../components/NumericKeypad';
import { Scratchpad } from '../components/Scratchpad';
import { getKeypadConfig } from '../types';

interface FeedbackState {
  show: boolean;
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
  genre: string;
}

export function PlayPage() {
  const navigate = useNavigate();
  const {
    config,
    session,
    currentQuestion,
    questionNumber,
    timeRemaining,
    isGenerating,
    tick,
    submitAnswer,
    nextQuestion,
    endSession,
  } = useSessionStore();

  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<FeedbackState>({
    show: false,
    isCorrect: false,
    correctAnswer: '',
    explanation: '',
    genre: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if no session
  useEffect(() => {
    if (!session || !config) {
      navigate('/');
    }
  }, [session, config, navigate]);

  // Timer tick
  useEffect(() => {
    if (config?.sessionType !== 'timed' || timeRemaining === null) return;

    const interval = setInterval(() => {
      tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [config?.sessionType, timeRemaining, tick]);

  // Check for session end (timed)
  useEffect(() => {
    if (config?.sessionType !== 'timed' || timeRemaining === null) return;

    if (timeRemaining <= 0) {
      if (config.mode === 'race') {
        // Race mode: end immediately
        handleEndSession();
      }
      // Chill mode: allow current question to finish (handled in UI)
    }
  }, [timeRemaining, config]);

  // Check for session end (count)
  useEffect(() => {
    if (config?.sessionType !== 'count' || !config.questionCount) return;

    // This is handled after answering in handleSubmit
  }, [config, questionNumber]);

  const handleSubmit = useCallback(async () => {
    if (!answer.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const result = await submitAnswer(answer);

    setFeedback({
      show: true,
      isCorrect: result.isCorrect,
      correctAnswer: result.correctAnswer,
      explanation: result.explanation,
      genre: result.genre,
    });

    setIsSubmitting(false);
  }, [answer, submitAnswer, isSubmitting]);

  const handleNext = useCallback(async () => {
    setFeedback({ show: false, isCorrect: false, correctAnswer: '', explanation: '', genre: '' });
    setAnswer('');

    // Check if session should end
    const { config, questions } = useSessionStore.getState();

    if (config?.sessionType === 'count' && config.questionCount) {
      if (questions.length >= config.questionCount) {
        await handleEndSession();
        return;
      }
    }

    if (config?.sessionType === 'timed' && timeRemaining !== null && timeRemaining <= 0) {
      await handleEndSession();
      return;
    }

    await nextQuestion();
  }, [nextQuestion, timeRemaining]);

  const handleEndSession = async () => {
    await endSession();
    navigate('/summary');
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!config || !session) {
    return null;
  }

  const keypadConfig = getKeypadConfig(config.gradeLevel);
  const isTimedAndExpired = config.sessionType === 'timed' && timeRemaining !== null && timeRemaining <= 0;
  const canContinue = config.mode === 'chill' || !isTimedAndExpired;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-500 to-purple-600 flex flex-col">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-sm p-3 flex justify-between items-center">
        <div className="text-white">
          <span className="font-bold">Question {questionNumber}</span>
          {config.sessionType === 'count' && config.questionCount && (
            <span className="text-blue-200"> of {config.questionCount}</span>
          )}
        </div>

        {config.sessionType === 'timed' && timeRemaining !== null && (
          <div className={`font-mono font-bold text-xl ${timeRemaining <= 60 ? 'text-red-300' : 'text-white'}`}>
            {formatTime(timeRemaining)}
          </div>
        )}

        <button
          onClick={handleEndSession}
          className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg text-sm transition-colors"
        >
          End Session
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden">
        {/* Question */}
        <div className="bg-white rounded-2xl p-4 shadow-lg">
          {isGenerating ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <span className="ml-3 text-gray-600">Generating question...</span>
            </div>
          ) : currentQuestion ? (
            <p className="text-lg text-gray-800 leading-relaxed">
              {currentQuestion.questionText}
            </p>
          ) : (
            <p className="text-gray-500 text-center">Loading...</p>
          )}
        </div>

        {/* Scratchpad */}
        <div className="h-[400px]">
          <Scratchpad disabled={feedback.show || isGenerating} />
        </div>

        {/* Feedback or Keypad */}
        {feedback.show ? (
          <div className={`rounded-2xl p-4 shadow-lg ${feedback.isCorrect ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'}`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{feedback.isCorrect ? '🎉' : '😅'}</span>
              <div>
                <h3 className={`font-bold text-lg ${feedback.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                  {feedback.isCorrect ? 'Correct!' : 'Not quite...'}
                </h3>
                {!feedback.isCorrect && (
                  <p className="text-gray-600">
                    The answer was: <strong>{feedback.correctAnswer}</strong>
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded-full capitalize">
                  {feedback.genre.replace(/-/g, ' ')}
                </span>
              </div>
              <h4 className="font-semibold text-gray-700 mb-1">How to solve it:</h4>
              <p className="text-gray-600 text-sm">{feedback.explanation}</p>
            </div>

            {canContinue ? (
              <button
                onClick={handleNext}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                {isTimedAndExpired ? 'See Results' : 'Next Question'}
              </button>
            ) : (
              <button
                onClick={handleEndSession}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                Time's Up! See Results
              </button>
            )}
          </div>
        ) : (
          <NumericKeypad
            value={answer}
            onChange={setAnswer}
            onSubmit={handleSubmit}
            config={keypadConfig}
            disabled={isGenerating || isSubmitting || !currentQuestion}
          />
        )}
      </div>
    </div>
  );
}
