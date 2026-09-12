import { useState } from 'react';
import { analyzeMistake, formatMathText } from '../lib/openai';

interface MistakeAnalysisProps {
  question: string;
  userAnswer?: string;
  correctAnswer: string;
  explanation?: string; // always sent to the analyzer; shown only if showExplanation
  showExplanation?: boolean;
  className?: string;
}

// A reusable "Analyze Answer" affordance for a wrong answer: a button that
// lazily fetches a kid-friendly explanation of the specific mistake.
export function MistakeAnalysis({
  question,
  userAnswer,
  correctAnswer,
  explanation,
  showExplanation = false,
  className = '',
}: MistakeAnalysisProps) {
  const [open, setOpen] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setOpen(true);
    if (analysis !== null || loading) return;
    setLoading(true);
    try {
      const result = await analyzeMistake({ question, userAnswer, correctAnswer, explanation });
      setAnalysis(result || "Sorry, couldn't analyze this one right now.");
    } catch {
      setAnalysis("Sorry, couldn't analyze this one right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      {!open && (
        <button
          onClick={handleClick}
          className="inline-flex items-center gap-1 text-sm font-semibold text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          🔍 Analyze Answer
        </button>
      )}

      {open && (
        <div className="space-y-2">
          {showExplanation && explanation && (
            <div className="text-sm text-gray-600 bg-white rounded-lg p-2 border border-gray-200">
              <span className="font-semibold text-gray-700">How to solve it: </span>
              {formatMathText(explanation)}
            </div>
          )}
          <div className="text-sm text-gray-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <span className="font-semibold text-amber-800">What went wrong: </span>
            {loading ? (
              <span className="inline-flex items-center gap-1 text-gray-500">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
                Analyzing…
              </span>
            ) : (
              analysis
            )}
          </div>
        </div>
      )}
    </div>
  );
}
