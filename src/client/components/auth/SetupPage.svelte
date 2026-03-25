<script lang="ts">
</script>

<div class="page">
  <div class="box">
    <h1 class="title">Dopamine</h1>
    <p class="msg">No password configured.</p>
    <p class="msg">Run the following command on the server:</p>
    <code class="cmd">npm run reset-password</code>
    <p class="msg secondary">Then refresh this page.</p>
  </div>
</div>

<style>
  .page {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
  .box {
    width: 400px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-align: center;
  }
  .title {
    font-size: 20px;
    font-weight: 500;
    color: var(--text-primary);
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .msg {
    font-size: 14px;
    color: var(--text-secondary);
  }
  .secondary {
    color: var(--text-tertiary);
    font-size: 13px;
  }
  .cmd {
    display: block;
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: 4px;
    padding: 12px;
    color: var(--accent);
    font-size: 15px;
    user-select: all;
  }
</style>
