export type CharacterVisualState =
  | 'idle'
  | 'walk'
  | 'sitDown'
  | 'sitIdle'
  | 'sitWork'
  | 'sitLookAround'
  | 'sitWave'
  | 'sitCelebrate'
  | 'standUp'
  | 'talk'
  | 'listen'
  | 'lookAround'
  | 'wave'
  | 'attention'
  | 'stretch'
  | 'drink'
  | 'celebrate'
  | 'concerned'
  | 'sleepy';

type StateDefinition = {
  duration?: number;
  loop: boolean;
  interruptible: boolean;
  next?: CharacterVisualState;
};

const stateDefinitions: Record<CharacterVisualState, StateDefinition> = {
  idle: { loop: true, interruptible: true },
  walk: { loop: true, interruptible: true },
  sitDown: { duration: 0.72, loop: false, interruptible: false, next: 'sitIdle' },
  sitIdle: { loop: true, interruptible: true },
  sitWork: { loop: true, interruptible: true },
  sitLookAround: { duration: 2.8, loop: false, interruptible: false, next: 'sitIdle' },
  sitWave: { duration: 2.25, loop: false, interruptible: false, next: 'sitIdle' },
  sitCelebrate: { duration: 2.65, loop: false, interruptible: false, next: 'sitIdle' },
  standUp: { duration: 0.64, loop: false, interruptible: false, next: 'idle' },
  talk: { loop: true, interruptible: true },
  listen: { loop: true, interruptible: true },
  lookAround: { duration: 2.8, loop: false, interruptible: false, next: 'idle' },
  wave: { duration: 2.25, loop: false, interruptible: false, next: 'idle' },
  attention: { duration: 3.4, loop: false, interruptible: false, next: 'idle' },
  stretch: { duration: 3.1, loop: false, interruptible: false, next: 'idle' },
  drink: { duration: 3.2, loop: false, interruptible: false, next: 'idle' },
  celebrate: { duration: 2.65, loop: false, interruptible: false, next: 'idle' },
  concerned: { loop: true, interruptible: true },
  sleepy: { loop: true, interruptible: true }
};

/**
 * A small, renderer-independent state machine for procedural character animation.
 * One-shot transitions are allowed to finish instead of being reset by every
 * incoming Cursor snapshot. Movement can still interrupt them for responsiveness.
 */
export class CharacterStateMachine {
  private current: CharacterVisualState = 'idle';
  private elapsed = 0;
  private queued: CharacterVisualState | undefined;
  private queuedDuration: number | undefined;
  private activeDuration: number | undefined;

  public get state(): CharacterVisualState {
    return this.current;
  }

  public get normalizedTime(): number {
    const duration = this.duration;
    return duration ? Math.min(this.elapsed / duration, 1) : 0;
  }

  public get isTransient(): boolean {
    return !stateDefinitions[this.current].loop;
  }

  public transition(next: CharacterVisualState, force = false, durationSeconds?: number): boolean {
    if (next === this.current) {
      return false;
    }

    const definition = stateDefinitions[this.current];
    if (!force && !definition.interruptible && this.elapsed < (this.duration ?? 0)) {
      this.queued = next;
      this.queuedDuration = normalizedDuration(durationSeconds);
      return false;
    }

    this.current = next;
    this.elapsed = 0;
    this.queued = undefined;
    this.queuedDuration = undefined;
    this.activeDuration = stateDefinitions[next].loop ? undefined : normalizedDuration(durationSeconds);
    return true;
  }

  public update(deltaSeconds: number): boolean {
    this.elapsed += Math.max(deltaSeconds, 0);
    const definition = stateDefinitions[this.current];
    if (definition.loop || this.elapsed < (this.duration ?? 0)) {
      return false;
    }

    const queued = this.queued;
    const queuedDuration = this.queuedDuration;
    this.current = queued ?? definition.next ?? 'idle';
    this.elapsed = 0;
    this.queued = undefined;
    this.queuedDuration = undefined;
    this.activeDuration = queued && !stateDefinitions[queued].loop ? queuedDuration : undefined;
    return true;
  }

  private get duration(): number | undefined {
    return this.activeDuration ?? stateDefinitions[this.current].duration;
  }
}

function normalizedDuration(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0.1 ? value : undefined;
}
