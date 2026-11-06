import { Injectable, type Signal, computed, inject, signal } from '@angular/core';
import { z } from 'zod';
import { ApiClient } from '../api/api-client';
import { PREFERENCES_PATH } from '../route-data';

/**
 * `device` follows the OS setting. `light` and `dark` are this browser's own override, kept in local
 * storage and never sent to the server. Devices are access points, not identities (#2).
 */
export type ThemeChoice = 'device' | 'light' | 'dark';

/**
 * The app-wide default, from the author's preferences in `settings.yaml` (survey 18 §7 item 14,
 * provisional). `system` follows the OS, as `device` does.
 */
// provisional: survey 18 §7 item 14
export type AppThemeDefault = 'system' | 'light' | 'dark';

/** The one preference the Shell reads: the theme. The rest of the preferences belong to setup-auth. */
const AppThemeSchema = z.object({ theme: z.enum(['system', 'light', 'dark']) });

const STORAGE_KEY = 'scriba.theme';

function readStored(): ThemeChoice {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'device';
  } catch {
    // Storage can be blocked (private browsing, for example). The default still works.
    return 'device';
  }
}

function writeStored(choice: ThemeChoice): void {
  try {
    if (choice === 'device') {
      globalThis.localStorage.removeItem(STORAGE_KEY);
    } else {
      globalThis.localStorage.setItem(STORAGE_KEY, choice);
    }
  } catch {
    // The choice still applies for this page view.
  }
}

/**
 * What applies: this browser's override first, then the app default when it is light or dark, then
 * the OS. `device` in the result means the OS decides.
 */
function effectiveChoice(override: ThemeChoice, appDefault: AppThemeDefault): ThemeChoice {
  if (override !== 'device') {
    return override;
  }
  return appDefault === 'system' ? 'device' : appDefault;
}

/**
 * Applies the effective theme as the `color-scheme` of the root element. The Material theme reads
 * `light-dark()` from that property. With no override the stylesheet's `light dark` follows the OS.
 */
function apply(choice: ThemeChoice): void {
  globalThis.document.documentElement.style.colorScheme = choice === 'device' ? '' : choice;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly api = inject(ApiClient);
  private readonly override = signal<ThemeChoice>(readStored());
  private readonly defaultTheme = signal<AppThemeDefault>('system');

  /** This browser's override, as the toggle shows it. */
  readonly choice: Signal<ThemeChoice> = this.override.asReadonly();

  /** The app default from the author's preferences. `system` until they choose a theme. */
  readonly appDefault: Signal<AppThemeDefault> = this.defaultTheme.asReadonly();

  /** The choice the toggle moves to next. The toggle's accessible name says it. */
  readonly nextChoice = computed<ThemeChoice>(() => {
    const current = this.override();
    if (current === 'device') {
      return 'light';
    }
    return current === 'light' ? 'dark' : 'device';
  });

  constructor() {
    apply(effectiveChoice(this.override(), this.defaultTheme()));
  }

  /** Reads the app default once. A failed read keeps the OS default, and the call is not retried. */
  loadAppDefault(): void {
    this.api.get(PREFERENCES_PATH, AppThemeSchema).subscribe({
      next: (preferences) => this.setAppDefault(preferences.theme),
      error: () => undefined,
    });
  }

  /** Sets the app default and applies it, unless this browser has its own override. */
  setAppDefault(theme: AppThemeDefault): void {
    this.defaultTheme.set(theme);
    apply(effectiveChoice(this.override(), theme));
  }

  set(choice: ThemeChoice): void {
    this.override.set(choice);
    writeStored(choice);
    apply(effectiveChoice(choice, this.defaultTheme()));
  }

  /** Moves to the next choice: device, then light, then dark, then device. */
  cycle(): void {
    this.set(this.nextChoice());
  }
}
