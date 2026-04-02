import useSWR from 'swr';

interface UserSettings {
  powerdownTime?: string | null;
  hiddenFeatures?: string[];
  [key: string]: unknown;
}

export function useUserSettings() {
  return useSWR<UserSettings>('/api/settings?scope=user', {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
}
