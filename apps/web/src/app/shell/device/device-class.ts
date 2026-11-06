import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Injectable, type Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import type { DeviceClass } from '../route-data';

/**
 * The root device-class signal. It comes from the CDK's `Handset`, `Tablet` and `Web` queries,
 * which account for orientation: a phone in landscape stays `phone`, and a 12.9-inch iPad in
 * portrait is `desktop`.
 */
@Injectable({ providedIn: 'root' })
export class DeviceClassService {
  private readonly observer = inject(BreakpointObserver);

  readonly current: Signal<DeviceClass> = toSignal(
    this.observer.observe([Breakpoints.Handset, Breakpoints.Tablet, Breakpoints.Web]).pipe(
      map(() => this.classify()),
      distinctUntilChanged(),
    ),
    { requireSync: true },
  );

  private classify(): DeviceClass {
    if (this.observer.isMatched(Breakpoints.Handset)) {
      return 'phone';
    }
    if (this.observer.isMatched(Breakpoints.Tablet)) {
      return 'tablet';
    }
    return 'desktop';
  }
}
