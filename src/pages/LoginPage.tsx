import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, isLoading, isDemoMode } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    const { error: loginError } = await login(email.trim());

    if (loginError) {
      setError(loginError.message);
    } else if (isDemoMode) {
      // In demo mode, login is immediate - redirect to home
      navigate('/');
    } else {
      // In production, show "check your email" message
      setSubmitted(true);
    }
  };

  const handleDemoMode = async () => {
    setError(null);
    const { error: loginError } = await login('Demo User');

    if (loginError) {
      setError(loginError.message);
    } else {
      navigate('/');
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">📧</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Check Your Email!</h1>
          <p className="text-gray-600 mb-6">
            We sent a magic link to <strong>{email}</strong>. Click the link in the email to sign in.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setEmail('');
            }}
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🏋️</div>
          <h1 className="text-3xl font-bold text-gray-800">Michael's Math Gymnasium</h1>
          <p className="text-gray-600 mt-2">Train your brain with fun math problems!</p>
        </div>

        {!isDemoMode && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="michael@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                disabled={isLoading}
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
            >
              {isLoading ? 'Loading...' : 'Send Magic Link'}
            </button>

            <p className="text-center text-gray-500 text-sm">
              No password needed! We'll send you a magic link to sign in.
            </p>
          </form>
        )}

        {/* Demo Mode Button */}
        <div className={!isDemoMode ? 'mt-6 pt-6 border-t border-gray-200' : ''}>
          {!isDemoMode && (
            <p className="text-center text-gray-500 text-sm mb-4">Or try without an account</p>
          )}
          <button
            onClick={handleDemoMode}
            disabled={isLoading}
            className={`w-full font-bold py-4 px-6 rounded-lg text-lg transition-colors ${
              isDemoMode
                ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white'
                : 'bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700'
            }`}
          >
            {isLoading ? 'Loading...' : isDemoMode ? 'Start Demo' : 'Try Demo Mode'}
          </button>
          <p className="text-center text-gray-400 text-xs mt-2">
            Demo data is saved locally in your browser
          </p>
        </div>
      </div>
    </div>
  );
}
