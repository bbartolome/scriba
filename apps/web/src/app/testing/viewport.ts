export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface ViewportControl {
  /** Changes the viewport and tells every listening media query, as a browser does on resize. */
  resize(viewport: Viewport): void;
  /** Puts back the previous `matchMedia`, or removes the one this installed. */
  restore(): void;
}

interface MediaChange {
  readonly matches: boolean;
  readonly media: string;
}

type MediaListener = (event: MediaChange) => void;

interface FakeMediaQuery {
  readonly media: string;
  readonly matches: boolean;
  addListener(listener: MediaListener): void;
  removeListener(listener: MediaListener): void;
}

interface Registration {
  readonly query: FakeMediaQuery;
  readonly listeners: Set<MediaListener>;
  last: boolean;
}

/** Converts `600px` to 600. Anything else is a length this fake does not support. */
function px(value: string): number {
  const number = Number.parseFloat(value);
  if (!value.endsWith('px') || Number.isNaN(number)) {
    throw new Error(`viewport fake cannot read the length ${value}`);
  }
  return number;
}

/** The user preferences a test does not set. Material reads these for its motion and colour. */
const DEFAULT_PREFERENCES: Readonly<Record<string, string>> = {
  'prefers-reduced-motion': 'no-preference',
  'prefers-color-scheme': 'light',
};

function matchesCondition(condition: string, viewport: Viewport): boolean {
  const match = /^\(\s*([a-z-]+)\s*(?::\s*([^)]+?)\s*)?\)$/.exec(condition);
  if (match === null) {
    throw new Error(`viewport fake cannot evaluate the condition ${condition}`);
  }
  const feature = match[1] ?? '';
  const value = match[2];
  const preference = DEFAULT_PREFERENCES[feature];
  if (preference !== undefined) {
    // A bare preference, such as (prefers-reduced-motion), matches only when one is set.
    return value === undefined ? false : preference === value;
  }
  if (value === undefined) {
    throw new Error(`viewport fake needs a value for the feature ${feature}`);
  }
  switch (feature) {
    case 'min-width':
      return viewport.width >= px(value);
    case 'max-width':
      return viewport.width <= px(value);
    case 'orientation':
      return (viewport.width >= viewport.height ? 'landscape' : 'portrait') === value;
    default:
      throw new Error(`viewport fake does not support the feature ${feature}`);
  }
}

/**
 * Evaluates the media queries the CDK uses: comma-separated alternatives, `and` conditions, and the
 * min-width, max-width and orientation features. Anything else throws, so a new query fails loudly.
 */
export function matchesQuery(query: string, viewport: Viewport): boolean {
  return query.split(',').some((alternative) =>
    alternative
      .trim()
      .split(/\s+and\s+/)
      .every((condition) => matchesCondition(condition.trim(), viewport)),
  );
}

/**
 * Replaces `window.matchMedia` with one that evaluates queries against a viewport the test sets.
 * Install it before the CDK's MediaMatcher is created, since that binds `matchMedia` on creation.
 */
export function installViewport(initial: Viewport): ViewportControl {
  const previous: unknown = window.matchMedia;
  let viewport = initial;
  const registrations: Registration[] = [];

  const create = (media: string): FakeMediaQuery => {
    const listeners = new Set<MediaListener>();
    const query: FakeMediaQuery = {
      media,
      get matches(): boolean {
        return matchesQuery(media, viewport);
      },
      addListener(listener): void {
        listeners.add(listener);
      },
      removeListener(listener): void {
        listeners.delete(listener);
      },
    };
    registrations.push({ query, listeners, last: query.matches });
    return query;
  };

  window.matchMedia = ((media: string) => create(media)) as unknown as typeof window.matchMedia;

  return {
    resize(next: Viewport): void {
      viewport = next;
      for (const registration of registrations) {
        const matches = registration.query.matches;
        if (matches !== registration.last) {
          registration.last = matches;
          for (const listener of registration.listeners) {
            listener({ matches, media: registration.query.media });
          }
        }
      }
    },
    restore(): void {
      if (previous === undefined) {
        delete (window as { matchMedia?: unknown }).matchMedia;
      } else {
        window.matchMedia = previous as typeof window.matchMedia;
      }
    },
  };
}
