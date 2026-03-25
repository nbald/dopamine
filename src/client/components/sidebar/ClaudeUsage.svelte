<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../../lib/api.js';

  interface UsageData {
    available: boolean;
    session5h?: { usedPercent: number; resetsAt: string | null };
    weekly?: { usedPercent: number; resetsAt: string | null };
    extraUsage?: { enabled: boolean; monthlyLimit: number; usedCredits: number; utilization: number } | null;
  }

  let data = $state<UsageData | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function poll() {
    try {
      data = await api.get<UsageData>('/claude/usage');
    } catch {}
  }

  function timeLeft(resetsAt: string | null): string {
    if (!resetsAt) return '';
    const remaining = Math.max(0, new Date(resetsAt).getTime() - Date.now());
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    if (h > 24) {
      const d = Math.floor(h / 24);
      return `${d}d ${h % 24}h`;
    }
    return `${h}h${m.toString().padStart(2, '0')}`;
  }

  function elapsedPercent(resetsAt: string | null, totalHours: number): number {
    if (!resetsAt) return 0;
    const remaining = Math.max(0, new Date(resetsAt).getTime() - Date.now());
    const total = totalHours * 3600000;
    const elapsed = total - remaining;
    return Math.max(0, Math.min(100, (elapsed / total) * 100));
  }

  function usageColor(pct: number): string {
    const hue = Math.max(0, 120 * (1 - pct / 100));
    return `hsl(${hue}, 60%, 50%)`;
  }

  onMount(() => {
    poll();
    pollTimer = setInterval(poll, 60_000);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });
</script>

{#if data}
  <div class="claude-widget">
    <div class="widget-title">
      <span class="sparkle">&#10023;</span> Claude
    </div>

    {#if !data.available}
      <div class="usage-label"><span>No data</span></div>
    {/if}

    {#if data.session5h}
      <div class="usage-row">
        <div class="usage-label">
          <span>Session 5h</span>
          <span class="usage-value">{Math.round(data.session5h.usedPercent)}%</span>
        </div>
        <div class="usage-bar">
          <div class="usage-fill" style="width:{Math.min(100, data.session5h.usedPercent)}%;background:{usageColor(data.session5h.usedPercent)}"></div>
        </div>
      </div>
      <div class="usage-row">
        <div class="usage-label">
          <span>Session elapsed</span>
          <span class="usage-value">{Math.round(elapsedPercent(data.session5h.resetsAt, 5))}%</span>
        </div>
        <div class="usage-bar">
          <div class="usage-fill time-fill" style="width:{elapsedPercent(data.session5h.resetsAt, 5)}%"></div>
        </div>
      </div>
    {/if}

    {#if data.weekly}
      <div class="usage-row">
        <div class="usage-label">
          <span>Weekly</span>
          <span class="usage-value">{Math.round(data.weekly.usedPercent)}%</span>
        </div>
        <div class="usage-bar">
          <div class="usage-fill" style="width:{Math.min(100, data.weekly.usedPercent)}%;background:{usageColor(data.weekly.usedPercent)}"></div>
        </div>
      </div>
      <div class="usage-row">
        <div class="usage-label">
          <span>Week elapsed</span>
          <span class="usage-value">{Math.round(elapsedPercent(data.weekly.resetsAt, 7 * 24))}%</span>
        </div>
        <div class="usage-bar">
          <div class="usage-fill time-fill" style="width:{elapsedPercent(data.weekly.resetsAt, 7 * 24)}%"></div>
        </div>
      </div>
    {/if}

    {#if data.extraUsage}
      <div class="usage-row">
        <div class="usage-label">
          <span>Extra</span>
          <span class="usage-value">${Math.round(data.extraUsage.usedCredits / 100)} / ${Math.round(data.extraUsage.monthlyLimit / 100)}</span>
        </div>
        <div class="usage-bar">
          <div class="usage-fill overage-fill" style="width:{Math.min(100, data.extraUsage.utilization)}%"></div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .claude-widget {
    padding: 10px 14px 12px;
    border-top: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .widget-title {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--text-tertiary);
    margin-bottom: 8px;
  }

  .sparkle { color: var(--purple); font-size: 11px; }

  .usage-row { margin-bottom: 6px; }
  .usage-row:last-child { margin-bottom: 0; }

  .usage-label {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-secondary);
    margin-bottom: 3px;
  }

  .usage-value { font-size: 11px; }

  .usage-bar {
    height: 3px;
    background: var(--bg-hover);
    border-radius: 1px;
    overflow: hidden;
  }

  .usage-fill {
    height: 100%;
    border-radius: 1px;
    transition: width 0.5s ease;
  }

  .time-fill {
    background: var(--text-secondary);
    opacity: 0.5;
  }

  .overage-fill {
    background: var(--red);
  }
</style>
