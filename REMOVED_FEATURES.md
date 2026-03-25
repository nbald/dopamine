# Removed features (2026-03-25)

Removed to fix broken mobile text input and backspace.

## TerminalView.svelte

### attachCustomKeyEventHandler
Intercepted all keydown events to handle desktop shortcuts:
- Ctrl+Shift+C — copy selection to clipboard
- Ctrl+Shift+V — paste from clipboard
- Ctrl+Shift+F — toggle search bar
- Ctrl+Plus/Minus — change font size

### visualViewport resize handler
Called `fitAddon.fit()` + `terminal.scrollToBottom()` on `window.visualViewport` resize.
Redundant with the ResizeObserver (debounced 50ms) which already refits on container size change.
Was calling fit() before CSS layout update, computing stale dimensions.

## BottomBar.svelte

### .mobile-kb-input CSS
Orphan CSS class (positioned off-screen input), not referenced in any template.

## App.svelte

### position:fixed body hack (removed earlier)
Original `visualViewport` resize handler set `body { position: fixed; top: -${kb}px }` when the mobile keyboard opened. Replaced with a `--vvh` CSS variable approach that resizes the layout container instead of shifting the body.
