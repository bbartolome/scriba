// PROTOTYPE, throwaway. Library-agnostic graph contract + schema-driven port generation.
// Shared by the @foblex/flow and ngx-vflow adapters so both render identical data.

export type PortType = 'text' | 'entity' | 'style';
export type PortDir = 'in' | 'out';

export interface PortSpec {
  'x-scriba-port': PortDir;
  'x-scriba-type': PortType;
}

// A tool spec: JSON-Schema-shaped properties with x-scriba-* hints. Ports are generated from these.
export interface ToolSpec {
  label: string;
  properties: Record<string, PortSpec>;
}

export const TOOLS: Record<string, ToolSpec> = {
  draft: {
    label: 'Chapter draft',
    properties: { text: { 'x-scriba-port': 'out', 'x-scriba-type': 'text' } },
  },
  expand: {
    label: 'Expand',
    properties: {
      draft: { 'x-scriba-port': 'in', 'x-scriba-type': 'text' },
      subject: { 'x-scriba-port': 'in', 'x-scriba-type': 'entity' },
      text: { 'x-scriba-port': 'out', 'x-scriba-type': 'text' },
    },
  },
  output: {
    label: 'Output',
    properties: { text: { 'x-scriba-port': 'in', 'x-scriba-type': 'text' } },
  },
};

export interface PortModel {
  id: string; // `${nodeId}.${key}`, the handle / connector id
  key: string;
  dir: PortDir;
  type: PortType;
}

export function portsFor(nodeId: string, tool: string): PortModel[] {
  return Object.entries(TOOLS[tool].properties).map(([key, spec]) => ({
    id: `${nodeId}.${key}`,
    key,
    dir: spec['x-scriba-port'],
    type: spec['x-scriba-type'],
  }));
}

export interface GraphNode {
  id: string;
  tool: string;
  position: { x: number; y: number };
}

// Edges reference port ids: from = output port, to = input port.
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
}

export interface GraphContract {
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const STORY: GraphContract = {
  name: 'Story graph',
  nodes: [
    { id: 'src', tool: 'draft', position: { x: 40, y: 60 } },
    { id: 'exp', tool: 'expand', position: { x: 300, y: 40 } },
    { id: 'out', tool: 'output', position: { x: 620, y: 80 } },
  ],
  edges: [{ id: 'e1', from: 'src.text', to: 'exp.draft' }],
};

export const RECIPE: GraphContract = {
  name: 'Recipe graph',
  nodes: [
    { id: 'src', tool: 'draft', position: { x: 60, y: 200 } },
    { id: 'exp', tool: 'expand', position: { x: 340, y: 60 } },
    { id: 'out', tool: 'output', position: { x: 600, y: 220 } },
  ],
  edges: [
    { id: 'r1', from: 'src.text', to: 'exp.draft' },
    { id: 'r2', from: 'exp.text', to: 'out.text' },
  ],
};

export const ENTITIES = [
  { id: 'alice', label: 'Alice' },
  { id: 'bob', label: 'Bob' },
];

// Typed-port rule, applied by the app layer as the reference for both libraries.
export function canConnect(from: PortType, to: PortType): boolean {
  return from === to;
}
