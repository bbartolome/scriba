import { Component, computed, effect, inject } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatToolbar } from '@angular/material/toolbar';
import { RouterOutlet } from '@angular/router';
import { EventStream } from './shell/sse/event-stream';
import { DeviceClassService } from './shell/device/device-class';
import { OpenViewService } from './shell/device/open-view';
import { ShellNav } from './shell/nav/shell-nav';
import { NoticesService } from './shell/notices/notices';
import { ThemeService, type ThemeChoice } from './shell/theme/theme';

/** The notice id for a view that stays open after the device shrinks below its class. */
const LARGER_SCREEN_NOTICE = 'open-view-needs-larger-screen';

const THEME_NAMES: Readonly<Record<ThemeChoice, string>> = {
  device: 'follow device',
  light: 'light',
  dark: 'dark',
};

/**
 * The theme toggle's glyphs as inline SVG paths (Material Design icon geometry, 24 by 24). They are
 * drawn, not set as ligature text, so the toolbar's text stays the title and the connection label.
 */
const THEME_ICON_PATHS: Readonly<Record<ThemeChoice, string>> = {
  device:
    'M10.85 12.65h2.3L12 9l-1.15 3.65zM20 15.31L23.31 12 20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69zM12 18c-.89 0-1.74-.2-2.5-.55C11.56 16.5 13 14.42 13 12s-1.44-4.5-3.5-5.45C10.26 6.2 11.11 6 12 6c3.31 0 6 2.69 6 6s-2.69 6-6 6z',
  light:
    'M12 9c1.65 0 3 1.35 3 3s-1.35 3-3 3-3-1.35-3-3 1.35-3 3-3m0-2c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z',
  dark: 'M9 2c-1.82 0-3.53.5-5 1.35C7 5.08 9 8.28 9 12s-2 6.92-5 8.65C5.47 21.5 7.18 22 9 22c5.52 0 10-4.48 10-10S14.52 2 9 2z',
};

/**
 * The Shell's root component: the toolbar with the connection indicator and the theme toggle, the
 * app-wide banner area, and the routed view beside the nav. It starts the one live stream.
 */
@Component({
  selector: 'app-root',
  imports: [MatButton, MatIconButton, MatToolbar, RouterOutlet, ShellNav],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly stream = inject(EventStream);
  private readonly openView = inject(OpenViewService);
  protected readonly notices = inject(NoticesService);
  protected readonly theme = inject(ThemeService);
  protected readonly device = inject(DeviceClassService).current;

  protected readonly connection = this.stream.connection;
  protected readonly connectionLabel = computed(() => {
    switch (this.connection()) {
      case 'connecting':
        return 'Connecting';
      case 'reconnecting':
        return 'Reconnecting';
      case 'closed':
        return 'Offline, retrying';
      case 'open':
        return '';
    }
  });
  protected readonly themeIconPath = computed(() => THEME_ICON_PATHS[this.theme.choice()]);
  protected readonly themeLabel = computed(
    () =>
      `Theme: ${THEME_NAMES[this.theme.choice()]}. Switch to ${THEME_NAMES[this.theme.nextChoice()]}.`,
  );

  constructor() {
    this.stream.start();
    effect(() => {
      if (this.openView.tooSmall()) {
        this.notices.banner({
          id: LARGER_SCREEN_NOTICE,
          level: 'info',
          message: 'This view is built for a larger screen. It stays open.',
          dismissible: true,
        });
      } else {
        this.notices.clear(LARGER_SCREEN_NOTICE);
      }
    });
  }
}
