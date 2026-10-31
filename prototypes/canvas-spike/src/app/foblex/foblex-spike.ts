// PROTOTYPE, throwaway. @foblex/flow adapter for the canvas spike.
import { Component, inject } from '@angular/core';
import { FCreateConnectionEvent, FFlowModule } from '@foblex/flow';
import { GraphNode, PortModel, RECIPE, STORY, portsFor, TOOLS } from '../spike/contract';
import { SpikeStore } from '../spike/store';
import { portAt, startEntityDrag } from '../spike/drag';

@Component({
  selector: 'app-foblex-spike',
  imports: [FFlowModule],
  template: `
    <div class="toolbar">
      <button data-testid="view-story" (click)="store.setView(story)">Story</button>
      <button data-testid="view-recipe" (click)="store.setView(recipe)">Recipe</button>
      <span data-testid="edge-count">{{ store.edgeCount() }} edges</span>
    </div>

    <div class="layout">
      <aside class="side">
        <p>Entities</p>
        @for (e of store.entities; track e.id) {
          <div class="chip" [attr.data-testid]="'chip-' + e.id" (pointerdown)="dragChip($event, e.id)">
            {{ e.label }}
          </div>
        }
      </aside>

      <f-flow fDraggable class="flow" data-testid="flow" (fCreateConnection)="onCreate($event)">
        <f-canvas>
          @for (e of store.edges(); track e.id) {
            <f-connection [fSourceId]="e.from" [fTargetId]="e.to" />
          }
          <f-connection-for-create />

          @for (n of store.view().nodes; track n.id) {
            <div fNode [fNodePosition]="n.position" class="node" [attr.data-node]="n.id">
              <header fDragHandle>{{ toolLabel(n) }} · {{ statusOf(n.id) }}</header>
              @for (p of portsOf(n); track p.id) {
                <div class="row" [class.out]="p.dir === 'out'">
                  @if (p.dir === 'in') {
                    <div
                      fConnector
                      fConnectorType="target"
                      [fConnectorId]="p.id"
                      [fConnectorCategory]="p.type"
                      class="port"
                      [attr.data-port]="p.id"
                    ></div>
                    <span>{{ p.key }} ({{ p.type }})</span>
                    @if (store.bindings()[p.id]; as bound) {
                      <span class="bound" [attr.data-testid]="'bound-' + p.id">← {{ entityLabel(bound) }}</span>
                    }
                  } @else {
                    <span>{{ p.key }} ({{ p.type }})</span>
                    <div
                      fConnector
                      fConnectorType="source"
                      [fConnectorId]="p.id"
                      [fConnectorCategory]="p.type"
                      [fCanBeConnectedTo]="[p.type]"
                      class="port"
                      [attr.data-port]="p.id"
                    ></div>
                  }
                </div>
              }
              @if (n.tool === 'expand') {
                <button [attr.data-testid]="'run-' + n.id" (click)="store.run(n.id)">Run</button>
                <div [attr.data-testid]="'result-' + n.id">{{ store.runtime()[n.id]?.result }}</div>
              }
            </div>
          }
        </f-canvas>
      </f-flow>
    </div>

    <pre data-testid="log">{{ store.log().join('\n') }}</pre>
    <pre data-testid="rejected">{{ store.rejected().join('\n') }}</pre>
  `,
  styles: `
    .toolbar, .layout { display: flex; gap: 12px; align-items: flex-start; }
    .side { width: 140px; }
    .chip { touch-action: none; user-select: none; padding: 6px 10px; margin: 4px 0; background: #eef; border-radius: 6px; cursor: grab; }
    .flow { height: 520px; flex: 1; border: 1px solid #ccc; }
    .node { background: #fff; border: 1px solid #888; border-radius: 6px; min-width: 200px; font-size: 12px; }
    .node header { background: #f3f3f3; padding: 6px; cursor: move; }
    .row { position: relative; display: flex; align-items: center; gap: 6px; padding: 4px 8px; }
    .row.out { justify-content: flex-end; }
    .port { width: 12px; height: 12px; border-radius: 50%; background: #3366ff; flex: none; }
    .bound { color: #0a7; }
    pre { font-size: 11px; background: #fafafa; padding: 6px; }
  `,
})
export class FoblexSpike {
  readonly store = inject(SpikeStore);
  readonly story = STORY;
  readonly recipe = RECIPE;

  constructor() {
    (window as unknown as { __spike: unknown }).__spike = { snapshot: () => this.store.snapshot() };
  }

  portsOf(n: GraphNode): PortModel[] {
    return portsFor(n.id, n.tool);
  }

  toolLabel(n: GraphNode) {
    return TOOLS[n.tool].label;
  }

  statusOf(id: string) {
    return this.store.runtime()[id]?.status ?? 'idle';
  }

  entityLabel(id: string) {
    return this.store.entities.find((e) => e.id === id)?.label ?? id;
  }

  dragChip(ev: PointerEvent, entityId: string) {
    startEntityDrag(ev, (x, y) => {
      const port = portAt(x, y);
      if (port) this.store.bindEntity(port, entityId);
    });
  }

  onCreate(ev: FCreateConnectionEvent) {
    // Library withholds targetId when the drop is not a connectable target (typed-port gate).
    if (!ev.targetId) return;
    this.store.connect(ev.sourceId, ev.targetId, 'library');
  }
}
