import { WorldTimestamp, WorldClockState, DayPhase, Season } from './types';

/**
 * WorldClock
 * Deterministic simulation clock implementing DreamBook §333, §334, §343, §355.
 * Fictional calendar: 12 months/year, 30 days/month, 24 hours/day, 60 minutes/hour.
 */
export class WorldClock {
  private state: WorldClockState;

  constructor(initialState?: Partial<WorldClockState>) {
    const defaultTimestamp: WorldTimestamp = {
      year: 42,
      month: 10,
      day: 14,
      hour: 17,
      minute: 42,
      second: 0,
      totalElapsedSeconds: (42 * 360 * 24 * 3600) + (9 * 30 * 24 * 3600) + (13 * 24 * 3600) + (17 * 3600) + (42 * 60),
    };

    const ts = initialState?.timestamp ?? defaultTimestamp;

    this.state = {
      calendarSystemId: initialState?.calendarSystemId ?? 'astral_standard',
      timestamp: { ...ts },
      timeScale: initialState?.timeScale ?? 1.0,
      currentSeason: initialState?.currentSeason ?? WorldClock.deriveSeason(ts.month),
      currentDayPhase: initialState?.currentDayPhase ?? WorldClock.deriveDayPhase(ts.hour, ts.minute),
      timezoneOrRegion: initialState?.timezoneOrRegion ?? 'Upper Spire Plateau',
    };
  }

  public getState(): Readonly<WorldClockState> {
    return {
      ...this.state,
      timestamp: { ...this.state.timestamp },
    };
  }

  public exportState(): WorldClockState {
    return {
      ...this.state,
      timestamp: { ...this.state.timestamp },
    };
  }

  public importState(state: WorldClockState): void {
    if (!state || !state.timestamp) return;
    this.state = {
      calendarSystemId: state.calendarSystemId ?? 'astral_standard',
      timestamp: { ...state.timestamp },
      timeScale: state.timeScale ?? 1.0,
      currentSeason: state.currentSeason ?? WorldClock.deriveSeason(state.timestamp.month),
      currentDayPhase: state.currentDayPhase ?? WorldClock.deriveDayPhase(state.timestamp.hour, state.timestamp.minute),
      timezoneOrRegion: state.timezoneOrRegion ?? 'Upper Spire Plateau',
    };
  }

  public getTimestamp(): Readonly<WorldTimestamp> {
    return { ...this.state.timestamp };
  }

  public getAbsoluteTime(): number {
    return this.state.timestamp.totalElapsedSeconds;
  }

  public static deriveDayPhase(hour: number, minute: number): DayPhase {
    const timeInMinutes = hour * 60 + minute;
    if (timeInMinutes >= 4 * 60 && timeInMinutes < 6 * 60) return 'Predawn';
    if (timeInMinutes >= 6 * 60 && timeInMinutes < 8 * 60) return 'Dawn';
    if (timeInMinutes >= 8 * 60 && timeInMinutes < 12 * 60) return 'Morning';
    if (timeInMinutes >= 12 * 60 && timeInMinutes < 18 * 60) return 'Afternoon';
    if (timeInMinutes >= 18 * 60 && timeInMinutes < 21 * 60) return 'Dusk';
    return 'Night';
  }

  public static deriveSeason(month: number): Season {
    if (month >= 3 && month <= 5) return 'Spring';
    if (month >= 6 && month <= 8) return 'Summer';
    if (month >= 9 && month <= 11) return 'Autumn';
    return 'Winter';
  }

  /**
   * Advances the world clock by an exact number of seconds.
   * Pure deterministic arithmetic; does not invoke AI.
   */
  public advanceSeconds(seconds: number): WorldClockState {
    if (seconds <= 0) return this.getState();

    let { year, month, day, hour, minute, second, totalElapsedSeconds } = this.state.timestamp;

    totalElapsedSeconds += seconds;
    let remaining = seconds;

    second += remaining;
    if (second >= 60) {
      const extraMinutes = Math.floor(second / 60);
      second %= 60;
      minute += extraMinutes;
    }

    if (minute >= 60) {
      const extraHours = Math.floor(minute / 60);
      minute %= 60;
      hour += extraHours;
    }

    if (hour >= 24) {
      const extraDays = Math.floor(hour / 24);
      hour %= 24;
      day += extraDays;
    }

    while (day > 30) {
      day -= 30;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    const updatedTimestamp: WorldTimestamp = {
      year,
      month,
      day,
      hour,
      minute,
      second,
      totalElapsedSeconds,
    };

    this.state = {
      ...this.state,
      timestamp: updatedTimestamp,
      currentDayPhase: WorldClock.deriveDayPhase(hour, minute),
      currentSeason: WorldClock.deriveSeason(month),
    };

    return this.getState();
  }

  public advanceMinutes(minutes: number): WorldClockState {
    return this.advanceSeconds(minutes * 60);
  }

  public advanceHours(hours: number): WorldClockState {
    return this.advanceSeconds(hours * 3600);
  }

  public advanceDays(days: number): WorldClockState {
    return this.advanceSeconds(days * 86400);
  }

  /**
   * Computes human-readable and deterministic countdown string between now and a future timestamp.
   * DreamBook §336: "A countdown is always computed from canonical timestamps."
   */
  public computeCountdown(target: WorldTimestamp): {
    expired: boolean;
    remainingSeconds: number;
    formatted: string;
  } {
    const diff = target.totalElapsedSeconds - this.state.timestamp.totalElapsedSeconds;
    if (diff <= 0) {
      return { expired: true, remainingSeconds: 0, formatted: '0s (Passed)' };
    }

    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (parts.length === 0 || seconds > 0) parts.push(`${seconds}s`);

    return {
      expired: false,
      remainingSeconds: diff,
      formatted: parts.join(' '),
    };
  }

  /**
   * Formats the location-time header string per DreamBook §335
   */
  public formatHeader(): string {
    const ts = this.state.timestamp;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `Cycle ${ts.year} • Month ${ts.month}, Day ${ts.day} • ${pad(ts.hour)}:${pad(ts.minute)} • ${this.state.currentDayPhase} • ${this.state.currentSeason}`;
  }

  public getFormattedLocationTimeHeader(locationName?: string, timestamp?: WorldTimestamp): string {
    const base = this.formatHeader();
    return locationName ? `${locationName} — ${base}` : base;
  }
}
