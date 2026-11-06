import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { Preferences, Theme } from '@bbartolome/scriba-contracts/setup-auth';
import { GENRE_PACK_NAMES, type GenrePackName } from '@bbartolome/scriba-contracts/tool-registry';
import { ThemeService } from '../../../shell';
import { SetupAuthApi } from '../setup-auth.api';
import { messageOf } from '../setup-errors';

/** The theme choices the form offers, with the text a person reads. */
const THEME_OPTIONS: readonly { readonly value: Theme; readonly label: string }[] = [
  { value: 'system', label: 'Follow the device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** The genre-pack names as the form shows them. */
const PACK_LABELS: Readonly<Record<GenrePackName, string>> = {
  nonfiction: 'Nonfiction',
  fiction: 'Fiction',
};

/** A theme the form offers. Any other value is the app's default, `system`. */
function themeOf(value: string): Theme {
  return THEME_OPTIONS.find((option) => option.value === value)?.value ?? 'system';
}

// provisional: survey 18 §7 item 10 (the pack is stored as an id, checked against the packs the app loads)
/** A pack name the form can offer, or null for "No default". Any other value is no default. */
function packOf(value: string | null): GenrePackName | null {
  return GENRE_PACK_NAMES.find((name) => name === value) ?? null;
}

/**
 * The preferences form, used by the setup wizard's Preferences step and by the settings page (survey
 * 18 §3). It saves the three preference fields as one field-level merge, applies the theme as the app
 * default, and reports the saved values. An empty name and an empty pack clear those fields.
 */
@Component({
  selector: 'app-preferences-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="preferences" (submit)="save($event)">
      <label>
        Your name
        <span class="hint">Used as the author of new projects.</span>
        <input
          name="authorDisplayName"
          type="text"
          autocomplete="name"
          maxlength="120"
          [value]="name()"
          (input)="name.set(valueOf($event))"
        />
      </label>
      <label>
        Theme
        <span class="hint">The app's default. This browser can still choose its own theme.</span>
        <select name="theme" (change)="chooseTheme($event)">
          @for (option of themes; track option.value) {
            <option [value]="option.value" [selected]="option.value === theme()">
              {{ option.label }}
            </option>
          }
        </select>
      </label>
      <label>
        Default genre pack for new projects
        <span class="hint">Used when a new project names no pack.</span>
        <select name="defaultGenrePack" (change)="choosePack($event)">
          <option value="" [selected]="pack() === null">No default</option>
          @for (option of packs; track option) {
            <option [value]="option" [selected]="option === pack()">{{ packLabel(option) }}</option>
          }
        </select>
      </label>
      <div class="actions">
        <button type="submit" [disabled]="busy()">{{ submitLabel() }}</button>
      </div>
      @if (message(); as text) {
        <p class="message" role="status">{{ text }}</p>
      }
      @if (error(); as text) {
        <p class="error" role="alert">{{ text }}</p>
      }
    </form>
  `,
  styles: `
    :host {
      display: block;
      max-width: 40rem;
    }
    .preferences {
      display: grid;
      gap: 0.75rem;
    }
    label {
      display: grid;
      gap: 0.25rem;
    }
    .hint {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    input,
    select {
      min-height: 44px;
      box-sizing: border-box;
      font: inherit;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    button {
      min-height: 44px;
      min-width: 44px;
      font: inherit;
    }
    .message,
    .error {
      margin: 0;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class PreferencesFormComponent implements OnInit {
  private readonly api = inject(SetupAuthApi);
  private readonly appTheme = inject(ThemeService);

  /** The saved values the form starts from. They are the defaults on a re-run. */
  readonly preferences = input.required<Preferences>();
  /** The text on the save button: "Save and continue" in the wizard, "Save" on the settings page. */
  readonly submitLabel = input('Save');
  /** Emits the saved values once the server has them. */
  readonly saved = output<Preferences>();

  protected readonly themes = THEME_OPTIONS;
  protected readonly packs = GENRE_PACK_NAMES;
  protected readonly name = signal('');
  protected readonly theme = signal<Theme>('system');
  protected readonly pack = signal<GenrePackName | null>(null);
  protected readonly busy = signal(false);
  protected readonly message = signal<string | undefined>(undefined);
  protected readonly error = signal<string | undefined>(undefined);

  ngOnInit(): void {
    const saved = this.preferences();
    this.name.set(saved.authorDisplayName ?? '');
    this.theme.set(saved.theme);
    this.pack.set(packOf(saved.defaultGenrePack));
  }

  protected packLabel(pack: GenrePackName): string {
    return PACK_LABELS[pack];
  }

  protected chooseTheme(event: Event): void {
    this.theme.set(themeOf(this.valueOf(event)));
  }

  protected choosePack(event: Event): void {
    this.pack.set(packOf(this.valueOf(event)));
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected save(event: Event): void {
    event.preventDefault();
    const trimmed = this.name().trim();
    this.busy.set(true);
    this.error.set(undefined);
    this.message.set(undefined);
    this.api
      .updatePreferences({
        authorDisplayName: trimmed === '' ? null : trimmed,
        theme: this.theme(),
        defaultGenrePack: this.pack(),
      })
      .subscribe({
        next: (saved) => {
          this.busy.set(false);
          this.appTheme.setAppDefault(saved.theme);
          this.message.set('Saved.');
          this.saved.emit(saved);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(messageOf(error));
        },
      });
  }
}
