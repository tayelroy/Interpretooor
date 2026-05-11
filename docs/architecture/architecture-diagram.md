# Architecture Diagram

This diagram captures the main Interpretooor flow across the app, backend, and chain.

- The Next.js frontend handles landing pages, editor/workspace screens, and translation/validation views.
- API routes and hooks manage drafts, interpretation, uploads, and validation requests.
- `lib/mdh-utils.ts` and the AI interpreter keep `.mdh` content readable while preserving semantic tags.
- The Irys relayer publishes source and translated content to Arweave.
- Solana Anchor programs store bounty state, escrow, and validation outcomes on-chain.

Use this note as the companion reference for the exported Excalidraw diagram.