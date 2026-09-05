/**
 * Binary Chart Library - Audio Feedback System
 * Sound effects for trading events
 *
 * Full replica of chart-engine audio feedback with ADSR envelope support.
 */

import type { AudioConfig, SoundType, IAudioFeedback } from "./types";
import { defaultAudioConfig } from "./types";

// ============================================================================
// SOUND DEFINITIONS
// ============================================================================

interface SoundDefinition {
  frequency: number;
  type: OscillatorType;
  duration: number;
  volume: number;
  envelope?: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  modulation?: {
    frequency: number;
    depth: number;
  };
  /** Start this tone at an exact offset instead of after the previous one.
      Layering partials on the same instant is what produces timbre; playing
      them one after another only produces a melody. */
  offset?: number;
}

// ── Trading-friendly sound palette ──────────────────────────────────────────
// One cohesive set: warm sine tones only (no buzzy square waves), short and
// understated so nothing feels game-y or "odd" during active trading. Positive
// events rise on a major scale; negative events are soft, low and quiet.
const soundDefinitions: Record<SoundType, SoundDefinition[]> = {
  // Order placed — one note, but shaped. The old F4 had a 50ms attack, so the
  // whole sound arrived at once and read as a blunt bump. A lower fundamental
  // with a slower swell and a longer tail sounds deliberate instead, and it
  // fires on every trade so it stays a single note rather than a figure.
  /* Struck stacks, not single sines.
   *
   * A pure sine tap is clean but thin — there is nothing in it but the pitch,
   * which is why it reads as a beep however well it is shaped. A real struck
   * object sounds the way it does because several frequencies arrive together
   * and die at different rates: the high partials give the strike its definition
   * and vanish in a few tens of milliseconds, the fundamental carries the note
   * and rings on. That difference in decay is the whole effect, and it is what
   * separates an instrument from a tone generator.
   *
   * Each note below is a fundamental plus two partials placed on the same
   * instant with `offset`. The ratios are the ones a struck bar gives — roughly
   * 1 : 4 : 10 — which reads as wood or glass rather than as a synthesiser. The
   * partials are 6-15% of the fundamental's volume and gone within 60ms, so they
   * are heard as the strike, not as pitches of their own.
   *
   * Register and dynamics are unchanged from the taps that worked: D4-C5, ~4ms
   * attack, sustain 0, nothing above 0.075.
   */

  // Execution — one struck note at A4. Heard dozens of times an hour, so it is
  // the plainest: the strike, the note, and nothing else.
  order_placed: [
    { frequency: 440.0, type: "sine", duration: 0.16, volume: 0.07, offset: 0,
      envelope: { attack: 0.004, decay: 0.1, sustain: 0, release: 0.05 } },
    { frequency: 1760.0, type: "sine", duration: 0.05, volume: 0.009, offset: 0,
      envelope: { attack: 0.002, decay: 0.03, sustain: 0, release: 0.015 } },
    { frequency: 4400.0, type: "sine", duration: 0.03, volume: 0.004, offset: 0,
      envelope: { attack: 0.001, decay: 0.018, sustain: 0, release: 0.01 } },
  ],

  // Win — one struck note at C5, a fourth above the entry sound. Rings slightly
  // longer than the others; it is the only sound here anyone wants to hear.
  order_won: [
    { frequency: 523.25, type: "sine", duration: 0.24, volume: 0.062, offset: 0,
      envelope: { attack: 0.004, decay: 0.15, sustain: 0, release: 0.08 } },
    { frequency: 2093.0, type: "sine", duration: 0.05, volume: 0.0075, offset: 0,
      envelope: { attack: 0.002, decay: 0.03, sustain: 0, release: 0.015 } },
    { frequency: 5232.5, type: "sine", duration: 0.03, volume: 0.003, offset: 0,
      envelope: { attack: 0.001, decay: 0.018, sustain: 0, release: 0.01 } },
  ],

  // Loss — one struck note at D4, a fifth below the entry. Quieter, and the top
  // partial is dropped so the strike itself is softer as well as lower.
  order_lost: [
    { frequency: 293.66, type: "sine", duration: 0.26, volume: 0.05, offset: 0,
      envelope: { attack: 0.004, decay: 0.16, sustain: 0, release: 0.09 } },
    { frequency: 1174.6, type: "sine", duration: 0.045, volume: 0.0055, offset: 0,
      envelope: { attack: 0.002, decay: 0.027, sustain: 0, release: 0.014 } },
  ],

  // Refund — one struck note at F4, sitting between the win and the loss. A draw
  // was neither, and the pitch says so without a figure of its own.
  order_expired: [
    { frequency: 349.23, type: "sine", duration: 0.2, volume: 0.055, offset: 0,
      envelope: { attack: 0.004, decay: 0.12, sustain: 0, release: 0.07 } },
    { frequency: 1396.9, type: "sine", duration: 0.045, volume: 0.006, offset: 0,
      envelope: { attack: 0.002, decay: 0.027, sustain: 0, release: 0.014 } },
  ],
  // Countdown tick — barely-there soft tick.
  countdown_tick: [
    {
      frequency: 660,
      type: "sine",
      duration: 0.03,
      volume: 0.04,
      envelope: { attack: 0.002, decay: 0.01, sustain: 0.05, release: 0.018 },
    },
  ],
  // Countdown final — subtle gentle rise.
  countdown_final: [
    {
      frequency: 660, // E5
      type: "sine",
      duration: 0.07,
      volume: 0.12,
      envelope: { attack: 0.008, decay: 0.02, sustain: 0.2, release: 0.05 },
    },
    {
      frequency: 880, // A5
      type: "sine",
      duration: 0.1,
      volume: 0.12,
      envelope: { attack: 0.008, decay: 0.03, sustain: 0.2, release: 0.07 },
    },
  ],
  // Price alert — a clear, pleasant rising chime (not a harsh triple beep).
  price_alert: [
    {
      frequency: 784, // G5
      type: "sine",
      duration: 0.12,
      volume: 0.24,
      envelope: { attack: 0.008, decay: 0.04, sustain: 0.35, release: 0.08 },
    },
    {
      frequency: 1046, // C6
      type: "sine",
      duration: 0.15,
      volume: 0.22,
      envelope: { attack: 0.008, decay: 0.04, sustain: 0.35, release: 0.1 },
    },
  ],
  // Error — soft, low sine (no buzzy square). Clearly "wrong" but gentle.
  error: [
    {
      frequency: 330, // E4
      type: "sine",
      duration: 0.12,
      volume: 0.18,
      envelope: { attack: 0.01, decay: 0.05, sustain: 0.25, release: 0.07 },
    },
    {
      frequency: 247, // B3
      type: "sine",
      duration: 0.18,
      volume: 0.16,
      envelope: { attack: 0.012, decay: 0.06, sustain: 0.2, release: 0.11 },
    },
  ],
  // Success — gentle bright rise.
  success: [
    {
      frequency: 587, // D5
      type: "sine",
      duration: 0.09,
      volume: 0.2,
      envelope: { attack: 0.008, decay: 0.03, sustain: 0.35, release: 0.05 },
    },
    {
      frequency: 880, // A5
      type: "sine",
      duration: 0.14,
      volume: 0.2,
      envelope: { attack: 0.008, decay: 0.03, sustain: 0.35, release: 0.1 },
    },
  ],
};

