# FactSim UI design system

`css/design-system.css` is loaded after the existing feature styles. It defines the shared palette and compact component rules. The visual reference is FactSim AI: white controls, translucent light gray panels, fine borders, dark primary actions, and restrained shadows. State colors are reserved for success, warning, danger, and information.

## Tokens

Use `--ui-bg`, `--ui-surface`, `--ui-surface-secondary`, `--ui-surface-hover`, and `--ui-surface-selected` for backgrounds. Use `--ui-panel-translucent` for panel shells and `--ui-panel-translucent-light` for their sections; keep form controls opaque. Use `--ui-text`, `--ui-text-secondary`, and `--ui-text-muted` for text; and `--ui-border` / `--ui-border-strong` for separators and controls. Primary actions use `--ui-primary`, `--ui-primary-hover`, and `--ui-on-primary`. Use `--ui-success`, `--ui-warning`, `--ui-danger`, or `--ui-info` only when the color communicates a state.

Spacing uses `--ui-space-1` through `--ui-space-6` (4–24px). Geometry uses `--ui-radius-xs` through `--ui-radius-lg` and `--ui-control-height-sm` / `--ui-control-height`. Menu text uses `--ui-menu-font-size` and section headings use `--ui-menu-heading-size`. `--ui-shadow-sm` is for floating controls; `--ui-shadow-md` is for dialogs and menus. Body text uses `--ui-font`; numerical or code data may use `--ui-font-mono`.

## Components

New UI can use `.ui-panel`, `.ui-toolbar`, `.ui-button` (`.is-primary`, `.is-ghost`, `.is-danger`), `.ui-icon-button`, `.ui-field`, `.ui-tab` (`.is-active` or `aria-selected="true"`), `.ui-table`, and `.ui-modal`. Existing Sidebar, Workspace, Details, Flow, dialogs, sensor chart, and AI selectors are bridged to the same tokens in the lower half of the stylesheet. Keep feature-specific layout and behavior in the feature stylesheet.

Use sections, headers, and dividers inside panels. Reserve the dark button for the main action in a group. Preserve visible keyboard focus and an accessible name for icon-only controls. Do not introduce decorative state colors or nested cards for ordinary parameter groups.
