# Spec: `lib/mdh-utils.ts`

## Purpose

Single source of truth for reading and writing `.mdh` files. Pure TypeScript, no external parsing libraries. All platform code that handles `.mdh` content must go through these functions — never parse tags inline in a component or hook.

---

## The `.mdh` Tag Syntax (Canonical Reference)

```
<key=value> phrase </key>
```

- The opening tag is `<key=value>` — a key, literal `=`, and a value, all inside angle brackets.
- The closing tag is `</key>` — a forward slash then the same key.
- Key and value are lowercase, hyphen-separated strings. No spaces inside the tag.
- The phrase between the tags is the annotated text. It may contain spaces, punctuation, and Markdown formatting.
- Tags may not nest.
- Multiple tags may appear anywhere in the document, in any order.

**Valid:**
```
I am <tone=sarcastic> very happy </tone> about this.
He bought <culture=web3-degen> ape jpegs </culture> on a whim.
```

**Invalid (do not attempt to handle):**
```
<tone=sarcastic><intent=persuade> nested </intent></tone>   ← nested tags
<tone = sarcastic> spaced equals </tone>                    ← spaces around =
```

There is **no frontmatter**. There are **no `---` delimiters**. The file is otherwise standard Markdown.

---

## Interfaces to Export

```typescript
export interface SemanticTag {
  key: string;        // e.g. 'tone', 'intent', 'culture', 'idiom'
  value: string;      // e.g. 'sarcastic', 'persuade', 'web3-degen'
  phrase: string;     // The wrapped text content, trimmed
  startIndex: number; // Character index of '<' of the opening tag in rawContent
  endIndex: number;   // Character index of '>' of the closing tag in rawContent
}

export interface ParsedMdh {
  tags: SemanticTag[];  // All extracted annotations, in document order
  plainText: string;    // rawContent with all tags (opening + closing) removed, whitespace normalised
  rawContent: string;   // Original unmodified input string
}
```

---

## Function 1: `parseMdh`

### Signature

```typescript
export function parseMdh(rawContent: string): ParsedMdh
```

### Regex

Use a single global regex to locate all tag occurrences:

```
/<([a-z][a-z0-9-]*)=([a-z0-9][a-z0-9-]*?)>\s*([\s\S]*?)\s*<\/\1>/g
```

- Group 1: key
- Group 2: value
- Group 3: phrase (trimmed by the `\s*` around the capture group)

### Behavior

1. Run the regex against `rawContent` with the global flag.
2. For each match, record:
   - `key` — Group 1
   - `value` — Group 2
   - `phrase` — Group 3, trimmed
   - `startIndex` — `match.index`
   - `endIndex` — `match.index + match[0].length - 1`
3. Collect all matches into `tags[]` in document order.
4. Produce `plainText` by replacing every full match (the entire `<key=value> phrase </key>` string) with just the trimmed phrase, then collapsing any double spaces and trimming the result.
5. Return `{ tags, plainText, rawContent }`.

### Error handling

- If `rawContent` is not a string, throw `'parseMdh: input must be a string'`.
- An empty string is valid — return `{ tags: [], plainText: '', rawContent: '' }`.
- Malformed or unclosed tags are silently ignored (the regex simply won't match them). Do not throw on malformed input.

---

## Function 2: `exportToMdh`

### Signature

```typescript
export function exportToMdh(content: string, filename: string): void
```

### Behavior

1. Validate: throw `'exportToMdh: content must be a non-empty string'` if `content` is empty.
2. Validate: throw `'exportToMdh: filename must be a non-empty string'` if `filename` is empty.
3. Ensure `filename` ends with `.mdh`. If it doesn't, append `.mdh`.
4. Create a `Blob` from `content` with `type: 'text/markdown'`.
5. Programmatically create an `<a>` element:
   - `href` = `URL.createObjectURL(blob)`
   - `download` = sanitised filename
6. Append to `document.body`, call `.click()`, then remove the element and call `URL.revokeObjectURL`.

---

## Function 3: `stripTags`

### Signature

```typescript
export function stripTags(rawContent: string): string
```

### Behavior

Convenience wrapper. Returns `parseMdh(rawContent).plainText`. Use for word count, diff views, and any context where the raw tag syntax should not be visible.

---

## Constraints

- Pure TypeScript/JavaScript only. No `gray-matter`, `js-yaml`, `unified`, `remark`, or any external parsing library.
- `parseMdh` and `stripTags` must be safe to call in a Node.js/server context (no DOM access).
- `exportToMdh` is browser-only (uses `document` and `URL.createObjectURL`). This is expected and acceptable.
- All error message strings must start with the function name as a prefix (e.g. `'parseMdh: ...'`, `'exportToMdh: ...'`) for consistent upstream catch handling.

---

## Test Coverage Required

Create `lib/__tests__/mdh-utils.test.ts` covering all cases below.

| # | Test case | Expected result |
|---|---|---|
| 1 | Single tag, well-formed | `tags` has 1 entry with correct key, value, phrase, indices |
| 2 | Multiple tags in one document | `tags` has correct count, in document order |
| 3 | `plainText` output | Tags removed, phrase text preserved, no double spaces |
| 4 | Unknown/custom key (e.g. `<vibe=chaotic>`) | Parsed correctly — no key allowlist enforced |
| 5 | Tag with hyphenated value (`culture=web3-degen`) | `value` is `'web3-degen'` |
| 6 | Empty string input | Returns `{ tags: [], plainText: '', rawContent: '' }` |
| 7 | Content with no tags | `tags` is `[]`, `plainText` equals trimmed input |
| 8 | Malformed tag (no closing tag) | Silently ignored, no throw |
| 9 | `startIndex` / `endIndex` accuracy | Re-slicing `rawContent` by indices returns the full match string |
| 10 | `exportToMdh` empty content | Throws with correct prefix message |
| 11 | `exportToMdh` filename without `.mdh` | Appends `.mdh` to filename |
| 12 | `stripTags` roundtrip | Output equals `parseMdh(input).plainText` |
| 13 | Roundtrip integrity | `parseMdh(rawContent).rawContent === rawContent` |

---

## Workspace UI Notes (for the editor component — not implemented here)

The React editor that consumes `ParsedMdh` should:

- Render the raw `.mdh` text as editable content.
- Use `tags[].startIndex` / `endIndex` to apply highlight spans over annotated phrases.
- Show a tooltip or inline badge on hover displaying `key=value` (e.g. `tone=sarcastic`).
- Use distinct highlight colors per key (e.g. `tone` = amber, `culture` = teal, `intent` = purple, `idiom` = coral) — reference the platform's Tailwind color tokens.
- Re-run `parseMdh` on every editor change (debounced, via `useDraftPersistence.ts`).

This visual layer is the responsibility of the Workspace UI component, not `mdh-utils.ts`.