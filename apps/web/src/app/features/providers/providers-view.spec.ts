import { ApiError } from '../../shell';
import {
  AUTO_MODEL_PROBLEM,
  draftOf,
  draftProblems,
  hintsFor,
  HINT_TEXT,
  keyText,
  messageOf,
  modelLabel,
  sameDraft,
} from './providers-view';
import { OLLAMA, OPENROUTER } from './providers.fixtures';

/**
 * The pure rules the settings UI reads from the contract (survey 19 §3, phase:settings-ui). The
 * panel tests check the same rules through the screen.
 */
describe('providers view rules', () => {
  it('starts an edit from the saved settings, without the id or any key field', () => {
    const draft = draftOf({ ...OLLAMA, keySet: true, keyHint: '••••1234' });

    expect(draft).toEqual({
      kind: 'openai-compatible',
      baseURL: 'http://host.docker.internal:11434/v1',
      model: '',
      temperature: 0.7,
      contextSize: 64000,
      maxTokens: 4096,
      timeout: 120000,
      retries: 2,
    });
    expect(sameDraft(draft, draftOf(OLLAMA))).toBe(true);
  });

  it('accepts a draft the contract accepts, and names each field the contract refuses', () => {
    expect(draftProblems(draftOf(OPENROUTER))).toEqual([]);

    const problems = draftProblems({
      ...draftOf(OPENROUTER),
      baseURL: 'openrouter.ai/api/v1',
      timeout: -1,
      temperature: Number.NaN,
    });

    expect(problems.some((problem) => problem.startsWith('Base URL:'))).toBe(true);
    expect(problems.some((problem) => problem.startsWith('Timeout:'))).toBe(true);
    expect(problems.some((problem) => problem.startsWith('Temperature:'))).toBe(true);
  });

  it('refuses auto as a model name, and shows auto for an empty model without saving it', () => {
    expect(draftProblems({ ...draftOf(OLLAMA), model: 'auto' })).toEqual([AUTO_MODEL_PROBLEM]);
    expect(modelLabel('')).toBe('auto');
    expect(modelLabel('local-model')).toBe('local-model');
  });

  it('shows the Ollama context-length hint for the preset and for any Ollama port', () => {
    expect(hintsFor(OLLAMA.baseURL, 'unknown')).toEqual(['context-length']);
    expect(hintsFor('http://192.168.1.20:11434/v1', 'listed')).toEqual(['context-length']);
    expect(HINT_TEXT['context-length']).toContain('OLLAMA_CONTEXT_LENGTH');
    expect(HINT_TEXT['context-length']).toContain('64000');
  });

  it('adds the pull-a-model hint only for an Ollama provider whose list is empty', () => {
    expect(hintsFor(OLLAMA.baseURL, 'empty')).toEqual(['context-length', 'pull-model']);
    expect(hintsFor(OLLAMA.baseURL, 'listed')).toEqual(['context-length']);
    expect(hintsFor(OLLAMA.baseURL, 'unknown')).toEqual(['context-length']);
    expect(hintsFor(OPENROUTER.baseURL, 'empty')).toEqual([]);
  });

  it('shows the LM Studio hint for the LM Studio preset', () => {
    expect(hintsFor('http://host.docker.internal:1234/v1', 'listed')).toEqual([
      'start-local-server',
    ]);
  });

  it('shows the masked hint for a set key, and only the word No key for a keyless provider', () => {
    expect(keyText({ keySet: true, keyHint: '••••1234' })).toBe('Key ••••1234');
    expect(keyText({ keySet: false, keyHint: null })).toBe('No key');
  });

  it('keeps the server text of a typed API error, and gives a fixed text for anything else', () => {
    expect(messageOf(new ApiError(409, 'PROVIDER_IN_USE', 'Pick another default.'))).toBe(
      'Pick another default.',
    );
    expect(messageOf(new Error('boom'))).toBe('Something went wrong. Try again.');
  });
});
