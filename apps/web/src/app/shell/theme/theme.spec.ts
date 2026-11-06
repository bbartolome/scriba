import { TestBed } from '@angular/core/testing';
import { FakeApi, provideFakeApi } from '../../testing/fake-api';
import { PREFERENCES_PATH } from '../route-data';
import { ThemeService } from './theme';

/**
 * The theme precedence (survey 18 §7 item 14, provisional): this browser's override first, then the app
 * default from the author's preferences, then the device.
 */
describe('the theme precedence (survey 18 §7 item 14)', () => {
  let api: FakeApi;

  function setup(theme: 'system' | 'light' | 'dark' | undefined): ThemeService {
    api = new FakeApi();
    if (theme !== undefined) {
      api.reply('GET', PREFERENCES_PATH, 200, {
        authorDisplayName: null,
        theme,
        defaultGenrePack: null,
      });
    }
    TestBed.configureTestingModule({ providers: [provideFakeApi(api)] });
    const service = TestBed.inject(ThemeService);
    service.loadAppDefault();
    return service;
  }

  function applied(): string {
    return document.documentElement.style.colorScheme;
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.style.colorScheme = '';
  });

  it('follows the device when nothing is saved', () => {
    setup(undefined);

    expect(applied()).toBe('');
  });

  it('applies the app default when this browser has no override', () => {
    const service = setup('dark');

    expect(service.appDefault()).toBe('dark');
    expect(applied()).toBe('dark');
  });

  it('lets this browser override the app default', () => {
    localStorage.setItem('scriba.theme', 'light');
    setup('dark');

    expect(applied()).toBe('light');
  });

  it('follows the device when the app default is system', () => {
    setup('system');

    expect(applied()).toBe('');
  });

  it('keeps the device default when the preferences cannot be read', () => {
    const service = setup(undefined);

    expect(service.appDefault()).toBe('system');
    expect(applied()).toBe('');
  });
});
