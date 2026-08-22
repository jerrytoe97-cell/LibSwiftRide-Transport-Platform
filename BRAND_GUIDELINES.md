# LibSwiftRide Brand Guidelines

## Brand foundation

LibSwiftRide’s visual identity is grounded in safe, dependable, locally relevant mobility for Liberia. Interfaces should feel confident and operationally clear rather than ornamental.

The official logo is the source of truth. Pixel analysis of the approved artwork established the two core brand colours:

| Token | Value | Primary use |
| --- | --- | --- |
| `brand.primary` | `#0C2454` | Navigation, primary actions, major surfaces, headings, and footer |
| `brand.secondary` | `#BC2C24` | Brand emphasis, active accents, focus treatment, alerts, and small highlights |
| `brand.white` | `#FFFFFF` | Logo clearance, high-contrast text, and light surfaces |

Do not replace these values with visually similar blues or reds. Tints and dark-mode adaptations must be derived through semantic tokens rather than changing the official source colours.

## Theme package

Typed tokens are exported from:

```ts
import {
  brandColors,
  colorTokens,
  typographyTokens,
  spacingTokens,
  radiusTokens,
  shadowTokens,
  motionTokens,
  iconTokens,
  theme,
  type Theme,
  type ThemeMode,
} from "@libswiftride/ui/theme";
```

Shared CSS variables are available through:

```ts
import "@libswiftride/ui/theme.css";
```

The portal applications already receive the theme through `@libswiftride/ui/styles.css`. The public website imports `theme.css` directly before its website styles.

## Colour semantics

Always use semantic variables in component CSS:

```css
.example {
  color: var(--lsr-text);
  background: var(--lsr-surface);
  border-color: var(--lsr-border);
  box-shadow: var(--lsr-shadow-sm);
}

.primary-action {
  color: var(--lsr-action-text);
  background: var(--lsr-action);
}
```

Available semantic colour variables include:

- `--lsr-canvas`
- `--lsr-surface`
- `--lsr-surface-muted`
- `--lsr-text`
- `--lsr-text-muted`
- `--lsr-border`
- `--lsr-action`
- `--lsr-action-hover`
- `--lsr-action-text`
- `--lsr-accent`
- `--lsr-focus`
- `--lsr-header`
- `--lsr-footer`
- `--lsr-footer-text`

The dark theme retains the official navy and red while adjusting foreground and surface roles for accessible contrast. Do not use the secondary red for long text, large backgrounds, or routine positive states.

## Light and dark themes

The shared `ThemeToggle` cycles through system, light, and dark modes and persists the choice under `lsr_theme`.

```tsx
import { ThemeToggle } from "@libswiftride/ui";

<ThemeToggle />
```

Theme resolution:

1. `data-theme="light"` forces the light theme.
2. `data-theme="dark"` forces the dark theme.
3. No `data-theme` attribute follows `prefers-color-scheme`.

Components must remain usable in all three states. Avoid hard-coded white surfaces or navy text when a semantic token exists.

## Typography

- Display and headings: Manrope
- Body and interface copy: DM Sans
- Technical identifiers: the system monospace stack

Use the exported typography scale. Headings should be concise, sentence case, and visually confident. Body copy should normally use a `1.65` line height for legibility.

## Spacing and layout

Spacing uses a four-pixel base scale exposed as `--lsr-space-*` variables and `spacingTokens`.

- Use `space-2` to `space-4` for compact control spacing.
- Use `space-5` to `space-8` within cards and panels.
- Use `space-12` to `space-24` between major page sections.
- Prefer existing tokens over one-off pixel values.

## Border radius

- Small: compact badges and inline controls
- Medium: buttons, inputs, and icon containers
- Large: cards and operational panels
- Extra large: hero media and prominent feature panels
- Full: pills, avatars, and circular status indicators

Avoid mixing several unrelated radius values within one screen.

## Shadows

Use:

- `--lsr-shadow-sm` for controls and small cards
- `--lsr-shadow-md` for panels and floating navigation
- `--lsr-shadow-lg` for hero cards and modal-level elevation
- `--lsr-shadow-focus` only for focused interactive controls

Dark mode automatically receives deeper, neutral shadow values.

## Motion

Interface motion should explain hierarchy or state:

- Fast: hover and pressed feedback
- Normal: drawers, accordions, tabs, and card transitions
- Slow: page-level or hero transitions

Use the standard easing token for most interactions. The theme reduces all motion durations when `prefers-reduced-motion` is enabled.

## Icons

Use simple outlined icons with rounded line joins:

- Standard size: `--lsr-icon-md`
- Standard stroke: `iconTokens.strokeWidth.regular`
- Strong stroke: reserve for high-priority safety actions
- Icon containers: medium radius with a semantic muted surface

Icons must have an accessible name when they perform an action. Decorative icons must be hidden from assistive technology. Do not use colour alone to communicate status.

## Logo use

Use the approved asset without recolouring, distortion, rotation, or added effects:

- Public website: `apps/web/public/brand/libswiftride-logo.png`
- Shared applications: `packages/ui/assets/libswiftride-logo.png`

Maintain a white or neutral clearance area around the logo. At compact sizes, retain adjacent “LibSwiftRide” text so the brand remains legible.

## Accessibility

- Maintain WCAG AA contrast for text and controls.
- Use `--lsr-focus` for visible keyboard focus.
- Preserve a minimum 44-pixel interactive target where practical.
- Never communicate ride, payment, safety, or verification status using colour alone.
- Test both explicit themes and system preference.
- Respect reduced-motion preferences.

## Application coverage

The shared theme is consumed by:

- Public website
- Passenger application
- Driver application
- Fleet portal
- Dispatcher console
- Admin dashboard
- Business portal

New applications must depend on `@libswiftride/ui`, import the shared theme or shared stylesheet, and avoid defining a competing brand palette.
