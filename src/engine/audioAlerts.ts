import { HazardCategory, HazardSeverity } from '../types/adas';

class AlertAudioEngine {
  private audioCtx: AudioContext | null = null;
  private lastSpokenAt: Map<HazardCategory, number> = new Map();
  private lastChimeAt: Map<HazardCategory, number> = new Map();
  private lastGlobalSpeechAt = 0;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.audioCtx) {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        this.audioCtx = new AudioContextCtor();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
  }

  public trigger(
    category: HazardCategory,
    severity: HazardSeverity,
    spokenPhrase: string,
    options: { voiceEnabled: boolean; chimesEnabled: boolean; cooldownSec: number }
  ): boolean {
    if (severity === 'nominal') return false;
    const now = Date.now();
    const cooldownMs = Math.max(2000, options.cooldownSec * 1000);
    const isCritical = severity === 'critical';
    const effectiveCooldown = isCritical ? Math.min(cooldownMs, 3500) : cooldownMs;

    const lastChime = this.lastChimeAt.get(category) ?? 0;
    const lastSpoken = this.lastSpokenAt.get(category) ?? 0;
    let triggered = false;

    if (options.chimesEnabled && now - lastChime >= effectiveCooldown) {
      this.playCockpitChime(severity);
      this.lastChimeAt.set(category, now);
      triggered = true;
    }

    const globalSpeechGap = isCritical ? 1600 : 2600;
    if (
      options.voiceEnabled &&
      now - lastSpoken >= effectiveCooldown &&
      now - this.lastGlobalSpeechAt >= globalSpeechGap
    ) {
      this.speak(spokenPhrase, isCritical);
      this.lastSpokenAt.set(category, now);
      this.lastGlobalSpeechAt = now;
      triggered = true;
    }

    return triggered;
  }

  public playTestBeep(severity: HazardSeverity = 'caution'): void {
    this.unlock();
    this.playCockpitChime(severity);
  }

  public stopAll(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  private playCockpitChime(severity: HazardSeverity): void {
    this.unlock();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const start = ctx.currentTime;

    if (severity === 'critical') {
      // Urgent 3-pulse high-contrast automotive warning tone
      const freqs = [920, 1180, 920];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = start + idx * 0.11;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.exponentialRampToValueAtTime(0.14, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.095);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.1);
      });
    } else {
      // Caution 2-tone soft cockpit chime
      const freqs = [587.33, 783.99];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = start + idx * 0.13;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
      });
    }
  }

  private speak(phrase: string, interrupt: boolean): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const synth = window.speechSynthesis;
      if (interrupt) {
        synth.cancel();
      } else if (synth.speaking) {
        return;
      }
      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.rate = 1.08;
      utterance.pitch = interrupt ? 1.05 : 1.0;
      utterance.volume = 0.92;
      utterance.lang = 'en-IN';
      synth.speak(utterance);
    } catch {
      // Speech synthesis may be blocked before user interaction
    }
  }
}

export const alertAudioEngine = new AlertAudioEngine();
