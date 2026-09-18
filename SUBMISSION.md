# Submission

## Video walkthrough

Video: not recorded yet.

## How to run it

`npm install && npm run dev` starts the Vite client and bundled mock API.

## Time spent

Not measured yet.

## Baseline defects found

| #   | Defect                                                     | Where                                 | Status                                                                             |
| --- | ---------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Bulk updates exceeded the 50-id API cap                    | `src/App.tsx`                         | Fixed: chunked requests                                                            |
| 2   | Search races allowed stale responses to win                | `src/features/assets/useAssets.ts`    | Fixed: 280ms debounce, aborts, query-scoped state                                  |
| 3   | Reads and writes had no retry or Retry-After handling      | `src/api/client.ts`                   | Fixed: four attempts, exponential jitter, Retry-After                              |
| 4   | API errors were flattened into raw strings                 | `src/api/client.ts`                   | Fixed: structured `ApiError`                                                       |
| 5   | Only the first page was loaded                             | `src/features/assets/useAssets.ts`    | Fixed: cursor pagination                                                           |
| 6   | All loaded cards rendered and selection touched every card | `src/features/assets/AssetGrid.tsx`   | Fixed: bounded window and memoized cards                                           |
| 7   | Filters were not shareable or reloadable                   | `src/App.tsx`                         | Fixed: URL query state with replaceState                                           |
| 8   | Grid keyboard semantics were absent                        | `src/features/assets/AssetGrid.tsx`   | Fixed: roving tabindex, arrows, Enter, Space, Shift range, labels                  |
| 9   | Missing thumbnails showed broken image behavior            | `src/features/assets/AssetGrid.tsx`   | Fixed: stable placeholder and lazy loading                                         |
| 10  | Bulk partial results were treated as all-or-nothing        | `src/App.tsx`                         | Fixed: optimistic updates, per-item rollback, exact failure list, retryable subset |
| 11  | Detail version conflicts were unexplained                  | `src/features/assets/AssetDetail.tsx` | Fixed: actionable conflict message                                                 |

## Key decisions

**Data fetching and caching:** A small local hook owns debouncing, AbortController cancellation, cursor pages, offline state, and a promise cache for identical requests. A larger data library was not added because the required behavior fits this focused boundary.

**Stale response handling:** The query changes after 280ms of quiet typing. A new query aborts the previous request, and only the current controller may commit results.

**Virtualization approach:** The asset grid uses explicit positioned rows with a stable 282px row budget and renders only nearby rows. Cards are memoized and movement callbacks are stable so selection changes do not needlessly render unrelated cards.

**Optimistic updates and rollback:** Selected loaded assets change status immediately. Each bulk result replaces successful assets with the server asset and removes only failed optimistic overrides, exposing the original asset state. Retry is offered only for temporary `conflict` failures, never for `legal_hold`.

**Retry and backoff policy:** Four total attempts are allowed for network errors and HTTP 429/500/503. Retry-After wins when present; otherwise exponential backoff with jitter is used. 400/409/422 errors are never retried.

**State placement and URL sync:** Search, status, kind, and sort live in URL parameters. Selection and detail state are transient local workspace state.

## Performance

| Metric                                        | Before                       | After                                                               | How measured                                                               |
| --------------------------------------------- | ---------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Rendered DOM nodes at 5,000 rows loaded       | Not measured                 | 6 visible cards in browser smoke test                               | Playwright snapshot while 100 assets loaded; full 5,000 run still required |
| Cards re-rendered when toggling one selection | All loaded cards in baseline | Memoized cards isolate unchanged cards                              | Code inspection; React Profiler still required                             |
| Longest task during sustained scroll          | Not measured                 | Not measured                                                        | Browser profiling still required                                           |
| Requests while typing a 6-character query     | Up to 6                      | One after 280ms quiet time, plus retry traffic if transient failure | Code policy                                                                |
| Production bundle, gzipped                    | 48 kB stated in brief        | 51.78 kB JS gzip                                                    | `npm run build`, Vite 5.4.21                                               |

## Accessibility

The grid exposes `role="grid"` and `gridcell` selection state with a single roving tab stop. Arrow keys move focus, Shift+arrows extend selection, Enter opens detail, Space toggles selection, and click/Shift+click selects ranges. Escape closes detail; checkboxes have names and thumbnails are decorative. Browser smoke testing covered ArrowRight, Escape, click/Shift+click, focusable cards, live result counts, and bounded rendering. A screen reader was not run.

## Interface decisions

The interface uses a quiet editorial palette with teal as the action color, warm status progression, and restrained borders so a reviewer can scan dense results. Georgia supplies a distinct workbench voice while Arial is reserved for compact metadata. Loading, offline, empty, error, and partial-failure states use different surfaces and actionable copy. The responsive grid keeps the detail panel usable in narrow windows, and status labels remain textual rather than relying on color alone.

**Visual system:** Tokens live at the top of `src/styles.css`; spacing, borders, focus, and responsive behavior use those shared decisions.

**Status treatment:** Draft, In review, Approved, and Archived use labels plus a progression from neutral to warm review to confirmed teal to muted archive.

**Contrast:** Colors were selected for dark text on pale surfaces; formal contrast tooling has not yet been run.

**Copy:** Raw status strings are rewritten into human guidance. Bulk summaries include affected ids and failure codes where available.

## Trade-offs and cuts

SSE reconciliation and automated tests were not completed. With another day I would add focused tests around stale responses, retry classification, and rollback, then run a screen reader and React Profiler session.

## Critique of the API

The API makes a cursor opaque but gives no cache key or server timestamp, and bulk conflicts are returned only as per-item codes. The client therefore has to maintain query identity, bounded concurrency behavior, and user-facing error translation itself. A typed error envelope with retry metadata and a bulk operation id would make recovery more robust.

## Anything you would like us to look at

The most important implementation boundary is `useAssets`: it is where debounce, cancellation, cursor identity, offline state, and de-duplication meet. The remaining keyboard and measurement gaps are intentionally called out rather than claimed as complete.
