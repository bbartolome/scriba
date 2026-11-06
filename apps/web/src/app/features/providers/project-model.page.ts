import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActiveProjectService } from '../../shell';
import { ProjectModelPanelComponent } from './project-model-panel.component';

/**
 * The project's settings page, under the project's own route (`projects/:projectId/settings`). The
 * page is a heading around the panel, which holds the project's override. The Shell's active-project
 * signal names the project, so the panel is recreated when the author opens another project.
 */
@Component({
  selector: 'app-project-model-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectModelPanelComponent],
  template: `
    <h1>Project settings</h1>
    @for (id of projectIds(); track id) {
      <app-project-model-panel [projectId]="id" />
    } @empty {
      <p>Open a project to set its model.</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class ProjectModelPage {
  private readonly active = inject(ActiveProjectService);

  protected readonly projectIds = computed(() => {
    const id = this.active.projectId();
    return id === null ? [] : [id];
  });
}
