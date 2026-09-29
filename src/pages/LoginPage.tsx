import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

// Capabilities showcased on the landing page.
const FEATURES: { icon: string; title: string; description: string }[] = [
  {
    icon: '🎭',
    title: 'Themed word problems',
    description: 'Pokémon, Minecraft, Lego, sports — or any custom theme you type. Math that feels like play.',
  },
  {
    icon: '🔢',
    title: 'Word or numerical',
    description: 'Story problems, plain equations like 936 ÷ 24 = ?, or a mix of both in one session.',
  },
  {
    icon: '🎯',
    title: '17 topics, K–12',
    description: 'From addition to calculus. Pick a grade level, or hand-pick topics with per-topic difficulty.',
  },
  {
    icon: '✨',
    title: 'Special topics',
    description: 'Type any concept — "Lowest common denominators" — and every question stays laser-focused on it.',
  },
  {
    icon: '✍️',
    title: 'Stylus scratch paper',
    description: 'Infinite scrolling paper with undo, an eraser, and palm rejection. Work it out by hand.',
  },
  {
    icon: '🤖',
    title: 'Handwritten answers',
    description: 'Write your answer with the stylus and AI reads it — or tap it in on the keypad.',
  },
  {
    icon: '💡',
    title: 'Instant feedback',
    description: 'A worked solution for every question, plus "Analyze Answer" to explain exactly what went wrong.',
  },
  {
    icon: '🔁',
    title: 'Smart practice',
    description: '"Try a similar one" on demand, and missed concepts come back later so they actually stick.',
  },
  {
    icon: '⏱️',
    title: 'Your pace',
    description: 'A set number of questions or a timer — chill mode to finish the question, or race mode for a hard stop.',
  },
  {
    icon: '📚',
    title: 'History & replay',
    description: 'Review every question and answer from past sessions, and relaunch any session with one tap.',
  },
  {
    icon: '📱',
    title: 'Made for tablets',
    description: 'Fullscreen, installable to the home screen, and built around a stylus from the ground up.',
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, loginAsDemo, isLoading, isDemoMode } = useAuthStore();

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
    const { error: loginError } = await loginAsDemo();

    if (loginError) {
      setError(loginError.message);
    } else {
      navigate('/');
    }
  };

  const scrollToSignIn = () => {
    document.getElementById('signin')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    <div className="min-h-screen bg-gradient-to-b from-blue-500 via-indigo-600 to-purple-700 text-white">
      <div className="max-w-5xl mx-auto px-4 py-10 sm:py-16">
        {/* Hero */}
        <section className="text-center mb-14">
          <div className="text-7xl mb-4">🏋️</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">Michael's Math Gymnasium</h1>
          <p className="mt-4 text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto">
            Themed math practice built for a tablet and a stylus — write it out, get instant feedback,
            and understand every mistake.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleDemoMode}
              disabled={isLoading}
              className="bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-60 font-bold py-4 px-8 rounded-xl text-lg shadow-lg transition-colors"
            >
              {isLoading ? 'Loading…' : isDemoMode ? 'Start Practicing' : 'Try it now — no account'}
            </button>
            {!isDemoMode && (
              <button
                onClick={scrollToSignIn}
                className="bg-white/15 hover:bg-white/25 border border-white/40 text-white font-bold py-4 px-8 rounded-xl text-lg transition-colors"
              >
                Sign in with email
              </button>
            )}
          </div>
          {error && (
            <div className="mt-4 inline-block bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
        </section>

        {/* Capabilities */}
        <section className="mb-14">
          <h2 className="text-center text-2xl sm:text-3xl font-bold mb-2">Everything in the gym</h2>
          <p className="text-center text-blue-100 mb-8">Every tool your kid needs to actually get better at math.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-5 hover:bg-white/15 transition-colors"
              >
                <div className="text-3xl mb-2">{f.icon}</div>
                <h3 className="font-bold text-lg mb-1">{f.title}</h3>
                <p className="text-sm text-blue-100 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mb-14">
          <h2 className="text-center text-2xl sm:text-3xl font-bold mb-8">How it works</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { n: '1', t: 'Set it up', d: 'Pick a theme, a grade or topics, word or numerical, and how long to practice.' },
              { n: '2', t: 'Work it out', d: 'Read the problem, scribble on the scratch paper, and write your answer with the stylus.' },
              { n: '3', t: 'Learn from it', d: 'See the worked solution, analyze any mistake, try a similar one, and review it all in History.' },
            ].map((s) => (
              <div key={s.n} className="bg-white/10 border border-white/15 rounded-2xl p-5">
                <div className="w-9 h-9 rounded-full bg-white text-blue-700 font-extrabold flex items-center justify-center mb-3">
                  {s.n}
                </div>
                <h3 className="font-bold text-lg mb-1">{s.t}</h3>
                <p className="text-sm text-blue-100 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Sign in */}
        <section id="signin" className="scroll-mt-6">
          <div className="bg-white text-gray-800 rounded-2xl shadow-2xl p-8 max-w-md mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold">Get started</h2>
              <p className="text-gray-600 mt-1">
                {isDemoMode ? 'Jump right in — your progress is saved on this device.' : 'Sign in to save sessions and history across devices.'}
              </p>
            </div>

            {!isDemoMode && (
              <form onSubmit={handleSubmit} className="space-y-5">
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
        </section>

        <p className="text-center text-blue-200/80 text-xs mt-10">
          Tip: on a tablet, use Share → “Add to Home Screen” for a full-screen, app-like experience.
        </p>
      </div>
    </div>
  );
}