// ============================================================================
// SHARED AUDIO CONTEXT (singleton to prevent multiple contexts)
// ============================================================================

let sharedAudioContext: AudioContext | null = null;
let audioContextInitialized = false;
let audioContextError = false;
let hasUserInteracted = false;

// Track user interaction globally - required for AudioContext autoplay policy
if (typeof window !== "undefined") {
  const markInteracted = () => {
    hasUserInteracted = true;
    // Try to resume any suspended context after user interaction
    if (sharedAudioContext?.state === "suspended") {
      sharedAudioContext.resume().catch(() => {});
    }
  };

  // Listen for user interaction events (once each)
  ["click", "touchstart", "keydown", "mousedown"].forEach((event) => {
    window.addEventListener(event, markInteracted, { once: true, passive: true });
  });
}

async function getSharedAudioContext(): Promise<AudioContext | null> {
  // If we've already had an error, don't try again
  if (audioContextError) return null;

  // Don't create AudioContext until user has interacted with the page
  if (!hasUserInteracted) {
    return null;
  }

  // Return existing context if available and running
  if (sharedAudioContext) {
    try {
      // Check if context is in a valid state
      if (sharedAudioContext.state === "closed") {
        sharedAudioContext = null;
        audioContextInitialized = false;
      } else if (sharedAudioContext.state === "suspended") {
        await sharedAudioContext.resume();
      }
      return sharedAudioContext;
    } catch {
      // Context is in bad state, recreate it
      sharedAudioContext = null;
      audioContextInitialized = false;
    }
  }

  // Create new context
  if (!audioContextInitialized) {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        audioContextError = true;
        return null;
      }

      sharedAudioContext = new AudioContextClass();

      // Handle errors on the audio context
      sharedAudioContext.onstatechange = () => {
        if (sharedAudioContext?.state === "closed") {
          sharedAudioContext = null;
          audioContextInitialized = false;
        }
      };

      // Resume if suspended (required for autoplay policy)
      if (sharedAudioContext.state === "suspended") {
        await sharedAudioContext.resume();
      }

      audioContextInitialized = true;
    } catch (error) {
      // Silently fail - don't spam console with audio errors
      audioContextError = true;
      return null;
    }
  }

  return sharedAudioContext;
}

