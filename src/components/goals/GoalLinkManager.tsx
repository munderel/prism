'use client';

import { useState, useEffect } from 'react';
import { Trash2, Link, Plus } from 'lucide-react';

interface GoalLinkManagerProps {
  companyGoalId: string;
  onUpdate: () => void;
}

export function GoalLinkManager({ companyGoalId, onUpdate }: GoalLinkManagerProps) {
  const [links, setLinks] = useState<any[]>([]);
  const [availableGoals, setAvailableGoals] = useState<any[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [weight, setWeight] = useState(1.0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLinks();
    fetchAvailableGoals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyGoalId]);

  const fetchLinks = async () => {
    const res = await fetch(`/api/goals/${companyGoalId}`);
    if (res.ok) {
      const data = await res.json();
      setLinks(data.companyGoalLinks ?? []);
    }
    setLoading(false);
  };

  const fetchAvailableGoals = async () => {
    // Fetch all stacks, then get goals from personal stacks
    const res = await fetch('/api/stacks');
    if (!res.ok) return;
    const stacks = await res.json();
    const personalStacks = stacks.filter((s: any) => !s.isCompany);

    const allGoals: any[] = [];
    for (const stack of personalStacks) {
      const goalsRes = await fetch(`/api/goals?stackId=${stack.id}`);
      if (goalsRes.ok) {
        const goals = await goalsRes.json();
        allGoals.push(
          ...goals.map((g: any) => ({
            ...g,
            ownerName: stack.owner?.name ?? 'Unknown',
          }))
        );
      }
    }
    setAvailableGoals(allGoals);
  };

  const handleAddLink = async () => {
    if (!selectedGoalId) return;
    const res = await fetch(`/api/goals/${companyGoalId}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ individualGoalId: selectedGoalId, weight }),
    });
    if (res.ok) {
      setSelectedGoalId('');
      setWeight(1.0);
      fetchLinks();
      onUpdate();
    }
  };

  const handleRemoveLink = async (linkId: string) => {
    const res = await fetch(
      `/api/goals/${companyGoalId}/link?linkId=${linkId}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      fetchLinks();
      onUpdate();
    }
  };

  if (loading) return <div className="text-gray-500 text-sm">Loading links...</div>;

  return (
    <div className="glass-panel p-4">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <Link className="h-4 w-4 text-indigo-400" />
        Linked Individual Goals
      </h3>

      {links.length > 0 && (
        <div className="space-y-2 mb-4">
          {links.map((link: any) => (
            <div
              key={link.id}
              className="flex items-center justify-between rounded-md bg-gray-800/50 px-3 py-2"
            >
              <div>
                <span className="text-sm text-white">
                  {link.individualGoal?.title}
                </span>
                <span className="text-xs text-gray-500 ml-2">
                  by {link.individualGoal?.stack?.owner?.name ?? 'Unknown'}
                </span>
                <span className="text-xs text-gray-500 ml-2">
                  (weight: {link.weight})
                </span>
              </div>
              <button
                onClick={() => handleRemoveLink(link.id)}
                className="text-gray-500 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">Individual Goal</label>
          <select
            value={selectedGoalId}
            onChange={(e) => setSelectedGoalId(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
          >
            <option value="">Select a goal...</option>
            {availableGoals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title} ({g.ownerName})
              </option>
            ))}
          </select>
        </div>
        <div className="w-20">
          <label className="block text-xs text-gray-400 mb-1">Weight</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={weight}
            onChange={(e) => setWeight(parseFloat(e.target.value))}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
          />
        </div>
        <button
          onClick={handleAddLink}
          disabled={!selectedGoalId}
          className="rounded-md bg-indigo-600 p-1.5 text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
