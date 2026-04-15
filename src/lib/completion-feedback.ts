/**
 * Shared completion feedback: sound + confetti.
 * Used by both dashboard and tasks page on task completion.
 */

let audioCache: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!audioCache) {
    audioCache = new Audio('/sounds/complete.wav');
    audioCache.volume = 0.4;
  }
  return audioCache;
}

export function playCompletionFeedback() {
  // Play sound
  try {
    const audio = getAudio();
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Audio play blocked by browser — create a simple beep via Web Audio API
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.15;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.stop(ctx.currentTime + 0.15);
      } catch {
        // Silently fail if neither audio method works
      }
    });
  } catch {
    // No audio support
  }

  // Fire confetti
  import('canvas-confetti').then(({ default: confetti }) => {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#818cf8', '#22d3ee', '#10b981', '#f59e0b'],
    });
  }).catch(() => {});
}
