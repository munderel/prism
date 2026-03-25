'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Trash2, Send } from 'lucide-react';
import { useSession } from 'next-auth/react';

interface TaskCommentsProps {
  taskId: string;
}

export function TaskComments({ taskId }: TaskCommentsProps) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchComments = async () => {
    const res = await fetch(`/api/tasks/${taskId}/comments`);
    if (res.ok) setComments(await res.json());
  };

  useEffect(() => {
    fetchComments();
    return () => { clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const handleContentChange = (value: string) => {
    setContent(value);

    // Detect @mention typing
    const atMatch = value.match(/@([\w.]*)$/);
    if (atMatch) {
      const query = atMatch[1];
      setMentionQuery(query);
      if (query.length >= 1) {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
          const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
          if (res.ok) {
            setMentionResults(await res.json());
            setShowMentions(true);
          }
        }, 200);
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (user: any) => {
    const name = user.name?.split(' ')[0]?.toLowerCase() ?? user.email?.split('@')[0];
    const before = content.replace(/@[\w.]*$/, '');
    setContent(`${before}@${name} `);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    if (!content.trim()) return;
    setSending(true);
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      setContent('');
      fetchComments();
    }
    setSending(false);
  };

  const handleDelete = async (commentId: string) => {
    const res = await fetch(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' });
    if (res.ok) fetchComments();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderWithMentions = (text: string) => {
    const parts = text.split(/(@[\w.]+)/g);
    return parts.map((part, i) =>
      part.match(/^@[\w.]+$/) ? (
        <span key={i} className="text-indigo-400 font-medium">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-[var(--text-secondary)]">Comments</h4>

      {/* Comment list */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {comments.map((comment) => (
          <div key={comment.id} className="group flex gap-2 rounded-lg bg-[var(--surface)] p-3">
            {comment.author?.image ? (
              <img
                src={comment.author.image}
                alt=""
                className="h-6 w-6 rounded-full flex-shrink-0"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-gray-700 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  {comment.author?.name ?? 'Unknown'}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                {renderWithMentions(comment.content)}
              </p>
            </div>
            {(comment.authorId === session?.user?.id || session?.user?.isAdmin) && (
              <button
                onClick={() => handleDelete(comment.id)}
                className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-opacity"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-xs text-[var(--text-muted)]">No comments yet.</p>
        )}
      </div>

      {/* Input */}
      <div className="relative">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment... (use @mention)"
            className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={sending || !content.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {/* @mention dropdown */}
        {showMentions && mentionResults.length > 0 && (
          <div className="absolute bottom-full mb-1 left-0 w-full max-h-40 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] shadow-xl z-10">
            {mentionResults.map((user) => (
              <button
                key={user.id}
                onClick={() => insertMention(user)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-[var(--hover-bg)] transition-colors"
              >
                {user.image ? (
                  <img src={user.image} alt="" className="h-5 w-5 rounded-full" />
                ) : (
                  <div className="h-5 w-5 rounded-full bg-gray-600" />
                )}
                <span className="text-[var(--text-primary)]">{user.name}</span>
                <span className="text-[var(--text-muted)] text-xs">{user.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
