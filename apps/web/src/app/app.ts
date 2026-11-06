import { Component, computed, effect, inject } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
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

const THEME_ICONS: Readonly<Record<ThemeChoice, string>> = {
  device: 'brightness_auto',
  light: 'light_mode',
  dark: 'dark_mode',
};

/**
 * The Shell's root component: the toolbar with the connection indicator and the theme toggle, the
 * app-wide banner area, and the routed view beside the nav. It starts the one live stream.
 */
@Component({
  selector: 'app-root',
  imports: [MatButton, MatIcon, MatIconButton, MatToolbar, RouterOutlet, ShellNav],
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
  protected readonly themeIcon = computed(() => THEME_ICONS[this.theme.choice()]);
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
