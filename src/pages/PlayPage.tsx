import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { NumericKeypad } from '../components/NumericKeypad';
import { Scratchpad } from '../components/Scratchpad';
import type { ScratchpadHandle } from '../components/Scratchpad';
import { AnswerPad } from '../components/AnswerPad';
import type { AnswerPadHandle } from '../components/AnswerPad';
import { MistakeAnalysis } from '../components/MistakeAnalysis';
import { recognizeHandwrittenAnswer, formatMathText } from '../lib/openai';
import { getKeypadConfig } from '../types';

type InputMode = 'write' | 'keypad';

interface FeedbackState {
  show: boolean;
  isCorrect: boolean;
  userAnswer: string;
  correctAnswer: string;
  explanation: string;
  genre: string;
  subTopic: string;
  difficulty: string;
  timeSpent: number;
}

export function PlayPage() {
  const navigate = useNavigate();
  const {
    config,
    session,
    currentQuestion,
    questionNumber,
    questions,
    timeRemaining,
    isGenerating,
    tick,
    submitAnswer,
    nextQuestion,
    tryAgainSimilar,
    endSession,
  } = useSessionStore();

  const [answer, setAnswer] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('write');
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognizeError, setRecognizeError] = useState('');
  const [canUndoWrite, setCanUndoWrite] = useState(false);
  const scratchpadRef = useRef<ScratchpadHandle>(null);
  const answerPadRef = useRef<AnswerPadHandle>(null);
  const [feedback, setFeedback] = useState<FeedbackState>({
    show: false,
    isCorrect: false,
    userAnswer: '',
    correctAnswer: '',
    explanation: '',
    genre: '',
    subTopic: '',
    difficulty: '',
    timeSpent: 0,
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

  const submitValue = useCallback(async (value: string) => {
    if (!value.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const result = await submitAnswer(value);

    setFeedback({
      show: true,
      isCorrect: result.isCorrect,
      userAnswer: value,
      correctAnswer: result.correctAnswer,
      explanation: result.explanation,
      genre: result.genre,
      subTopic: result.subTopic,
      difficulty: result.difficulty,
      timeSpent: result.timeSpent,
    });

    setIsSubmitting(false);
  }, [submitAnswer, isSubmitting]);

  // Keypad submit
  const handleSubmit = useCallback(() => submitValue(answer), [submitValue, answer]);

  // Handwriting submit: read the canvas with vision, then submit the result.
  const handleSubmitWritten = useCallback(async () => {
    const pad = answerPadRef.current;
    if (!pad || pad.isEmpty() || isRecognizing || isSubmitting) return;

    const image = pad.toImageDataUrl();
    if (!image) return;

    setIsRecognizing(true);
    setRecognizeError('');
    try {
      const recognized = await recognizeHandwrittenAnswer(image);
      if (!recognized.trim()) {
        setRecognizeError("Hmm, I couldn't read that. Try writing it a bit more clearly.");
        return;
      }
      await submitValue(recognized);
    } finally {
      setIsRecognizing(false);
    }
  }, [isRecognizing, isSubmitting, submitValue]);

  const handleNext = useCallback(async () => {
    setFeedback({ show: false, isCorrect: false, userAnswer: '', correctAnswer: '', explanation: '', genre: '', subTopic: '', difficulty: '', timeSpent: 0 });
    setAnswer('');
    setRecognizeError('');

    // Clear the scratchpad for the new question
    scratchpadRef.current?.clear();

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

  const handleTrySimilar = useCallback(async () => {
    setFeedback({ show: false, isCorrect: false, userAnswer: '', correctAnswer: '', explanation: '', genre: '', subTopic: '', difficulty: '', timeSpent: 0 });
    setAnswer('');
    setRecognizeError('');

    // Fresh problem, fresh scratch paper
    scratchpadRef.current?.clear();

    await tryAgainSimilar();
  }, [tryAgainSimilar]);

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

  const keypadConfig = getKeypadConfig(config.gradeLevel, config.topics, config.customTopics);
  const isTimedAndExpired = config.sessionType === 'timed' && timeRemaining !== null && timeRemaining <= 0;
  const canContinue = config.mode === 'chill' || !isTimedAndExpired;
  // The question just answered is already counted in `questions`, so once we've
  // hit the configured count the session is complete.
  const reachedQuestionCount =
    config.sessionType === 'count' && config.questionCount != null && questions.length >= config.questionCount;
  // When the session is over there's no room for another question, so the
  // "do another like this" option is hidden and only results remain.
  const sessionAtEnd = reachedQuestionCount || isTimedAndExpired;

  return (
    <div className="h-screen bg-gradient-to-b from-blue-500 to-purple-600 flex flex-col">
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
      <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
        {/* Question */}
        <div className="bg-white rounded-2xl p-4 shadow-lg">
          {isGenerating ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <span className="ml-3 text-gray-600">Generating question...</span>
            </div>
          ) : currentQuestion ? (
            <p className="text-xl text-gray-800 leading-relaxed">
              {formatMathText(currentQuestion.questionText)}
            </p>
          ) : (
            <p className="text-gray-500 text-center">Loading...</p>
          )}
        </div>

        {/* Scratchpad - stays usable while reviewing feedback so the student can keep working */}
        <div className="h-[520px]">
          <Scratchpad ref={scratchpadRef} disabled={isGenerating} />
        </div>

        {/* Feedback or Keypad */}
        {feedback.show ? (
          <div className={`rounded-2xl p-4 shadow-lg ${feedback.isCorrect ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'}`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{feedback.isCorrect ? '🎉' : '😅'}</span>
              <div>
                <h3 className={`font-bold text-lg ${feedback.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                  {feedback.isCorrect ? 'Correct!' : 'Not quite!'}
                </h3>
                <p className="text-gray-600">
                  {feedback.isCorrect ? (
                    <>You answered <strong>{feedback.userAnswer}</strong> which was right!</>
                  ) : (
                    <>You answered <strong>{feedback.userAnswer}</strong>, but the right answer was <strong>{formatMathText(feedback.correctAnswer)}</strong>.</>
                  )}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-3 mb-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded-full capitalize">
                  {feedback.genre.replace(/-/g, ' ')}
                </span>
                {feedback.subTopic && feedback.subTopic !== 'general' && (
                  <span className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-1 rounded-full capitalize">
                    {feedback.subTopic.replace(/-/g, ' ')}
                  </span>
                )}
                {feedback.difficulty && (
                  <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${
                    feedback.difficulty === 'easy' ? 'text-green-600 bg-green-100' :
                    feedback.difficulty === 'medium' ? 'text-yellow-600 bg-yellow-100' :
                    feedback.difficulty === 'hard' ? 'text-orange-600 bg-orange-100' :
                    'text-red-600 bg-red-100'
                  }`}>
                    {feedback.difficulty.replace(/-/g, ' ')}
                  </span>
                )}
                {feedback.timeSpent > 0 && (
                  <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                    {feedback.timeSpent >= 60
                      ? `${Math.floor(feedback.timeSpent / 60)}m ${feedback.timeSpent % 60}s`
                      : `${feedback.timeSpent}s`}
                  </span>
                )}
              </div>
              <h4 className="font-semibold text-gray-700 mb-1">How to solve it:</h4>
              <p className="text-gray-600 text-base">{formatMathText(feedback.explanation)}</p>
            </div>

            {!feedback.isCorrect && currentQuestion && (
              <MistakeAnalysis
                className="mb-4"
                question={currentQuestion.questionText}
                userAnswer={feedback.userAnswer}
                correctAnswer={feedback.correctAnswer}
                explanation={feedback.explanation}
              />
            )}

            {canContinue ? (
              <div className="flex flex-col gap-2">
                {!sessionAtEnd && (
                  <button
                    onClick={handleTrySimilar}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-6 rounded-xl transition-colors"
                  >
                    🔄 {feedback.isCorrect ? 'Do Another Like This' : 'Try a Similar One'}
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
                >
                  {sessionAtEnd ? 'See Results' : 'Next Question'}
                </button>
              </div>
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
          <div className="bg-gray-100 p-3 rounded-2xl">
            {/* Input mode tabs */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setInputMode('write')}
                className={`flex-1 py-2 px-4 rounded-xl font-bold transition-all ${
                  inputMode === 'write'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                ✍️ Write
              </button>
              <button
                onClick={() => setInputMode('keypad')}
                className={`flex-1 py-2 px-4 rounded-xl font-bold transition-all ${
                  inputMode === 'keypad'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                ⌨️ Keypad
              </button>
            </div>

            {inputMode === 'write' ? (
              <div>
                <div className="h-[160px]">
                  <AnswerPad
                    ref={answerPadRef}
                    disabled={isGenerating || isSubmitting || isRecognizing || !currentQuestion}
                    onCanUndoChange={setCanUndoWrite}
                  />
                </div>

                {recognizeError && (
                  <p className="mt-2 text-sm text-amber-600">{recognizeError}</p>
                )}

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => answerPadRef.current?.undo()}
                    disabled={isRecognizing || isSubmitting || !canUndoWrite}
                    className="flex items-center gap-1 px-4 py-3 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-bold rounded-xl border border-gray-200 transition-colors"
                    title="Undo last stroke"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                    </svg>
                    Undo
                  </button>
                  <button
                    onClick={() => {
                      answerPadRef.current?.clear();
                      setRecognizeError('');
                    }}
                    disabled={isRecognizing || isSubmitting}
                    className="px-4 py-3 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-bold rounded-xl border border-gray-200 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleSubmitWritten}
                    disabled={isGenerating || isSubmitting || isRecognizing || !currentQuestion}
                    className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {isRecognizing ? (
                      <>
                        <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                        Reading your answer…
                      </>
                    ) : (
                      'Submit'
                    )}
                  </button>
                </div>
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
        )}
      </div>
    </div>
  );
}
