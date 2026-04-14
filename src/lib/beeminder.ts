import { prisma } from '@/lib/prisma';

export interface BeeminderResult {
  ok: boolean;
  error?: string;
}

async function postDatapoint(
  authToken: string,
  goalSlug: string,
  value: number,
  comment?: string,
): Promise<void> {
  const today = new Date();
  const daystamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const res = await fetch(
    `https://www.beeminder.com/api/v1/users/me/goals/${encodeURIComponent(goalSlug)}/datapoints.json`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: authToken,
        value,
        comment: comment ?? '',
        requestid: `prism-daily-${daystamp}`,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error');
    throw new Error(`Beeminder API ${res.status}: ${text}`);
  }
}

/**
 * Post a datapoint to Beeminder if the user has it configured.
 * Never throws — returns { ok, error? }.
 */
export async function maybePostBeeminder(userId: string): Promise<BeeminderResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { beeminderAuthToken: true, beeminderGoalSlug: true },
    });

    if (!user?.beeminderAuthToken || !user?.beeminderGoalSlug) {
      return { ok: true };
    }

    await postDatapoint(user.beeminderAuthToken, user.beeminderGoalSlug, 1, 'Prism daily streak');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Beeminder error';
    console.warn('[beeminder] post failed:', message);
    return { ok: false, error: message };
  }
}
