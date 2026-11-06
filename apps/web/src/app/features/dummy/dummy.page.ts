import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { PlatformEnvelopeSchema } from '@bbartolome/scriba-contracts/platform';
import { filter, map } from 'rxjs';
import { EventStream, type ModuleEvent } from '../../shell';

/**
 * Describes one `platform` event, or returns undefined for a type this view does not know. The
 * event's data is parsed with the Platform's own schemas, the way a real feature parses its slice.
 */
function describePlatformEvent(event: ModuleEvent): string | undefined {
  const parsed = PlatformEnvelopeSchema.safeParse({
    module: 'platform',
    type: event.type,
    data: event.data,
  });
  if (!parsed.success) {
    return undefined;
  }
  const envelope = parsed.data;
  return envelope.type === 'echo' ? `echo ${envelope.data.seq}` : 'hello';
}

/** The stand-in feature view. It shows the platform events it gets and counts reconcile ticks. */
@Component({
  selector: 'app-dummy-page',
  template: `
    <h1>Dummy feature</h1>
    <p>A stand-in for a real module. It proves one route entry is enough to register a feature.</p>
    <dl class="facts">
      <dt>Last platform event</dt>
      <dd>{{ lastEvent() }}</dd>
      <dt>Reconcile ticks</dt>
      <dd>{{ ticks() }}</dd>
    </dl>
  `,
  styles: `
    .facts {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 8px 24px;
      max-width: 40rem;
    }
    dt {
      font: var(--mat-sys-label-large);
    }
    dd {
      margin: 0;
    }
  `,
})
export class DummyPage {
  private readonly stream = inject(EventStream);

  readonly ticks = signal(0);

  readonly lastEvent = toSignal(
    this.stream.forModule('platform').pipe(
      map(describePlatformEvent),
      filter((label): label is string => label !== undefined),
    ),
    { initialValue: 'none yet' },
  );

  constructor() {
    this.stream.reconcile$
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.ticks.update((count) => count + 1));
  }
}
