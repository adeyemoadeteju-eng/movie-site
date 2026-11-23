# AniOrbit UI milestones

This roadmap keeps the site's own identity while using the broad visual direction requested for 1shows.org as inspiration: a dark, low-noise interface, clear navigation, prominent artwork, and simple browsing shelves. It is not intended to reproduce another site's exact layout or branding.

## Milestone 1 — Smooth foundations
- Reduce unnecessary whitespace in the landing/search area.
- Establish consistent spacing and typography across the main catalogue.
- Keep motion restrained, honor reduced-motion preferences, and avoid expensive effects on Smart TVs.
- Make below-the-fold catalogue sections cheaper for the browser to render.

**Acceptance:** no horizontal page overflow at mobile widths; reduced-motion and TV modes avoid animated poster effects.

## Milestone 2 — Browse like a streaming catalogue
- Use swipeable, snap-aligned poster shelves for popular, recently updated, and personal-library sections.
- Add clear previous/next controls that also work with keyboard and TV remotes.
- Keep search and filtered results in a normal grid for quick scanning.
- Keep poster dimensions and title metadata consistent.

**Acceptance:** shelves scroll by touch and buttons; search results remain a grid; no page-level horizontal overflow.

## Milestone 3 — Anime detail pages
- Clarify title, release information, genres, synopsis, and season relationships.
- Make episode lists easier to scan and navigate.
- Standardize loading, empty, and error states.
- Keep artwork and detail layouts responsive.

**Acceptance:** title and episode navigation remain usable on desktop, mobile, and TV layouts.

## Milestone 4 — Watch experience
- Simplify player-adjacent controls and server selection.
- Improve focus order, remote navigation, and playback recovery feedback.
- Keep the player as the visual focus and remove unnecessary competing panels.
- Preserve performance-first settings for Smart TVs and lower-powered devices.

**Acceptance:** core playback controls are keyboard/remote reachable; recovery states are understandable; player layout adapts cleanly to 16:9 screens.

## Milestone 5 — 1Shows-inspired final finish
- Bring the full site together with a polished dark streaming-catalogue aesthetic.
- Use cinematic featured artwork, compact navigation, calm typography, and clean poster shelves.
- Unify buttons, badges, cards, spacing, and transition timing across every page.
- Finish mobile and Samsung TV layouts so the same design language carries across devices.

**Acceptance:** all primary routes share one coherent visual system; no page feels like a separate design; the site remains responsive and motion-sensitive.

## Delivery notes
The first implementation slice covers the landing-area spacing, homepage poster shelves, shelf controls, and rendering/motion optimizations. Later milestones are tracked separately so the detail and playback layouts can be polished without destabilizing existing playback behaviour.
