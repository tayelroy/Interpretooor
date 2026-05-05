# Interpretooor

## Project Overview

Interpretooor is an experimental interpreter tooling project focused on providing a lightweight, extensible environment for parsing, executing, and exploring small languages and code snippets. This README summarizes goals, features, architecture, usage, and next steps.

## Goals

- Provide a minimal interpreter platform for education and rapid prototyping.
- Make language plugins easy to add and test.
- Offer a reproducible development environment for experiments and demos.

## Key Features (planned)

- Pluggable frontends/parsers for multiple toy languages
- REPL and batch execution modes
- Stepper/tracing for debugging and educational walkthroughs
- Small standard library for I/O and common utilities
- Test harness for interpreter specs and example programs

## Status

- Prototype: core scaffolding present. (Update with PRD-derived milestones.)

## Installation

Requirements: Python 3.10+ (or specify your preferred runtime).

Quick start (example using Python virtualenv):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt  # if this repo adds one
# Run interpreter (example placeholder)
python -m interpretooor.main
```

If you prefer Node/JS or another runtime, replace the steps above accordingly.

## Usage

- REPL mode: `python -m interpretooor.repl` (placeholder — update to real module)
- Run a file: `python -m interpretooor run examples/hello.foo`
- Run tests: `pytest tests/` (if tests are present)

Replace commands with the concrete CLI once the implementation exposes them.

## Example

Here is a simple example program (toy language):

```text
print("Hello from Interpretooor")
```

Run it with the interpreter once the language plugin is available.

## Architecture Overview

- `parser/` — language parsers (one parser per language)
- `core/` — interpreter runtime, evaluator, environment
- `cli/` — command-line interface and REPL
- `tests/` — unit and integration tests for language behaviour

The runtime separates parsing, AST transformation, and evaluation to make testing and instrumentation straightforward.

## File Layout (expected)

- `Interpretooor/` — top-level project folder (this README lives here)
- `examples/` — example programs
- `languages/` — pluggable language implementations
- `docs/` — design docs and PRD (place your PRD here as `PRD.md`)

## Contributing

- Create an issue describing the feature or bug.
- Send a focused PR with tests and documentation.
- Follow the coding style used in the repository.

## PRD Summary (extracted)

Source: [Interpretooor/PRD.md](Interpretooor/PRD.md)

High-level: Interpretooor ("The Verifiable, Nuance-Aware Translation Protocol") is a hackathon MVP that turns an authored markdown document with Semantic Context Markup (SCM) into verified, culturally-accurate translations with on-chain attestations and micro-payments.

Key points:

- **Target users:** Native-language writers, bilingual cultural validators, global readers, and integrators/developers.
- **Core vision:** Publish once; generate verified, culturally-accurate translations backed by on-chain proofs and automated micropayments.
- **MVP goals:** Editor plugin (Obsidian/web), LLM-driven translation with a JSON reasoning trace, Solana Devnet Anchor program for job escrow + attestations, and a validator UX that triggers payment splitting.
- **SCM (markup):** Hybrid Markdown + XML-like tags, e.g., `<idiom origin="..." meaning="...">`, `<tone level="formal|casual">`, and `<intent ...>`; backend receives `.mdh` payload and writer public key.
- **Verification model:** LLM produces `translation + trace + hash`; a validator signs the hash; the Solana program stores the hash and splits `1 USDC` according to the specified reward split (validator, AI, protocol).
- **Success criteria (demo):** SCM-guided output is demonstrably better than baseline MT; end-to-end translation + minting under ~15s; reliable payment splitting on Solana Devnet.
- **Tech stack:** Editor (Obsidian plugin / Next.js), Backend (Node.js + LLM API), Blockchain (Solana, Anchor, SPL USDC), Wallets (Phantom), optional Circle CCTP for cross-chain tips.
- **Roadmap / trade-offs:** MVP uses centralized LLM and off-chain storage (hash on-chain). Post-hackathon plans include World ID for validator uniqueness, decentralized storage (Arweave), and decentralized AI inference in later versions.


## Roadmap

1. Stabilize core evaluator and REPL
2. Add one language plugin with comprehensive tests
3. Add tracing/stepper UI or CLI mode
4. Document PRD-derived acceptance tests