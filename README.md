# BookLender Studio

Next.js App Router frontend ported from the supplied BookLender Studio artifact. Each module has its own route and React screen. The artifact's colors, type, spacing, SVG artwork, sample content, and responsive layouts are retained.

## Run

Use Node.js 24 or newer.

```bash
npm ci
npm run dev
```

Open http://localhost:3000.

## Routes

| Page | URL |
| --- | --- |
| Today | `/` |
| Board | `/board` |
| Ideas | `/ideas` |
| Review | `/review` |
| Schedule | `/schedule` |
| Results | `/results` |
| Sources & events | `/sources` |
| Brand & styles | `/brand` |
| AI spend | `/spend` |
| Team & roles | `/team` |
| Logs | `/logs` |
| Help | `/help` |

## Frontend and API boundary

Screens live in `src/features/studio/pages`; the shared shell, chart, artwork and controls live in `components`. The original sample data is mapped into `fixtures/studio.json`. Six CSS files in `styles` mirror the artifact's visual sections. `StudioProvider` loads the typed snapshot and sends actions through `studioApi` using `fetch`.

The default API base is `/api/studio`. Next Route Handlers in `src/app/api/studio/[resource]/route.ts` serve demo data from `src/features/studio/server/store.ts`. This development adapter keeps data in server memory and resets when the server restarts or recompiles.

To point the frontend at an external backend, set `NEXT_PUBLIC_STUDIO_API_BASE_URL` to its Studio API base URL. That backend must implement the JSON resources and commands described in [docs/frontend-api-contract.md](docs/frontend-api-contract.md). For production, a same-origin proxy is preferable when authentication uses HTTP-only cookies.

No MySQL, AI provider, publishing service, or authentication credentials are used in the browser. The future backend must enforce approval, spending limits, permissions, catalogue facts, generation, and publishing. The local adapter only demonstrates the interface and interactions.

The backend foundation is in [backend/README.md](backend/README.md). It is a separate FastAPI service and is not yet wired to these demo pages.
