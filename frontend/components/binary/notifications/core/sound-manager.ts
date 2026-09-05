/**
 * Sound Manager
 *
 * Manages audio playback for trading notifications.
 * Uses Web Audio API for programmatic sounds and can also play audio files.
 */

import type { SoundType, SoundConfig } from "../types";
import { DEFAULT_SOUND_CONFIG } from "../types";

// ============================================================================
// SOUND DEFINITIONS
// ============================================================================

interface SoundDefinition {
  frequency: number;
  duration: number;
  type: OscillatorType;
  // For multi-tone sounds
  pattern?: Array<{
    frequency: number;
    duration: number;
    delay: number;
  }>;
}

// Trading-friendly palette — matches the audio-feedback set: warm sine tones,
// short and understated. Rising major intervals for positive events; soft, low
// tones for negative ones. No buzzy square waves.
const SOUND_DEFINITIONS: Record<SoundType, SoundDefinition> = {
  // Soft confirming blip (gentle rising fifth).
  order_placed: {
    frequency: 587,
    duration: 0.1,
    type: "sine",
    pattern: [
      { frequency: 587, duration: 0.075, delay: 0 },   // D5
      { frequency: 880, duration: 0.1, delay: 0.08 },   // A5
    ],
  },
  // Warm ascending C-major arpeggio to the octave.
  trade_win: {
    frequency: 523,
    duration: 0.46,
    type: "sine",
    pattern: [
      { frequency: 523, duration: 0.1, delay: 0 },      // C5
      { frequency: 659, duration: 0.1, delay: 0.1 },    // E5
      { frequency: 784, duration: 0.1, delay: 0.2 },    // G5
      { frequency: 1046, duration: 0.16, delay: 0.3 },  // C6
    ],
  },
  // Soft, low, brief descent (major third down).
  trade_loss: {
    frequency: 440,
    duration: 0.29,
    type: "sine",
    pattern: [
      { frequency: 440, duration: 0.12, delay: 0 },     // A4
      { frequency: 349, duration: 0.17, delay: 0.12 },  // F4
    ],
  },
  // Clear, pleasant rising chime.
  alert_triggered: {
    frequency: 784,
    duration: 0.31,
    type: "sine",
    pattern: [
      { frequency: 784, duration: 0.12, delay: 0 },     // G5
      { frequency: 1046, duration: 0.15, delay: 0.16 }, // C6
    ],
  },
  // Gentle single notification tone.
  notification: {
    frequency: 660,
    duration: 0.12,
    type: "sine",
  },
  // Soft low sine (no harsh buzz).
  error: {
    frequency: 330,
    duration: 0.32,
    type: "sine",
    pattern: [
      { frequency: 330, duration: 0.12, delay: 0 },     // E4
      { frequency: 247, duration: 0.18, delay: 0.14 },  // B3
    ],
  },
  // Gentle bright rise.
  success: {
    frequency: 587,
    duration: 0.24,
    type: "sine",
    pattern: [
      { frequency: 587, duration: 0.09, delay: 0 },     // D5
      { frequency: 880, duration: 0.14, delay: 0.1 },   // A5
    ],
  },
  // Very short soft click.
  click: {
    frequency: 800,
    duration: 0.03,
    type: "sine",
  },
};

// ============================================================================
// SOUND MANAGER CLASS
// ============================================================================

class SoundManagerClass {
  private audioContext: AudioContext | null = null;
  private config: SoundConfig = DEFAULT_SOUND_CONFIG;
  private initialized = false;

