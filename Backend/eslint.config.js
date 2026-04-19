import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
	{
		ignores: ["dist", "node_modules"],
	},

	js.configs.recommended,
	...tseslint.configs.recommended,

	{
		files: ["**/*.ts"],
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: "module",
			globals: {
				...globals.node,
			},
		},

		rules: {
			"no-console": "off",

			"no-unused-vars": "off",

			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_" },
			],

			"@typescript-eslint/no-explicit-any": "off",
		},
	},

	{
		files: ["tests/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.jest,
			},
		},
	},
];
