<script lang="ts">
  import { api } from '../../lib/api.js';

  let { onAuthenticated }: { onAuthenticated: () => void } = $props();

  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      await api.post('/auth/login', { password });
      onAuthenticated();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="page">
  <form class="form" onsubmit={handleSubmit}>
    <h1 class="title">Dopamine</h1>

    <input
      type="password"
      class="input"
      placeholder="Password"
      bind:value={password}
      disabled={loading}
      autofocus
    />

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <button class="btn" type="submit" disabled={loading}>
      {loading ? 'Logging in...' : 'Login'}
    </button>
  </form>
</div>

<style>
  .page {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
  .form {
    width: 320px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .title {
    font-size: 20px;
    font-weight: 500;
    color: var(--text-primary);
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .input {
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: 4px;
    padding: 10px 12px;
    color: var(--text-primary);
    outline: none;
  }
  .input:focus {
    border-color: var(--accent);
  }
  .btn {
    background: var(--accent);
    color: var(--bg-base);
    border: none;
    border-radius: 4px;
    padding: 10px;
    cursor: pointer;
    font-weight: 700;
    margin-top: 4px;
  }
  .btn:hover {
    background: var(--accent-bright);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .error {
    color: var(--red);
    font-size: 13px;
  }
</style>
