import { TrialDays } from './trial-days.js';

export interface TrialPeriodProps {
  daysUsed: TrialDays;
  lastUsedDate: string;
}

/**
 * The Trial Period: days of use counted once per calendar day, up to
 * TrialDays.LIMIT. Every counted day is usable, the last one included; the
 * trial ends with the first use on a day after the last counted one.
 */
export class TrialPeriod {
  readonly daysUsed: TrialDays;
  readonly lastUsedDate: string;

  constructor(props: TrialPeriodProps) {
    this.daysUsed = props.daysUsed;
    this.lastUsedDate = props.lastUsedDate;
  }

  static initial(): TrialPeriod {
    return new TrialPeriod({
      daysUsed: TrialDays.zero(),
      lastUsedDate: '',
    });
  }

  /** Days of use left after today's, if today has been counted. */
  getRemainingDays(): number {
    return this.daysUsed.remaining();
  }

  /**
   * Whether the trial has ended as of `today`: every day has been counted and
   * `today` is not the last counted day.
   */
  hasEnded(today: string): boolean {
    return this.daysUsed.isExhausted() && this.lastUsedDate !== today;
  }

  canRecordUsage(today: string): boolean {
    return this.lastUsedDate !== today && !this.daysUsed.isExhausted();
  }

  recordUsage(today: string): TrialPeriod {
    if (!this.canRecordUsage(today)) {
      return this;
    }
    return new TrialPeriod({
      daysUsed: this.daysUsed.increment(),
      lastUsedDate: today,
    });
  }
}
