import prettier from 'eslint-config-prettier';

export default [
  // Browser extension files (popup + background)
  {
    files: ['popup/**/*.js', 'background.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        chrome: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['error', 'always'],
      'no-throw-literal': 'error',
      'no-multi-spaces': 'warn',
      'no-trailing-spaces': 'warn',
    },
  },
  // Node.js files (tests, scripts, configs)
  {
    files: ['tests/**/*.js', 'generate_icons.js', '*.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node.js globals
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        __dirname: 'readonly',
        // Chrome mock (tests)
        chrome: 'readonly',
        globalThis: 'readonly',
        // DOM globals (provided by happy-dom in tests)
        document: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['error', 'always'],
      'no-throw-literal': 'error',
      'no-multi-spaces': 'warn',
      'no-trailing-spaces': 'warn',
    },
  },
  // Ignore node_modules
  {
    ignores: ['node_modules/**'],
  },
  // Disable ESLint rules that conflict with Prettier
  prettier,
];
