'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import useSWR from 'swr';
import { Search } from 'lucide-react';

interface Assignee {
  id: string;
  name: string | null;
  email: string;
}

interface ProcessData {
  id: string;
  title: string;
  assigneeId: string | null;
  delegateId: string | null;
  delegateUntil: string | null;
  assignee: Assignee | null;
  delegate: Assignee | null;
}

interface BusinessFunction {
  id: string;
  name: string;
  processes: ProcessData[];
}

interface FlatProcess {
  process: ProcessData;
  functionName: string;
  label: string;
}

interface ProcessSearchProps {
  value?: ProcessData | null;
  onChange: (process: ProcessData | null) => void;
  label?: string;
  required?: boolean;
}

export function ProcessSearch({ value, onChange, label, required }: ProcessSearchProps) {
  const { data: functions } = useSWR<BusinessFunction[]>('/api/processes');
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Flatten business functions + processes into a searchable list
  const flatList = useMemo((): FlatProcess[] => {
    if (!functions) return [];
    const items: FlatProcess[] = [];
    for (const fn of functions) {
      for (const proc of fn.processes) {
        const assigneeName = proc.assignee?.name ?? proc.assignee?.email ?? 'Unassigned';
        items.push({
          process: proc,
          functionName: fn.name,
          label: `${fn.name} > ${proc.title} \u2014 ${assigneeName}`,
        });
      }
    }
    return items;
  }, [functions]);

  // Filter by search query
  const filtered = useMemo(() => {
    if (!query.trim()) return flatList;
    const q = query.toLowerCase();
    return flatList.filter((item) => item.label.toLowerCase().includes(q));
  }, [flatList, query]);

  const handleSelect = (item: FlatProcess) => {
    onChange(item.process);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
  };

  // Display value when a process is selected
  const displayValue = useMemo(() => {
    if (!value) return '';
    const match = flatList.find((item) => item.process.id === value.id);
    return match?.label ?? value.title;
  }, [value, flatList]);

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <label className="block text-sm text-[var(--text-secondary)] mb-1">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
        <input
          type="text"
          value={isOpen ? query : displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            if (value) setQuery('');
          }}
          placeholder="Search by function, process, or assignee..."
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] pl-9 pr-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs"
          >
            &times;
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--surface)] shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-[var(--text-muted)]">
              No matching processes
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.process.id}
                type="button"
                onClick={() => handleSelect(item)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--hover-bg)] ${
                  value?.id === item.process.id
                    ? 'text-indigo-400 bg-indigo-600/10'
                    : 'text-[var(--text-primary)]'
                }`}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
