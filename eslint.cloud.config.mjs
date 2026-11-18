// n8n Cloud / verification rules (@n8n/eslint-plugin-community-nodes, the same
// rule set @n8n/scan-community-package runs): no runtime dependencies, no
// restricted globals, credential tests, icons, usableAsTool...
import tsParser from '@typescript-eslint/parser';
import { configs } from '@n8n/eslint-plugin-community-nodes';
import n8nNodesBase from 'eslint-plugin-n8n-nodes-base';

export default [
	{ ignores: ['dist/**', 'node_modules/**', 'test/**', '*.js', '*.mjs'] },
	{
		files: ['nodes/**/*.ts', 'credentials/**/*.ts'],
		languageOptions: { parser: tsParser, parserOptions: { project: './tsconfig.json' } },
		...configs.recommended,
		// Loaded only so the inline disables for its rules (run by .eslintrc.js) resolve.
		plugins: { ...configs.recommended.plugins, 'n8n-nodes-base': n8nNodesBase },
	},
];