// ============================================================================
// AUDIO FEEDBACK CLASS
// ============================================================================

// Global cooldown dictionary to prevent machine-gun overlapping sounds when multiple events fire in parallel
const lastPlayTimes = new Map<string, number>();
const PLAY_COOLDOWN_MS = 1500;

export class AudioFeedback implements IAudioFeedback {
  private config: AudioConfig;
  private isInitialized: boolean = false;

  constructor(config: Partial<AudioConfig> = {}) {
    this.config = { ...defaultAudioConfig, ...config };
  }

  /**
   * Initialize audio context (must be called after user interaction)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const ctx = await getSharedAudioContext();
      if (ctx) {
        this.isInitialized = true;
      }
    } catch (error) {
      console.warn("Audio feedback initialization failed:", error);
    }
  }

  /**
   * Play a sound effect
   */
  async play(soundType: SoundType): Promise<void> {
    if (!this.config.enabled || !this.config.sounds[soundType]) return;

    // Cooldown only for win/lost/expired sounds to prevent duplicate phase overlapping chimes
    const now = Date.now();
    if (soundType === "order_won" || soundType === "order_lost" || soundType === "order_expired") {
      const lastPlay = lastPlayTimes.get(soundType) || 0;
      if (now - lastPlay < PLAY_COOLDOWN_MS) {
        return;
      }
      lastPlayTimes.set(soundType, now);
    }

    // Get shared audio context
    const audioContext = await getSharedAudioContext();
    if (!audioContext) return;

    // Mark as initialized since we have a working context
    this.isInitialized = true;

    const definitions = soundDefinitions[soundType];
    if (!definitions) return;

    const masterVolume = this.config.volume;
    let delay = 0;

    for (const def of definitions) {
      /* A tone with an explicit offset is a PARTIAL — part of the note being
         struck, not the note after it — so it is placed at that instant and does
         not advance the sequence. Without this every tone had to follow the last
         one, which is why these could only ever be pure sines: a single sine has
         no timbre, and timbre is the whole difference between a beep and a
         struck instrument. */
      const at = def.offset ?? delay;
      this.playTone(audioContext, def, at, masterVolume);
      if (def.offset === undefined) {
        delay += def.duration * 0.8; // Overlap slightly
      }
    }
  }

  /**
   * Play a single tone with ADSR envelope
   */
  private playTone(
    audioContext: AudioContext,
    def: SoundDefinition,
    delay: number,
    masterVolume: number
  ): void {
    try {
      const now = audioContext.currentTime + delay;
      const volume = def.volume * masterVolume;

      // Create oscillator
      const oscillator = audioContext.createOscillator();
      oscillator.type = def.type;
      oscillator.frequency.setValueAtTime(def.frequency, now);

      // Create gain node for envelope
      const gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(0, now);

      // Apply envelope
      const env = def.envelope || {
        attack: 0.01,
        decay: 0.05,
        sustain: 0.5,
        release: def.duration * 0.3,
      };

      /* The envelope is fitted to the note before it is scheduled.

         This is where the "sharp" sound was actually coming from, and no amount
         of lowering the pitch was ever going to fix it. The stages were
         scheduled at face value: attack, then decay, then a setValueAtTime at
         `duration - release`. When attack + decay ran PAST that instant — true
         of twelve of the sixteen tones defined in this file — the
         setValueAtTime landed in the middle of the decay ramp and forced the
         gain to jump. A step discontinuity in a gain envelope is a click, and a
         click is broadband: it reads as sharp whatever the oscillator
         underneath is doing. Softening the tone made it worse each time, since
         a longer attack and release only widened the overlap.

         Scaling the three stages to fit, keeping a tenth of the note as real
         sustain, makes every ramp continuous by construction. A definition can
         no longer describe an impossible envelope. */
      const noteEnd = now + def.duration;
      let attack = Math.max(0.001, env.attack);
      let decay = Math.max(0.001, env.decay);
      let release = Math.max(0.001, env.release);
      const staged = attack + decay + release;
      const budget = def.duration * 0.9;
      if (staged > budget) {
        const k = budget / staged;
        attack *= k;
        decay *= k;
        release *= k;
      }
      const sustainLevel = volume * env.sustain;
      const decayEnd = now + attack + decay;
      const releaseStart = Math.max(decayEnd, noteEnd - release);

      gainNode.gain.linearRampToValueAtTime(volume, now + attack);
      gainNode.gain.linearRampToValueAtTime(sustainLevel, decayEnd);
      gainNode.gain.setValueAtTime(sustainLevel, releaseStart);
      gainNode.gain.linearRampToValueAtTime(0, noteEnd);

      // Apply frequency modulation if specified
      if (def.modulation) {
        const modOsc = audioContext.createOscillator();
        const modGain = audioContext.createGain();

        modOsc.frequency.setValueAtTime(def.modulation.frequency, now);
        modGain.gain.setValueAtTime(def.modulation.depth, now);

        modOsc.connect(modGain);
        modGain.connect(oscillator.frequency);

        modOsc.start(now);
        modOsc.stop(now + def.duration);
      }

      // Connect and play
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start(now);
      oscillator.stop(now + def.duration + 0.1);
    } catch (error) {
      // Silently ignore audio errors - don't break the app for audio issues
      console.warn("Audio playback error:", error);
    }
  }

