// PROTOTYPE, throwaway. Root shell with links to both adapters.
import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `
    <nav style="padding: 8px; display: flex; gap: 12px;">
      <a routerLink="/foblex" data-testid="nav-foblex">@foblex/flow</a>
      <a routerLink="/vflow" data-testid="nav-vflow">ngx-vflow</a>
    </nav>
    <router-outlet />
  `,
})
export class App {}
