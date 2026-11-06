import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ValidationIssue } from '@bbartolome/scriba-contracts/tool-registry';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { ENTITY_CHIP_MIME } from './entity-picker';
import { ToolFormComponent } from './tool-form';
import { COLD_OPEN, EVERY_CONTROL, PROJECT_ENTITIES } from './fixtures';

const VALIDATE = '/api/tools/cold_open/validate';

/** A drop event carrying an entity chip, as a browser fires it. The data transfer is a fake. */
function dropChip(target: Element, chipId: string | undefined, text?: string): void {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  const data: Record<string, string> = {};
  if (chipId !== undefined) data[ENTITY_CHIP_MIME] = JSON.stringify({ id: chipId });
  if (text !== undefined) data['text/plain'] = text;
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: (type: string) => data[type] ?? '' },
  });
  target.dispatchEvent(event);
}

/**
 * phase:form-renderer (survey 21 §3): the Angular form renderer in both layouts, with every control,
 * the kind-filtered entity picker, the style picker and inline issues. Runs on a fake API built from
 * the contract types, so the typed client and the Zod parsing run as in the app.
 */
describe('tool form: one descriptor, two layouts', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<ToolFormComponent>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const field = (key: string): HTMLElement => {
    const found = host().querySelector<HTMLElement>(`[data-field="${key}"]`);
    if (found === null) throw new Error(`no field ${key}`);
    return found;
  };
  const settle = (): void => {
    fixture.detectChanges();
    fixture.detectChanges();
  };
  const submit = (): void => {
    host()
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    settle();
  };

  beforeEach(() => {
    api = new FakeApi();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideFakeApi(api)] });
    fixture = TestBed.createComponent(ToolFormComponent);
    fixture.componentRef.setInput('detail', COLD_OPEN);
    fixture.componentRef.setInput('entities', PROJECT_ENTITIES);
  });

  it('draws the form fields in declared order, each with the control the descriptor names', () => {
    settle();
    const fields = Array.from(host().querySelectorAll<HTMLElement>('[data-field]'));
    expect(fields.map((element) => element.dataset['field'])).toEqual([
      'person',
      'notes',
      'style',
      'tone',
    ]);
    expect(fields.map((element) => element.dataset['control'])).toEqual([
      'entity-picker',
      'text',
      'style-picker',
      'select',
    ]);
    expect(host().querySelector('[data-layout="node"]')).toBeNull();
  });

  it('draws every control type, each from its own control', () => {
    fixture.componentRef.setInput('detail', EVERY_CONTROL);
    settle();

    const controls = Array.from(host().querySelectorAll<HTMLElement>('[data-field]')).map(
      (element) => element.dataset['control'],
    );
    expect(controls).toEqual([
      'text',
      'textarea',
      'number',
      'slider',
      'select',
      'toggle',
      'entity-picker',
      'style-picker',
    ]);
    expect(host().querySelector('input[name="title"][type="text"]')).not.toBeNull();
    expect(host().querySelector('textarea[name="summary"]')).not.toBeNull();
    expect(host().querySelector('input[name="count"][type="number"]')).not.toBeNull();
    expect(host().querySelector('input[name="weight"][type="range"]')).not.toBeNull();
    expect(host().querySelector('select[name="mood"]')).not.toBeNull();
    const toggle = host().querySelector('[data-field="vivid"] [role="switch"]');
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    expect(host().querySelectorAll('[data-testid="entity-picker"]')).toHaveLength(2);
  });

  it('draws the node body with typed port rows for the entity, text and style fields, and the rest as params', () => {
    fixture.componentRef.setInput('layout', 'node');
    settle();

    expect(host().querySelector('[data-layout="node"]')).not.toBeNull();
    const ports = Array.from(host().querySelectorAll<HTMLElement>('[data-port]'));
    expect(ports.map((port) => [port.dataset['port'], port.dataset['type']])).toEqual([
      ['person', 'entity'],
      ['notes', 'text'],
      ['style', 'style'],
    ]);
    const params = host().querySelector('.params') as HTMLElement;
    expect(
      Array.from(params.querySelectorAll<HTMLElement>('[data-field]')).map(
        (el) => el.dataset['field'],
      ),
    ).toEqual(['tone']);
    expect(host().querySelector('[data-output-port]')?.textContent).toContain('draft');
    expect(host().querySelector('form')).toBeNull();
  });

  it('offers only entities of the fixture kind, and accepts a dropped entity chip', () => {
    settle();
    const options = Array.from(field('person').querySelectorAll<HTMLOptionElement>('option')).map(
      (option) => option.value,
    );
    expect(options).toEqual(['', 'ada-lovelace', 'charles-babbage']);

    dropChip(
      field('person').querySelector('[data-testid="entity-picker"]') as Element,
      'ada-lovelace',
    );
    settle();
    expect(field('person').querySelector('[data-entity-id="ada-lovelace"]')).not.toBeNull();
  });

  it('refuses a dropped entity of another kind, and says what the field takes', () => {
    settle();
    dropChip(
      field('person').querySelector('[data-testid="entity-picker"]') as Element,
      'engine-claim',
    );
    settle();

    expect(field('person').querySelector('[data-entity-id]')).toBeNull();
    expect(field('person').textContent).toContain(
      'engine-claim is a claim. This field takes person.',
    );
  });

  it('sends the arguments to validate, and a valid submit shows them with defaults applied', () => {
    api.reply('POST', VALIDATE, 200, {
      arguments: { person: 'ada-lovelace', tone: 'warm' },
      entities: [{ field: 'person', id: 'ada-lovelace', style: false }],
    });
    settle();
    dropChip(
      field('person').querySelector('[data-testid="entity-picker"]') as Element,
      'ada-lovelace',
    );
    settle();

    submit();

    const sent = api.requests.find((request) => request.path === VALIDATE);
    expect(sent?.method).toBe('POST');
    expect(sent?.body).toEqual({
      mode: 'full',
      arguments: { person: 'ada-lovelace', tone: 'warm' },
    });
    const shown = host().querySelector('[data-testid="validated-arguments"]')?.textContent ?? '';
    expect(JSON.parse(shown)).toEqual({ person: 'ada-lovelace', tone: 'warm' });
    expect(host().querySelector('[data-testid="referenced-entities"]')?.textContent).toContain(
      'ada-lovelace',
    );
  });

  it('shows a missing required field and a wrong enum value as readable inline messages, on their fields', () => {
    const issues: ValidationIssue[] = [
      { path: '/person', message: 'This field is required.' },
      { path: '/tone', message: 'Must be one of: warm, dry, urgent. Received: "loud".' },
    ];
    api.reply('POST', VALIDATE, 422, {
      error: {
        code: 'TOOL_ARGS_INVALID',
        message: 'cold_open: the arguments do not match.',
        details: { issues },
      },
    });
    settle();

    submit();

    expect(field('person').querySelector('[data-issue="person"]')?.textContent).toBe(
      'This field is required.',
    );
    expect(field('tone').querySelector('[data-issue="tone"]')?.textContent).toBe(
      'Must be one of: warm, dry, urgent. Received: "loud".',
    );
    expect(host().querySelector('[data-testid="validated-arguments"]')).toBeNull();
  });

  it('never marks a style field as required, and marks the required person field', () => {
    settle();
    expect(field('style').dataset['required']).toBe('false');
    expect(field('person').dataset['required']).toBe('true');
  });

  it('starts the style picker on the project style profile, and offers only style profiles', () => {
    fixture.componentRef.setInput('styleDefault', 'house-style');
    settle();

    expect(field('style').querySelector('[data-entity-id="house-style"]')).not.toBeNull();
    const options = Array.from(field('style').querySelectorAll<HTMLOptionElement>('option')).map(
      (option) => option.value,
    );
    expect(options).toEqual(['', 'house-style']);
  });
});
