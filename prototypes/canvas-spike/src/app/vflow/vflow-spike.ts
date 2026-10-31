// PROTOTYPE, throwaway. ngx-vflow adapter for the canvas spike.
import { Component, computed, inject } from '@angular/core';
import { ConnectionSettings, CustomNodeComponent, HandleComponent, Vflow, createNodes } from 'ngx-vflow';
import { GraphNode, PortModel, RECIPE, STORY, canConnect, portsFor, TOOLS } from '../spike/contract';
import { SpikeStore } from '../spike/store';
import { portAt, startEntityDrag } from '../spike/drag';

// Generic node: renders whatever ports the spec generated, one <handle> per port.
@Component({
  selector: 'app-tool-node',
  imports: [HandleComponent],
  template: `
    <div class="node" [attr.data-node]="node().id">
      <header>{{ label() }} · {{ status() }}</header>
      @for (p of ports(); track p.id) {
        <!-- A handle is positioned from its parent element, so each one lives in its own row and sits at that row's centre. -->
        <div class="row" [class.out]="p.dir === 'out'">
          <!-- Handles render inside the SVG layer, so the visual must be SVG. It carries data-port; the default circle has no id. -->
          <ng-template #dot let-h>
            <svg:circle [attr.cx]="h.point().x" [attr.cy]="h.point().y" r="5" fill="#3366ff" [attr.data-port]="p.id"></svg:circle>
          </ng-template>
          @if (p.dir === 'in') {
            <handle type="target" position="left" [id]="p.id" [template]="dot" />
            <span>{{ p.key }} ({{ p.type }})</span>
            @if (store.bindings()[p.id]; as bound) {
              <span class="bound" [attr.data-testid]="'bound-' + p.id">← {{ entityLabel(bound) }}</span>
            }
          } @else {
            <span>{{ p.key }} ({{ p.type }})</span>
            <handle type="source" position="right" [id]="p.id" [template]="dot" />
          }
        </div>
      }
      @if (tool() === 'expand') {
        <button [attr.data-testid]="'run-' + node().id" (click)="store.run(node().id)">Run</button>
        <div [attr.data-testid]="'result-' + node().id">{{ store.runtime()[node().id]?.result }}</div>
      }
    </div>
  `,
  styles: `
    .node { background: #fff; border: 1px solid #888; border-radius: 6px; min-width: 200px; font-size: 12px; }
    .node header { background: #f3f3f3; padding: 6px; }
    .row { display: flex; gap: 6px; padding: 4px 8px; }
    .row.out { justify-content: flex-end; }
    .bound { color: #0a7; }
  `,
})
export class ToolNodeComponent extends CustomNodeComponent<{ tool: string }> {
  readonly store = inject(SpikeStore);

  tool() {
    return this.node().data?.().tool ?? '';
  }

  label() {
    return TOOLS[this.tool()]?.label ?? '';
  }

  ports(): PortModel[] {
    return portsFor(this.node().id, this.tool());
  }

  status() {
    return this.store.runtime()[this.node().id]?.status ?? 'idle';
  }

  entityLabel(id: string) {
    return this.store.entities.find((e) => e.id === id)?.label ?? id;
  }
}

@Component({
  selector: 'app-vflow-spike',
  imports: [Vflow],
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

      <vflow
        class="flow"
        data-testid="flow"
        connect
        [view]="'auto'"
        [connection]="connectionSettings"
        [nodes]="nodes()"
        [edges]="edges()"
        (connect)="onConnect($event)"
      ></vflow>
    </div>

    <pre data-testid="log">{{ store.log().join('\n') }}</pre>
    <pre data-testid="rejected">{{ store.rejected().join('\n') }}</pre>
  `,
  styles: `
    .toolbar, .layout { display: flex; gap: 12px; align-items: flex-start; }
    .side { width: 140px; }
    .chip { touch-action: none; user-select: none; padding: 6px 10px; margin: 4px 0; background: #eef; border-radius: 6px; cursor: grab; }
    .flow { display: block; height: 520px; flex: 1; border: 1px solid #ccc; }
    pre { font-size: 11px; background: #fafafa; padding: 6px; }
  `,
})
export class VflowSpike {
  readonly store = inject(SpikeStore);
  readonly story = STORY;
  readonly recipe = RECIPE;

  // Validator is the typed-port gate. It sees only handle ids, so it resolves types from the shared port map.
  readonly connectionSettings: ConnectionSettings = {
    validator: (c) => this.validate(c),
  };

  // Rebuilt on view change only. Runtime and edge changes must not recreate nodes (that would reset drag state).
  readonly nodes = computed(() =>
    createNodes(
      this.store.view().nodes.map((n: GraphNode) => ({
        id: n.id,
        type: ToolNodeComponent,
        point: n.position,
        data: { tool: n.tool },
      })),
      { useDefaults: true },
    ),
  );

  readonly edges = computed(() =>
    this.store.edges().map((e) => ({
      id: e.id,
      source: e.from.split('.')[0],
      target: e.to.split('.')[0],
      sourceHandle: e.from,
      targetHandle: e.to,
    })),
  );

  constructor() {
    (window as unknown as { __spike: unknown }).__spike = { snapshot: () => this.store.snapshot() };
  }

  private validate(c: { sourceHandle?: string; targetHandle?: string }): boolean {
    const from = c.sourceHandle ? this.store.typeOf(c.sourceHandle) : undefined;
    const to = c.targetHandle ? this.store.typeOf(c.targetHandle) : undefined;
    return !!from && !!to && from.dir === 'out' && to.dir === 'in' && canConnect(from.type, to.type);
  }

  // Fires only for connections the validator accepted; the library never emits a refused pair here.
  onConnect(c: { sourceHandle?: string; targetHandle?: string }) {
    if (c.sourceHandle && c.targetHandle) this.store.connect(c.sourceHandle, c.targetHandle, 'library');
  }

  dragChip(ev: PointerEvent, entityId: string) {
    startEntityDrag(ev, (x, y) => {
      const port = portAt(x, y);
      if (port) this.store.bindEntity(port, entityId);
    });
  }
}
