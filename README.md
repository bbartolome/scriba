# Scriba

A visual writing harness that helps one author turn raw material into a publishable book with an LLM agent, narrative tools and a node canvas.

## Development

- Use Node 24.21.0, pinned in `.nvmrc`.
- `npm ci` installs from the lockfile.
- `npm run dev` is a placeholder until the real dev servers land.
- `npm run lint` runs ESLint and the Prettier check.
- `npm test` runs tests in every workspace.
- `npm run build` builds every workspace.
- `npm run e2e` runs the Playwright journey against the dev stack. Install its browser once with `npm run install:browsers -w @bbartolome/scriba-e2e`.
- `npm run mock:openai` starts the mock OpenAI server on port 4010 for manual demos.
