'use client';

import { useEffect, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

type InviteData = {
  id: string;
  email: string;
  role: string;
  status: string;
  invitedByName: string;
  createdAt: string;
};

export default function AcceptInvitePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { status: sessionStatus, data: session } = useSession();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [showSwitchAccount, setShowSwitchAccount] = useState(false);

  useEffect(() => {
    fetchInvite();
  }, [id]);

  // If the invitation was already accepted during the OAuth flow (by events.signIn)
  // and the current user owns it, redirect to dashboard instead of showing an error.
  useEffect(() => {
    if (
      invite?.status === 'ACCEPTED' &&
      sessionStatus === 'authenticated' &&
      session?.user?.email?.toLowerCase() === invite.email.toLowerCase()
    ) {
      router.push('/');
    }
  }, [invite, sessionStatus, session, router]);

  // If the user is already authenticated, auto-attempt to accept the invite
  useEffect(() => {
    if (
      sessionStatus === 'authenticated' &&
      invite &&
      invite.status === 'PENDING' &&
      !accepting &&
      !accepted &&
      !error
    ) {
      acceptInvitation();
    }
  }, [sessionStatus, invite]);

  const fetchInvite = async () => {
    try {
      const res = await fetch(`/api/invitations/${id}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Invitation not found');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setInvite(data);

      if (data.status === 'ACCEPTED') {
        setError('This invitation has already been accepted.');
      } else if (data.status === 'REVOKED') {
        setError('This invitation has been revoked.');
      } else if (data.status === 'EXPIRED') {
        setError('This invitation has expired. Please ask your admin to send a new one.');
      }
    } catch {
      setError('Failed to load invitation');
    } finally {
      setLoading(false);
    }
  };

  const acceptInvitation = async () => {
    setAccepting(true);
    setError('');
    try {
      const res = await fetch(`/api/invitations/${id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 403) setShowSwitchAccount(true);
        setError(data.error || 'Failed to accept invitation');
        setAccepting(false);
        return;
      }
      setAccepted(true);
      // Redirect to dashboard after a brief delay
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch {
      setError('Failed to accept invitation');
      setAccepting(false);
    }
  };

  const buildCallbackUrl = () =>
    token
      ? `/accept-invite/${id}?token=${encodeURIComponent(token)}`
      : `/accept-invite/${id}`;

  const handleAcceptClick = async () => {
    if (sessionStatus === 'authenticated') {
      acceptInvitation();
    } else {
      // Clear any stale session cookie first to prevent NextAuth's
      // callbackHandler from linking a new Google account to the
      // previously-logged-in user (cross-user account linking bug).
      await signOut({ redirect: false });
      signIn('google', { callbackUrl: buildCallbackUrl() });
    }
  };

  const handleSwitchAccount = async () => {
    await signOut({ redirect: false });
    signIn('google', { callbackUrl: buildCallbackUrl() });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="w-full max-w-md text-center">
          <div className="animate-pulse">
            <div className="h-8 w-32 bg-gray-800 rounded mx-auto mb-4" />
            <div className="h-4 w-48 bg-gray-800 rounded mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-white mb-2">
            <span className="text-indigo-400">Pr</span>ism
          </h1>
          <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900/50 p-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-600/20">
              <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Welcome to Prism!</h2>
            <p className="text-gray-400 text-sm">
              Your invitation has been accepted. Redirecting to your dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-white mb-2">
          <span className="text-indigo-400">Pr</span>ism
        </h1>
        <p className="text-gray-400 mb-8">
          Dopaminergic goal management for your team
        </p>

        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-8">
          {error ? (
            <>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-600/20">
                <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">
                Unable to Accept Invitation
              </h2>
              <p className="text-gray-400 text-sm mb-6">{error}</p>
              {showSwitchAccount ? (
                <button
                  onClick={handleSwitchAccount}
                  className="flex items-center justify-center gap-3 w-full px-6 py-3 bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Sign in with the correct Google account
                </button>
              ) : (
                <a
                  href="/login"
                  className="inline-block rounded-lg bg-gray-800 px-6 py-3 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Go to Login
                </a>
              )}
            </>
          ) : invite ? (
            <>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600/20">
                <svg className="h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                You&apos;ve been invited to join Prism
              </h2>
              <p className="text-gray-400 text-sm mb-1">
                <span className="text-gray-300 font-medium">{invite.invitedByName}</span> has invited you to join their team on Prism.
              </p>
              <p className="text-gray-500 text-xs mb-6">
                Invitation sent to {invite.email}
              </p>

              {accepting ? (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600/20 px-6 py-3">
                  <svg className="h-5 w-5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-indigo-300 text-sm font-medium">Accepting invitation...</span>
                </div>
              ) : (
                <button
                  onClick={handleAcceptClick}
                  className="flex items-center justify-center gap-3 w-full px-6 py-3 bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors"
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
                  Accept Invitation with Google
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
