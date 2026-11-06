import { Injectable, type Signal, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { DEVICE_CLASS_RANK, type DeviceClass, isDeviceClass } from '../route-data';
import { DeviceClassService } from './device-class';

/**
 * The minimum class of the view that is open, and whether the device is now below it. The gate
 * only runs at navigation, so a view that is open when the device shrinks stays open. The Shell
 * then shows a notice instead (spec: "A view that is already open is not torn down").
 */
@Injectable({ providedIn: 'root' })
export class OpenViewService {
  private readonly router = inject(Router);
  private readonly device = inject(DeviceClassService).current;

  /** Undefined for the landing page and the Shell's own pages, which declare no minimum. */
  readonly minClass: Signal<DeviceClass | undefined> = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.readMinClass()),
    ),
    { initialValue: this.readMinClass() },
  );

  readonly tooSmall = computed(() => {
    const minClass = this.minClass();
    return minClass !== undefined && DEVICE_CLASS_RANK[this.device()] < DEVICE_CLASS_RANK[minClass];
  });

  private readMinClass(): DeviceClass | undefined {
    const declared: unknown = this.router.routerState.snapshot.root.firstChild?.data['minClass'];
    return isDeviceClass(declared) ? declared : undefined;
  }
}
