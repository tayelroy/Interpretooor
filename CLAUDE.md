# Interpretooor — AI Agent Context

## Project Overview

A Web3 decentralized translation bounty platform. Writers publish articles with Semantic Context Markup (SCM), AI translates them with cultural nuance, and human validators attest quality on-chain. Payments are automated via Solana smart contracts.

**Core Rule:** Do NOT assume a centralized database (Postgres/MongoDB) for content.
- **State** lives on Solana (via Anchor PDAs — `BountyAccount`).
- **Content** lives on Arweave (via Irys relayer).
- **Job metadata** (Bounty ID, Arweave TxID, Target Language) lives in Solana `BountyAccount` state and frontend routing context. It is NEVER embedded inside the `.mdh` file itself.

---

## 1. The `.mdh` File Standard

A `.mdh` (Markdown + Semantics) file is **standard Markdown** with inline semantic markup tags. It has no frontmatter, no YAML, no `---` delimiters. The file must be readable as plain text at all times — the tags annotate specific phrases without breaking the prose.

### 1a. Tag Syntax

Tags wrap a phrase with an opening tag containing a key-value pair and a closing tag sharing the same key:

```
<key=value> phrase </key>
```

**Real examples:**

```
I am <tone=sarcastic> very happy </tone> about that outcome.

He invested his savings in <culture=web3-degen> ape jpegs </culture> and called it a portfolio.

Please <intent=persuade> join us before the window closes </intent>.

It was, as they say, <idiom=heavy-rain> raining cats and dogs </idiom>.
```

### 1b. Supported Semantic Keys (non-exhaustive)

| Key | Example values | Purpose |
|---|---|---|
| `tone` | `sarcastic`, `formal`, `casual`, `urgent` | Emotional register of the wrapped phrase |
| `intent` | `persuade`, `educate`, `warn`, `celebrate` | Author's communicative goal |
| `culture` | `web3-degen`, `english-internet-native`, `southern-us` | Cultural context or in-group reference |
| `idiom` | `heavy-rain`, `good-luck` | Flags a phrase that must not be translated literally |

Any key is valid. The parser must handle unknown keys gracefully.

### 1c. What `.mdh` Files Do NOT Contain

- No `---` YAML frontmatter blocks.
- No routing metadata (Bounty ID, Arweave TX, Target Language, Status).
- No JSON, no structured data outside the tag syntax above.

If you find yourself adding frontmatter to a `.mdh` file or parser — stop. That data belongs in `BountyAccount` on Solana.

### 1d. Why This Design

- **Readable at rest:** A `.mdh` file opened in any Markdown editor renders cleanly.
- **Phrase-level precision:** Semantic context is attached exactly where it matters, not as a document-wide declaration.
- **AI prompt fidelity:** Inline tags tell the LLM *which specific phrase* needs cultural adaptation.
- **Clean separation of concerns:** Job routing state lives in Solana. Linguistic intent lives in the file. They never bleed into each other.

---

## 2. `lib/mdh-utils.ts` — Handling Rules

**Always** use the utility functions in `lib/mdh-utils.ts` to read/write `.mdh` content. Never parse inline tags directly inside a component or hook.

Key exports:
- `parseMdh(rawContent: string): ParsedMdh` — extracts all semantic tags and returns structured data alongside the stripped plain-text body.
- `exportToMdh(content: string, filename: string): void` — triggers a browser download of the raw `.mdh` string.
- `stripTags(rawContent: string): string` — returns plain text with all semantic tags removed (used for word count, diff views).

Do **not** use `gray-matter`, `unified`, `remark`, or any heavy markdown parser. Regex is sufficient and correct for this tag syntax.

---

## 3. Web3 & Infrastructure

| Layer | Tool | Notes |
|---|---|---|
| Blockchain | Solana + Anchor (Rust) | 48-hr Optimistic Escrow pattern |
| Storage | Arweave via Irys | Server-side relayer sponsors gas for users |
| Wallets | `@solana/wallet-adapter` + Privy shim | Shim in `lib/solana/privy-adapter.ts` |
| Data Fetching | Helius DAS API | Queries MplCoreAsset NFTs → Arweave TX IDs |
| Payments | USDC SPL Token | Split: 5% protocol / 15% AI node / 80% validator |
| Cross-chain Tips | Circle CCTP | EVM reader tips → settle natively on Solana |
| Attestations | Sign Protocol | Validator signs payload hash; stored on-chain |

---

## 4. Key Interfaces

### `SemanticTag`

```typescript
export interface SemanticTag {
  key: string;        // e.g. 'tone', 'intent', 'culture', 'idiom'
  value: string;      // e.g. 'sarcastic', 'persuade', 'web3-degen'
  phrase: string;     // The wrapped text content
  startIndex: number; // Character index of opening tag start in rawContent
  endIndex: number;   // Character index of closing tag end in rawContent
}
```

### `ParsedMdh`

```typescript
export interface ParsedMdh {
  tags: SemanticTag[];  // All extracted semantic annotations, in document order
  plainText: string;    // Body with all tags stripped — pure readable prose
  rawContent: string;   // Original unmodified string (preserve for round-trips)
}
```

### `BountyAccount` (Solana state — reference only, not defined in mdh-utils)

```typescript
interface BountyAccount {
  bountyId: string;
  originalTxId: string;       // Arweave TX of the source .mdh file
  targetLanguage: string;     // BCP-47 e.g. 'zh-TW', 'es-MX'
  status: 'Open' | 'Pending' | 'Verified' | 'Rejected';
  authorPubkey: PublicKey;
  validatorPubkey: PublicKey | null;
  escrowAmount: number;       // in USDC lamports
}
```

---

## 5. Architecture Patterns

- **UI components** must be decoupled from heavy state/side-effects.
  - `useDraftPersistence.ts` — localStorage hydration + debouncing, kept out of Editor.
- **Pure utilities** in `lib/` — isolated, testable, no side effects.
  - `lib/mdh-utils.ts` — all `.mdh` parsing and export logic.
  - `lib/ai/gemini-interpreter.ts` — consumes `ParsedMdh` to build the LLM prompt; uses `tags` array to inject phrase-level context.
- **Blockchain reads/writes** in custom hooks only.
  - `useBounty.ts`, `useMyArticles.ts`

### How `ParsedMdh` flows into the AI prompt

`gemini-interpreter.ts` assembles `ParsedMdh` into a structured LLM system prompt:

```
Translate the following text to [targetLanguage from BountyAccount].

Phrase-level semantic context:
- "very happy" → tone=sarcastic. Do not translate as genuinely positive.
- "ape jpegs" → culture=web3-degen. Find equivalent in-group slang in target culture; never translate literally.
- "join us before the window closes" → intent=persuade. Preserve urgency and emotional pull.

Source text:
[plainText from ParsedMdh]
```

---

## 6. Solana Program Instructions

```
initialize_job(ctx, content_hash, target_lang)
submit_translation(ctx, job_id, translation_hash)
approve_translation(ctx, job_id)
```

`JobState` PDA stores: job status, content hash, translation hash, author pubkey, validator pubkey.

---

## 7. Git Conventions

- Atomic commits with conventional prefixes: `feat:`, `refactor:`, `chore:`, `docs:`
- Separate UI, smart contract, and backend/infra into distinct commits even on the same branch.

---

## 8. MVP Scope Guardrails

- Max **2 language pairs** for the demo.
- **1 validator signature** = Verified. No staking, no slashing.
- World ID = stretch goal only.
- Verifiable AI is **simulated**: hash (prompt + output), publish hash to Solana.
- Validator bootstrapping: demo uses two browser profiles playing both roles.