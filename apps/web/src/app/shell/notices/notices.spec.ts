import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoticesService } from './notices';

describe('NoticesService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    TestBed.inject(MatSnackBar).dismiss();
  });

  it('replaces a banner that is posted again with the same id, in its place', () => {
    const notices = TestBed.inject(NoticesService);

    notices.banner({ id: 'a', level: 'info', message: 'first', dismissible: true });
    notices.banner({ id: 'b', level: 'error', message: 'second', dismissible: false });
    notices.banner({ id: 'a', level: 'warning', message: 'replaced', dismissible: true });

    expect(notices.banners().map((notice) => [notice.id, notice.message])).toEqual([
      ['a', 'replaced'],
      ['b', 'second'],
    ]);
  });

  it('removes a banner by id and ignores an unknown id', () => {
    const notices = TestBed.inject(NoticesService);
    notices.banner({ id: 'a', level: 'info', message: 'first', dismissible: true });

    notices.clear('unknown');
    notices.clear('a');

    expect(notices.banners()).toEqual([]);
  });

  it('shows a snackbar with its message', async () => {
    TestBed.inject(NoticesService).snack('Settings saved');

    await vi.waitFor(() => expect(document.body.textContent).toContain('Settings saved'));
  });
});
