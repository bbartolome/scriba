import { Component, computed, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { type Routes, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { DeviceClassService } from '../device/device-class';
import { ActiveProjectService } from '../project/active-project';
import {
  DEFAULT_MIN_CLASS,
  DEVICE_CLASS_RANK,
  type DeviceClass,
  isDeviceClass,
} from '../route-data';

export interface NavItem {
  readonly label: string;
  readonly icon: string;
  readonly link: string;
}

const PROJECT_PARAM = ':projectId';

/**
 * Builds the nav from the route table's `data`, so the Shell never imports feature code. An item
 * is hidden when its minimum class is above the device. A project-scoped item is shown only while a
 * project is active, and links into that project.
 */
export function navItems(
  routes: Routes,
  device: DeviceClass,
  projectId: string | null,
): readonly NavItem[] {
  const items: { readonly order: number; readonly item: NavItem }[] = [];
  for (const route of routes) {
    const data = route.data ?? {};
    const label: unknown = data['navLabel'];
    if (typeof label !== 'string' || route.path === undefined) {
      continue;
    }
    const declared: unknown = data['minClass'];
    const minClass = isDeviceClass(declared) ? declared : DEFAULT_MIN_CLASS;
    if (DEVICE_CLASS_RANK[device] < DEVICE_CLASS_RANK[minClass]) {
      continue;
    }
    const segments = route.path.split('/');
    if (segments.includes(PROJECT_PARAM) && projectId === null) {
      continue;
    }
    const link = `/${segments.map((s) => (s === PROJECT_PARAM ? (projectId ?? '') : s)).join('/')}`;
    const icon: unknown = data['navIcon'];
    const order: unknown = data['navOrder'];
    items.push({
      order: typeof order === 'number' ? order : 0,
      item: { label, icon: typeof icon === 'string' ? icon : '', link },
    });
  }
  return items.sort((a, b) => a.order - b.order).map((entry) => entry.item);
}

/**
 * The nav in one of three forms by device class (#2): a bottom bar on a phone, a compact rail on
 * a tablet, and an expanded side nav on a desktop.
 */
@Component({
  selector: 'app-shell-nav',
  imports: [MatIcon, MatListModule, RouterLink, RouterLinkActive],
  template: `
    @switch (device()) {
      @case ('phone') {
        <nav class="bottom" aria-label="Main">
          @for (item of items(); track item.link) {
            <a
              class="entry"
              [routerLink]="item.link"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
            >
              <mat-icon aria-hidden="true">{{ item.icon }}</mat-icon>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
      }
      @case ('tablet') {
        <nav class="rail" aria-label="Main">
          @for (item of items(); track item.link) {
            <a
              class="entry"
              [routerLink]="item.link"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
            >
              <mat-icon aria-hidden="true">{{ item.icon }}</mat-icon>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
      }
      @default {
        <mat-nav-list class="side" aria-label="Main">
          @for (item of items(); track item.link) {
            <a
              mat-list-item
              [routerLink]="item.link"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
            >
              <mat-icon matListItemIcon aria-hidden="true">{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }
        </mat-nav-list>
      }
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .bottom {
      position: fixed;
      inset: auto 0 0;
      z-index: 2;
      display: flex;
      justify-content: space-around;
      padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface);
    }
    .rail {
      display: flex;
      flex: none;
      flex-direction: column;
      gap: 8px;
      width: 80px;
      padding: 12px 0;
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface);
    }
    .side {
      flex: none;
      width: 240px;
    }
    .entry {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 12px;
      color: inherit;
      font: var(--mat-sys-label-medium);
      text-decoration: none;
    }
    .entry.active {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
  `,
})
export class ShellNav {
  private readonly router = inject(Router);
  protected readonly device = inject(DeviceClassService).current;
  private readonly projectId = inject(ActiveProjectService).projectId;

  protected readonly items = computed(() =>
    navItems(this.router.config, this.device(), this.projectId()),
  );
}
