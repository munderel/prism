'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { Lock, Mail, KeyRound, Eye, EyeOff } from 'lucide-react';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: 'Access denied. You need an invitation to sign in.',
  OAuthAccountNotLinked: 'Access denied. You need an invitation to sign in.',
  access_revoked: 'Your access has been revoked. Contact your admin.',
  Callback: 'Sign in failed due to a server error. Please try again.',
  SignInCallbackError: 'Sign in failed due to a server error. Please try again.',
};

const showDevLogin = process.env.NEXT_PUBLIC_DEV_LOGIN === 'true';

type LoginStep = 'credentials' | '2fa' | '2fa-setup-required';

export default function LoginPage() {
  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error');
    if (urlError && AUTH_ERROR_MESSAGES[urlError]) {
      setError(AUTH_ERROR_MESSAGES[urlError]);
      // Clean URL so error doesn't persist on refresh after issue is resolved
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Dev login
  const [devEmail, setDevEmail] = useState('admin@upwhiten.com');

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn('dev-login', {
      email: devEmail,
      callbackUrl: '/',
      redirect: false,
    });
    if (result?.error) {
      setError('User not found. Run: npx prisma db seed');
      setLoading(false);
    } else {
      window.location.href = '/';
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('password-login', {
      email,
      password,
      totpCode: step === '2fa' ? totpCode : '',
      callbackUrl: '/',
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      if (result.error.includes('2FA_REQUIRED')) {
        setStep('2fa');
        setError('');
        return;
      }
      if (result.error.includes('INVALID_2FA_CODE')) {
        setError('Invalid 2FA code. Please try again.');
        setTotpCode('');
        return;
      }
      if (result.error.includes('2FA_SETUP_REQUIRED')) {
        setStep('2fa-setup-required');
        setError('');
        return;
      }
      setError(step === '2fa' ? 'Authentication failed' : 'Invalid email or password');
      return;
    }

    if (result?.ok) {
      window.location.href = '/';
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-bold text-white mb-2">
          <span className="text-indigo-400">Pr</span>ism
        </h1>
        <p className="text-gray-400 mb-8">
          Dopaminergic goal management for your team
        </p>

        {/* Dev Login — only shown when NEXT_PUBLIC_DEV_LOGIN=true */}
        {showDevLogin && (
          <>
            <form onSubmit={handleDevLogin} className="mb-6 space-y-3">
              <input
                type="email"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                placeholder="Dev email"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-gray-700 px-6 py-3 font-medium text-white hover:bg-gray-600 transition-colors disabled:opacity-50 text-sm"
              >
                {loading ? 'Signing in...' : 'Dev Login'}
              </button>
            </form>
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-800" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-gray-950 px-2 text-gray-500">or</span>
              </div>
            </div>
          </>
        )}

        {/* 2FA Step */}
        {step === '2fa' && (
          <form onSubmit={handlePasswordLogin} className="mb-6 space-y-3">
            <div className="text-left mb-2">
              <button
                type="button"
                onClick={() => { setStep('credentials'); setTotpCode(''); setError(''); }}
                className="text-sm text-gray-500 hover:text-gray-300"
              >
                &larr; Back
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <KeyRound className="w-5 h-5 text-indigo-400 flex-shrink-0" />
              <p className="text-sm text-indigo-300 text-left">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>

            <input
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-white text-center text-2xl tracking-[0.5em] placeholder-gray-600 focus:border-indigo-500 focus:outline-none font-mono"
              autoFocus
              maxLength={6}
              required
            />
            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </form>
        )}

        {/* 2FA Setup Required */}
        {step === '2fa-setup-required' && (
          <div className="mb-6 space-y-3">
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <KeyRound className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <p className="text-amber-300 font-medium">2FA Setup Required</p>
              <p className="text-sm text-gray-400 mt-1">
                Your organization requires two-factor authentication. Please sign in with Google first, then set up 2FA in Settings.
              </p>
            </div>
            <button
              onClick={() => { setLoading(true); signIn('google', { callbackUrl: '/settings' }); }}
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sign in with Google to set up 2FA
            </button>
            <button
              type="button"
              onClick={() => { setStep('credentials'); setError(''); }}
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              &larr; Back to login
            </button>
          </div>
        )}

        {/* Credentials Step */}
        {step === 'credentials' && (
          <>
            <form onSubmit={handlePasswordLogin} className="mb-6 space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-4 h-4 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-4 h-4 text-gray-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 pl-10 pr-10 py-3 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </form>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-800" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-gray-950 px-2 text-gray-500">or</span>
              </div>
            </div>

            <button
              onClick={() => { setLoading(true); signIn('google', { callbackUrl: '/' }); }}
              disabled={loading}
              className="flex items-center justify-center gap-3 w-full px-6 py-3 bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </button>
          </>
        )}

        <p className="text-xs text-gray-600 mt-6">
          Invite-only access. Contact your admin for an invitation.
        </p>
      </div>
    </div>
  );
}
