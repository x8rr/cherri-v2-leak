import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		ignores: [
			"node_modules/**",
			"drizzle/**",
			"migration/**",
			"public/assets/js/lib/**",
			"public/scram/**",
			"public/stores/**",
			"public/epoxy/**",
			"public/baremux/**",
			"public/libcurl/**",
		],
	},
	js.configs.recommended,
	{
		files: ["src/**/*.js", "drizzle.config.js"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.node,
				Bun: "readonly",
			},
		},
		rules: {
			"no-unused-vars": "off",
			"no-empty": ["error", { allowEmptyCatch: true }],
		},
	},
	{
		files: ["public/assets/js/cherri*.js"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.browser,
				toast: "readonly",
				ScramjetController: "readonly",
				scramjet: "readonly",
			},
		},
		rules: {
			"no-unused-vars": "off",
			"no-empty": ["error", { allowEmptyCatch: true }],
			"no-undef": "off",
			"no-useless-escape": "off",
		},
	},
]);