  // Initialize audio context (must be called after user interaction)
  initialize(): void {
    if (this.initialized) return;

    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
        this.initialized = true;
      }
    } catch (error) {
      console.error("Failed to initialize audio context:", error);
    }
  }

  // Update config
  setConfig(config: Partial<SoundConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Get current config
  getConfig(): SoundConfig {
    return { ...this.config };
  }

  // Check if a sound type is enabled
  isSoundEnabled(type: SoundType): boolean {
    return this.config.enabled && this.config.sounds[type];
  }

  // Play a sound
  async play(type: SoundType): Promise<void> {
    // Check if global audio is muted in localStorage
    let isMutedGlobal = false;
    try {
      const stored = localStorage.getItem("trading-settings-store");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.state.audio.enabled === false) {
          isMutedGlobal = true;
        }
      }
    } catch (e) {}

    // Check if enabled
    if (isMutedGlobal || !this.config.enabled || !this.config.sounds[type]) {
      return;
    }

    // Initialize on first play (needs user gesture)
    if (!this.initialized) {
      this.initialize();
    }

    if (!this.audioContext) {
      console.warn("Audio context not available");
      return;
    }

    // Resume context if suspended
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    try {
      const definition = SOUND_DEFINITIONS[type];
      if (!definition) return;

      if (definition.pattern && definition.pattern.length > 0) {
        // Play pattern
        for (const tone of definition.pattern) {
          await this.playTone(
            tone.frequency,
            tone.duration,
            definition.type,
            tone.delay
          );
        }
      } else {
        // Play single tone
        await this.playTone(
          definition.frequency,
          definition.duration,
          definition.type,
          0
        );
      }
    } catch (error) {
      console.error(`Failed to play sound ${type}:`, error);
    }
  }

  // Play a single tone
  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    delay: number
  ): Promise<void> {
    return new Promise((resolve) => {
      if (!this.audioContext) {
        resolve();
        return;
      }

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type;
      gainNode.gain.value = this.config.volume * 0.5; // Scale volume

      const startTime = this.audioContext.currentTime + delay;
      oscillator.start(startTime);

      // Fade out
      gainNode.gain.setValueAtTime(
        this.config.volume * 0.5,
        startTime + duration * 0.7
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        startTime + duration
      );

      oscillator.stop(startTime + duration);

      // Resolve after the sound is done
      setTimeout(() => {
        resolve();
      }, (delay + duration) * 1000);
    });
  }

  // Play a custom sound from URL
  async playCustom(url: string): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const audio = new Audio(url);
      audio.volume = this.config.volume;
      await audio.play();
    } catch (error) {
      console.error("Failed to play custom sound:", error);
    }
  }

  // Test a sound
  async testSound(type: SoundType): Promise<void> {
    // Temporarily enable the sound for testing
    const wasEnabled = this.config.sounds[type];
    const wasGlobalEnabled = this.config.enabled;

    this.config.enabled = true;
    this.config.sounds[type] = true;

    await this.play(type);

    // Restore settings
    this.config.sounds[type] = wasEnabled;
    this.config.enabled = wasGlobalEnabled;
  }

  // Test all sounds
  async testAllSounds(): Promise<void> {
    const soundTypes: SoundType[] = [
      "order_placed",
      "trade_win",
      "trade_loss",
      "alert_triggered",
      "notification",
      "success",
      "error",
    ];

    for (const type of soundTypes) {
      await this.testSound(type);
      // Wait between sounds
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Dispose
  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.initialized = false;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const SoundManager = new SoundManagerClass();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Play a notification sound
 */
export function playNotificationSound(type: SoundType): void {
  SoundManager.play(type);
}

/**
 * Initialize sound manager (call on user interaction)
 */
export function initializeSoundManager(): void {
  SoundManager.initialize();
}

/**
 * Update sound configuration
 */
export function updateSoundConfig(config: Partial<SoundConfig>): void {
  SoundManager.setConfig(config);
}

/**
 * Dispose sound manager and release AudioContext resources
 * Call this when the component using sounds is unmounted
 */
export function disposeSoundManager(): void {
  SoundManager.dispose();
}

// ============================================================================
// CLEANUP REGISTRATION
// Register cleanup handler for page unload to prevent AudioContext leaks
// ============================================================================
if (typeof window !== "undefined") {
  // Clean up AudioContext when page is about to unload
  window.addEventListener("beforeunload", () => {
    SoundManager.dispose();
  });

  // Also listen for visibility changes - if page is hidden for long,
  // we can suspend the context to save resources
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      // Page is hidden - suspend AudioContext if not needed
      if (SoundManager["audioContext"]?.state === "running") {
        SoundManager["audioContext"].suspend();
      }
    } else if (document.visibilityState === "visible") {
      // Page is visible again - resume if needed
      if (SoundManager["audioContext"]?.state === "suspended") {
        SoundManager["audioContext"].resume();
      }
    }
  });
}
