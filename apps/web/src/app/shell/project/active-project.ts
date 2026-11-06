import { Injectable, type Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/**
 * The active project, read from the `projectId` route parameter of a project-scoped view. The
 * Project store owns the project list. The Shell owns only this signal, so every project-scoped
 * view agrees on which project is open (spec: "active-project signal").
 */
@Injectable({ providedIn: 'root' })
export class ActiveProjectService {
  private readonly router = inject(Router);

  readonly projectId: Signal<string | null> = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.readProjectId()),
    ),
    { initialValue: this.readProjectId() },
  );

  private readProjectId(): string | null {
    let node: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    while (node) {
      const id: unknown = node.params['projectId'];
      if (typeof id === 'string') {
        return id;
      }
      node = node.firstChild;
    }
    return null;
  }
}
