import { Injectable, type Signal, computed, signal } from '@angular/core';

/**
 * `device` follows the OS setting (the default). `light` and `dark` are the device's own override.
 * Devices are access points, not identities (#2), so the override is device-local and is never
 * sent to the server. The #18 app default (owner item O4) is not read here.
 */
export type ThemeChoice = 'device' | 'light' | 'dark';

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
 * Applies the override as the `color-scheme` of the root element. The Material theme reads
 * `light-dark()` from that property. With no override the stylesheet's `light dark` follows the OS.
 */
function apply(choice: ThemeChoice): void {
  globalThis.document.documentElement.style.colorScheme = choice === 'device' ? '' : choice;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly state = signal<ThemeChoice>(readStored());
  readonly choice: Signal<ThemeChoice> = this.state.asReadonly();

  /** The choice the toggle moves to next. The toggle's accessible name says it. */
  readonly nextChoice = computed<ThemeChoice>(() => {
    const current = this.state();
    if (current === 'device') {
      return 'light';
    }
    return current === 'light' ? 'dark' : 'device';
  });

  constructor() {
    apply(this.state());
  }

  set(choice: ThemeChoice): void {
    this.state.set(choice);
    writeStored(choice);
    apply(choice);
  }

  /** Moves to the next choice: device, then light, then dark, then device. */
  cycle(): void {
    this.set(this.nextChoice());
  }
}
