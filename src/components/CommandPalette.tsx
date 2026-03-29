'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Target, CheckSquare, Lightbulb, ClipboardCheck, Flame } from 'lucide-react';

interface SearchResult {
  id: string;
  title: string;
  type: 'task' | 'goal' | 'idea' | 'review' | 'aim';
  url: string;
}

const TYPE_CONFIG = {
  task: { icon: CheckSquare, color: 'text-indigo-400', label: 'Task' },
  goal: { icon: Target, color: 'text-blue-400', label: 'Goal' },
  idea: { icon: Lightbulb, color: 'text-amber-400', label: 'Idea' },
  review: { icon: ClipboardCheck, color: 'text-green-400', label: 'Review' },
  aim: { icon: Flame, color: 'text-teal-400', label: 'AIM' },
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Cmd+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setQuery('');
      setResults([]);
      setSelected(0);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    const searchResults: SearchResult[] = [];

    // Search tasks, goals, ideas in parallel
    const [tasksRes, goalsRes, ideasRes] = await Promise.all([
      fetch(`/api/tasks?search=${encodeURIComponent(q)}`).catch(() => null),
      fetch(`/api/goals?search=${encodeURIComponent(q)}`).catch(() => null),
      fetch(`/api/ideas?search=${encodeURIComponent(q)}`).catch(() => null),
    ]);

    if (tasksRes?.ok) {
      const tasks = await tasksRes.json();
      for (const t of (Array.isArray(tasks) ? tasks : []).slice(0, 5)) {
        searchResults.push({ id: t.id, title: t.title, type: 'task', url: '/tasks' });
      }
    }
    if (goalsRes?.ok) {
      const goals = await goalsRes.json();
      for (const g of (Array.isArray(goals) ? goals : []).slice(0, 5)) {
        searchResults.push({ id: g.id, title: g.title, type: 'goal', url: '/goals' });
      }
    }
    if (ideasRes?.ok) {
      const ideas = await ideasRes.json();
      for (const i of (Array.isArray(ideas) ? ideas : []).slice(0, 5)) {
        searchResults.push({ id: i.id, title: i.title, type: 'idea', url: '/ideas' });
      }
    }

    setResults(searchResults);
    setSelected(0);
    setLoading(false);
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    router.push(result.url);
  };

  // Arrow key navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[selected]) {
      handleSelect(results[selected]);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg mx-4 rounded-xl bg-[var(--surface)] shadow-2xl border border-[var(--border-color)] overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)]">
          <Search className="h-5 w-5 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, goals, ideas..."
            className="flex-1 bg-transparent text-[var(--text-primary)] text-sm focus:outline-none placeholder:text-[var(--text-muted)]"
          />
          <kbd className="hidden sm:block text-[10px] text-[var(--text-muted)] border border-[var(--border-color)] rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <p className="text-sm text-[var(--text-muted)] px-4 py-3">Searching...</p>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <p className="text-sm text-[var(--text-muted)] px-4 py-3">No results found.</p>
          )}
          {results.map((result, i) => {
            const config = TYPE_CONFIG[result.type];
            const Icon = config.icon;
            return (
              <button
                key={result.id}
                onClick={() => handleSelect(result)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                  i === selected ? 'bg-indigo-600/15 text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
                }`}
              >
                <Icon className={`h-4 w-4 ${config.color}`} />
                <span className="flex-1 truncate">{result.title}</span>
                <span className={`text-xs ${config.color}`}>{config.label}</span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--border-color)] flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
          <span><kbd className="border border-[var(--border-color)] rounded px-1">↑↓</kbd> Navigate</span>
          <span><kbd className="border border-[var(--border-color)] rounded px-1">↵</kbd> Open</span>
          <span><kbd className="border border-[var(--border-color)] rounded px-1">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
