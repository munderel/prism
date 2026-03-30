'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Menu, MessageSquare } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { useRef, useState } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';

interface TopBarProps {
  onMenuToggle?: () => void;
}

export function TopBar({ onMenuToggle }: TopBarProps) {
  const { data: session } = useSession();
  const [showFeedback, setShowFeedback] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useClickOutside(feedbackRef, () => setShowFeedback(false), showFeedback);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim()) return;
    setFeedbackSending(true);
    try {
      await fetch('/api/settings/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: feedbackText }),
      });
      setFeedbackText('');
      setShowFeedback(false);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    }
    setFeedbackSending(false);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--border-color)] bg-background/80 backdrop-blur-sm px-6">
      <div className="flex items-center gap-3 lg:hidden">
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/">
          <h1 className="text-lg font-bold font-display prism-text">
            Prism
          </h1>
        </Link>
      </div>
      <div className="ml-auto flex items-center gap-4">
        {session?.user && (
          <>
            {/* Feedback Button */}
            <div className="relative" ref={feedbackRef}>
              <button
                onClick={() => setShowFeedback(!showFeedback)}
                className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                title="Give feedback"
              >
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Feedback</span>
              </button>
              {showFeedback && (
                <div className="absolute right-0 top-10 w-72 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] p-3 shadow-xl z-50">
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="How can we improve Prism?"
                    className="w-full rounded-md border border-[var(--border-color)] bg-[var(--hover-bg)] p-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-indigo-500 focus:outline-none resize-none"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => setShowFeedback(false)}
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmitFeedback}
                      disabled={feedbackSending || !feedbackText.trim()}
                      className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {feedbackSending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <span className="text-sm text-[var(--text-secondary)]">{session.user.name}</span>
            {session.user.isAdmin && (
              <span className="text-[10px] font-medium bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 rounded-md px-1.5 py-0.5">
                Admin
              </span>
            )}
            {session.user.image && (
              <Image
                src={session.user.image}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-full"
              />
            )}
            <button
              onClick={() => signOut()}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  );
}