  /**
   * Play order placed sound
   */
  playOrderPlaced(): Promise<void> {
    return this.play("order_placed");
  }

  /**
   * Play win sound
   */
  playWin(): Promise<void> {
    return this.play("order_won");
  }

  /**
   * Play loss sound
   */
  playLoss(): Promise<void> {
    return this.play("order_lost");
  }

  /**
   * Play expired sound
   */
  playExpired(): Promise<void> {
    return this.play("order_expired");
  }

  /**
   * Play countdown tick
   */
  playCountdownTick(): Promise<void> {
    return this.play("countdown_tick");
  }

  /**
   * Play final countdown
   */
  playCountdownFinal(): Promise<void> {
    return this.play("countdown_final");
  }

  /**
   * Play price alert
   */
  playPriceAlert(): Promise<void> {
    return this.play("price_alert");
  }

  /**
   * Play error sound
   */
  playError(): Promise<void> {
    return this.play("error");
  }

  /**
   * Play success sound
   */
  playSuccess(): Promise<void> {
    return this.play("success");
  }

  /**
   * Enable/disable audio
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Set volume (0-1)
   */
  setVolume(volume: number): void {
    this.config.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Enable/disable specific sound
   */
  setSoundEnabled(soundType: SoundType, enabled: boolean): void {
    this.config.sounds[soundType] = enabled;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<AudioConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current config
   */
  getConfig(): AudioConfig {
    return { ...this.config };
  }

  /**
   * Check if audio is supported and initialized
   */
  isReady(): boolean {
    return this.isInitialized && sharedAudioContext !== null;
  }

  /**
   * Test a specific sound (plays regardless of enabled state)
   */
  async testSound(soundType: SoundType): Promise<void> {
    // Temporarily enable for testing
    const wasEnabled = this.config.sounds[soundType];
    const wasGlobalEnabled = this.config.enabled;

    this.config.enabled = true;
    this.config.sounds[soundType] = true;

    await this.play(soundType);

    // Restore settings
    this.config.sounds[soundType] = wasEnabled;
    this.config.enabled = wasGlobalEnabled;
  }

  /**
   * Cleanup - note: we don't close the shared context, just mark this instance as not initialized
   */
  dispose(): void {
    this.isInitialized = false;
    // Don't close the shared audio context - other instances may be using it
  }
}

// ============================================================================
// SINGLETON INSTANCE (for global use)
// ============================================================================

let globalAudioFeedback: AudioFeedback | null = null;

export function getAudioFeedback(config?: Partial<AudioConfig>): AudioFeedback {
  if (!globalAudioFeedback) {
    globalAudioFeedback = new AudioFeedback(config);
  }
  return globalAudioFeedback;
}

export function disposeGlobalAudioFeedback(): void {
  if (globalAudioFeedback) {
    globalAudioFeedback.dispose();
    globalAudioFeedback = null;
  }
}

// Clean up on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", disposeGlobalAudioFeedback);
}

export default AudioFeedback;
