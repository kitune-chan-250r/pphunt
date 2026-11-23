# React + TypeScript + Vite

## Feature structure

- `src/feature/player-search/` contains the player-search pages and UI components.
- `src/feature/scoresaber/` contains ScoreSaber data hooks and response types used by the search UI.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## E2E tests (Playwright)

Playwright tests mock ScoreSaber API responses, so they do not depend on the live
service. The default suite covers desktop Chromium, Pixel 7 emulation, desktop
WebKit (Safari), and iPhone 13 emulation (mobile Safari). Run these commands
inside the Linux devcontainer:

```bash
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

Run only the mobile or Safari projects with:

```bash
npm run test:e2e:mobile
npm run test:e2e:safari
```

Playwright's WebKit project provides Safari-engine coverage; it is not Apple's
Safari application itself.

The first command installs the required browser binaries and Linux dependencies
in the container. The test runner starts the Vite development server
automatically on port 5173.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
