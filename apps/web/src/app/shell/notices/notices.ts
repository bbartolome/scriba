import { Injectable, type Signal, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

export type NoticeLevel = 'info' | 'warning' | 'error';

/** A banner notice. Features post with a stable id, so a later post can replace or clear it. */
export interface Notice {
  readonly id: string;
  readonly level: NoticeLevel;
  readonly message: string;
  readonly dismissible: boolean;
}

/**
 * The root notices service: an app-wide banner area and snackbars. The connection indicator's
 * "server unreachable" banner and feature warnings both go through here, so they look the same.
 */
@Injectable({ providedIn: 'root' })
export class NoticesService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly items = signal<readonly Notice[]>([]);

  /** The banner area, in the order each notice was first posted. */
  readonly banners: Signal<readonly Notice[]> = this.items.asReadonly();

  /** Shows a banner. Posting an id that is already shown replaces that banner in place. */
  banner(notice: Notice): void {
    this.items.update((current) =>
      current.some((item) => item.id === notice.id)
        ? current.map((item) => (item.id === notice.id ? notice : item))
        : [...current, notice],
    );
  }

  /** Removes a banner by id, whether the user dismissed it or the condition cleared. */
  clear(id: string): void {
    this.items.update((current) => current.filter((item) => item.id !== id));
  }

  /** Shows a transient snackbar. */
  snack(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 6000 });
  }
}
