// PROTOTYPE, throwaway. Runtime state shared by both adapters: graph edges, port bindings, node run status.
import { Injectable, computed, signal } from '@angular/core';
import { ENTITIES, GraphContract, GraphEdge, PortModel, STORY, canConnect, portsFor, TOOLS } from './contract';

export type RunStatus = 'idle' | 'running' | 'done';
export interface NodeRuntime {
  status: RunStatus;
  result?: string;
}

@Injectable({ providedIn: 'root' })
export class SpikeStore {
  readonly view = signal<GraphContract>(STORY);
  readonly edges = signal<GraphEdge[]>([...STORY.edges]);
  readonly runtime = signal<Record<string, NodeRuntime>>({});
  readonly bindings = signal<Record<string, string>>({}); // portId -> entityId
  readonly log = signal<string[]>([]);
  readonly rejected = signal<string[]>([]);

  readonly entities = ENTITIES;

  // Port lookup for the whole current view, keyed by portId.
  readonly ports = computed(() => {
    const map = new Map<string, PortModel>();
    for (const n of this.view().nodes) for (const p of portsFor(n.id, n.tool)) map.set(p.id, p);
    return map;
  });

  readonly edgeCount = computed(() => this.edges().length);

  setView(v: GraphContract) {
    this.view.set(v);
    this.edges.set([...v.edges]);
    this.runtime.set({});
    this.bindings.set({});
    this.log.set([]);
    this.rejected.set([]);
  }

  typeOf(portId: string) {
    return this.ports().get(portId);
  }

  // App-level guard. Each adapter must already refuse mismatched pairs on its own; this only records attempts that slipped through.
  connect(fromPort: string, toPort: string, source: 'library' | 'app') {
    const a = this.typeOf(fromPort);
    const b = this.typeOf(toPort);
    if (!a || !b || a.dir !== 'out' || b.dir !== 'in' || !canConnect(a.type, b.type)) {
      this.rejected.update((r) => [...r, `${fromPort}→${toPort}`]);
      return false;
    }
    if (this.edges().some((e) => e.from === fromPort && e.to === toPort)) return false;
    this.edges.update((es) => [...es, { id: `c-${fromPort}-${toPort}`, from: fromPort, to: toPort }]);
    this.log.update((l) => [...l, `connect ${fromPort}→${toPort} (${source})`]);
    return true;
  }

  // Dropping an entity chip onto an entity input port binds it. Text or output ports refuse the drop.
  bindEntity(portId: string, entityId: string) {
    const p = this.typeOf(portId);
    if (!p || p.dir !== 'in' || p.type !== 'entity') {
      this.rejected.update((r) => [...r, `drop ${entityId}→${portId}`]);
      return false;
    }
    this.bindings.update((b) => ({ ...b, [portId]: entityId }));
    this.log.update((l) => [...l, `bind ${portId}=${entityId}`]);
    return true;
  }

  run(nodeId: string) {
    const node = this.view().nodes.find((n) => n.id === nodeId);
    if (!node || TOOLS[node.tool].label !== 'Expand') return;
    this.runtime.update((r) => ({ ...r, [nodeId]: { status: 'running' } }));
    setTimeout(() => {
      const subject = this.bindings()[`${nodeId}.subject`];
      const who = subject ? ENTITIES.find((e) => e.id === subject)?.label : 'nobody';
      this.runtime.update((r) => ({
        ...r,
        [nodeId]: { status: 'done', result: `Expanded draft about ${who}` },
      }));
    }, 500);
  }

  snapshot() {
    return {
      view: this.view().name,
      edges: this.edges(),
      bindings: this.bindings(),
      runtime: this.runtime(),
      rejected: this.rejected(),
      log: this.log(),
    };
  }
}
