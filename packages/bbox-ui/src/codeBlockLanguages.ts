import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import type { Extension } from "@codemirror/state";

import type { CodeBlockLanguage } from "./codeBlock.layout";

/**
 * `CodeBlockLanguage` → the CodeMirror parser that highlights it. Kept out
 * of `codeBlock.layout.ts` so that file stays dependency-free (pure
 * numbers and names), and out of `codeBlock.tsx` so a host that only ever
 * needs the mapping can import it without React. A total Record: a
 * language added to `CODE_BLOCK_LANGUAGES` without a parser here is a
 * compile error.
 */
const LANGUAGE_EXTENSIONS: Record<CodeBlockLanguage, () => Extension> = {
  plaintext: () => [],
  python: () => python(),
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  json: () => json(),
  html: () => html(),
  css: () => css(),
  sql: () => sql(),
  markdown: () => markdown(),
};

export function codeBlockLanguageExtension(language: CodeBlockLanguage): Extension {
  return (LANGUAGE_EXTENSIONS[language] ?? LANGUAGE_EXTENSIONS.plaintext)();
}
