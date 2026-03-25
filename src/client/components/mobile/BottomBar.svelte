<script lang="ts">
  import { wsManager } from '../../lib/state/ws.svelte.js';
  import { appState } from '../../lib/state/app.svelte.js';

  let ctrlActive = $state(false);
  let altActive = $state(false);

  function sendKey(key: string) {
    const pane = appState.activePane;
    if (!pane || pane.type !== 'terminal') return;

    let data = key;
    if (ctrlActive) {
      // Convert to ctrl sequence (Ctrl+A = \x01, etc.)
      if (key.length === 1 && key >= 'a' && key <= 'z') {
        data = String.fromCharCode(key.charCodeAt(0) - 96);
      } else if (key === 'c') {
        data = '\x03';
      }
      ctrlActive = false;
    }
    if (altActive) {
      data = '\x1b' + key;
      altActive = false;
    }

    wsManager.send({ type: 'terminal:input', terminalId: pane.id, data });
  }

  function sendEscape(seq: string) {
    const pane = appState.activePane;
    if (!pane || pane.type !== 'terminal') return;
    wsManager.send({ type: 'terminal:input', terminalId: pane.id, data: seq });
  }

  let selectMode = $state(false);

  function toggleSelect() {
    selectMode = !selectMode;
    if (selectMode) {
      // Extract text from terminal rows
      const rows = document.querySelectorAll('.xterm-rows > div');
      const lines: string[] = [];
      rows.forEach(row => lines.push((row as HTMLElement).textContent || ''));
      selectText = lines.join('\n').trimEnd();
    }
  }

  let selectText = $state('');

  function pasteClip() {
    const pane = appState.activePane;
    if (!pane || pane.type !== 'terminal') return;
    navigator.clipboard.readText().then((text) => {
      if (text) wsManager.send({ type: 'terminal:input', terminalId: pane.id, data: text });
    }).catch(() => {});
  }

  function toggleKeyboard() {
    // Focus xterm's internal textarea to open/close mobile keyboard
    const xtermTextarea = document.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
    if (xtermTextarea) {
      if (document.activeElement === xtermTextarea) {
        xtermTextarea.blur();
      } else {
        xtermTextarea.focus();
      }
    }
  }
</script>


<div class="bottom-bar">
  <!-- Row 1 -->
  <button class="key-btn" style="position:absolute;left:4px;top:4px;width:38px"   onclick={() => sendEscape('\x1b')}>Esc</button>
  <button class="key-btn mod" style="position:absolute;left:46px;top:4px;width:38px"  class:active={ctrlActive} onclick={() => ctrlActive = !ctrlActive}>Ctrl</button>
  <button class="key-btn mod" style="position:absolute;left:88px;top:4px;width:34px"  class:active={altActive} onclick={() => altActive = !altActive}>Alt</button>
  <button class="key-btn" style="position:absolute;left:126px;top:4px;width:34px"  onclick={() => sendEscape('\t')}>Tab</button>
  <button class="key-btn" style="position:absolute;left:164px;top:4px;width:42px"  onclick={() => sendEscape('\x1b[Z')}>&#x21E7;Tab</button>

  <button class="key-btn" style="position:absolute;right:128px;top:4px;width:42px"  onclick={() => sendEscape('\x1b[H')}>Home</button>
  <button class="key-btn" style="position:absolute;right:86px;top:4px;width:34px"   onclick={() => sendEscape('\x1b[A')}>&#x2191;</button>
  <button class="key-btn" style="position:absolute;right:48px;top:4px;width:34px"   onclick={() => sendEscape('\x1b[F')}>End</button>
  <button class="key-btn" style="position:absolute;right:4px;top:4px;width:40px"    onclick={() => sendEscape('\x1b[5~')}>PgUp</button>

  <!-- Row 2 -->
  <button class="key-btn" style="position:absolute;left:4px;bottom:4px;width:34px"  onclick={toggleKeyboard}>&#x2328;</button>
  <button class="key-btn" class:active={selectMode} style="position:absolute;left:42px;bottom:4px;width:34px" onclick={toggleSelect}>Sel</button>
  <button class="key-btn" style="position:absolute;left:80px;bottom:4px;width:44px" onclick={pasteClip}>Paste</button>

  <button class="key-btn" style="position:absolute;right:128px;bottom:4px;width:34px" onclick={() => sendEscape('\x1b[D')}>&#x2190;</button>
  <button class="key-btn" style="position:absolute;right:86px;bottom:4px;width:34px"  onclick={() => sendEscape('\x1b[B')}>&#x2193;</button>
  <button class="key-btn" style="position:absolute;right:48px;bottom:4px;width:34px"  onclick={() => sendEscape('\x1b[C')}>&#x2192;</button>
  <button class="key-btn" style="position:absolute;right:4px;bottom:4px;width:40px"   onclick={() => sendEscape('\x1b[6~')}>PgDn</button>
</div>

{#if selectMode}
  <div class="select-overlay">
    <button class="select-close" onclick={() => selectMode = false}>&#x2716; Close</button>
    <pre class="select-text">{selectText}</pre>
  </div>
{/if}

<style>
  .select-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--bg-base);
    overflow-y: auto;
    padding: 12px;
    -webkit-overflow-scrolling: touch;
  }
  .select-close {
    position: sticky;
    top: 0;
    display: block;
    width: 100%;
    padding: 10px;
    background: var(--bg-elevated);
    border: none;
    border-bottom: 1px solid var(--border-default);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 14px;
    cursor: pointer;
    text-align: center;
    z-index: 1;
  }
  .select-text {
    font-family: var(--font-mono);
    font-size: 14px;
    line-height: 1.3;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-all;
    user-select: text;
    -webkit-user-select: text;
  }

  .bottom-bar {
    position: relative;
    height: 68px;
    background: var(--bg-elevated);
    border-top: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .key-btn {
    flex-shrink: 0;
    padding: 6px 8px;
    min-width: 36px;
    border: 1px solid var(--border-default);
    border-radius: 4px;
    background: var(--bg-surface);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 12px;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    text-align: center;
  }

  .key-btn:active {
    background: var(--bg-active);
    color: var(--text-primary);
  }

  .key-btn.active {
    background: var(--accent);
    color: var(--bg-base);
    border-color: var(--accent);
  }
</style>
