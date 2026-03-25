import { api } from '../api.js';

export interface Project {
  id: number;
  name: string;
  sort_order: number;
  expanded?: boolean;
  terminals: TerminalMeta[];
  notes: NoteMeta[];
  iframes: IframeMeta[];
}

export interface TerminalMeta {
  id: number;
  project_id: number;
  name: string;
  title_override: string | null;
  isAlive: boolean;
  title: string;
  liveCwd: string | null;
  hasActivity?: boolean;
  isStopping?: boolean;
}

export interface NoteMeta {
  id: number;
  project_id: number;
  name: string;
  content: string;
}

export interface IframeMeta {
  id: number;
  project_id: number;
  name: string;
  url: string;
}

export type PaneContent =
  | { type: 'terminal'; id: number }
  | { type: 'note'; id: number }
  | { type: 'iframe'; id: number }
  | null;

class AppState {
  projects = $state<Project[]>([]);
  activePane = $state<PaneContent>(null);
  hostname = $state('');
  onPaneRemoved: ((type: string, id: number) => void) | null = null;

  async load() {
    const projects = await api.get<any[]>('/projects');
    const full: Project[] = [];

    for (const p of projects) {
      const [terminals, notes, iframes] = await Promise.all([
        api.get<any[]>(`/projects/${p.id}/terminals`),
        api.get<any[]>(`/projects/${p.id}/notes`),
        api.get<any[]>(`/projects/${p.id}/iframes`),
      ]);
      full.push({ ...p, expanded: true, terminals, notes, iframes });
    }

    // Preserve client-side state from previous load
    for (const p of full) {
      const prev = this.projects.find(pp => pp.id === p.id);
      if (prev) {
        p.expanded = prev.expanded;
        // Preserve per-terminal flags
        for (const t of p.terminals) {
          const prevT = prev.terminals.find(pt => pt.id === t.id);
          if (prevT) {
            t.isStopping = prevT.isStopping;
            t.hasActivity = prevT.hasActivity;
          }
        }
      }
    }

    this.projects = full;

    // Auto-select first terminal if nothing active
    if (!this.activePane && full.length > 0) {
      const first = full[0];
      if (first.terminals.length > 0) {
        this.activePane = { type: 'terminal', id: first.terminals[0].id };
      }
    }
  }

  async createProject(name: string) {
    const p = await api.post<any>('/projects', { name });
    this.projects = [...this.projects, { ...p, expanded: true, terminals: [], notes: [], iframes: [] }];
    return p;
  }

  async deleteProject(id: number) {
    await api.del(`/projects/${id}`);
    this.projects = this.projects.filter(p => p.id !== id);
    if (this.activePane) {
      const project = this.projects.find(p =>
        p.terminals.some(t => t.id === (this.activePane as any)?.id) ||
        p.notes.some(n => n.id === (this.activePane as any)?.id) ||
        p.iframes.some(i => i.id === (this.activePane as any)?.id)
      );
      if (!project) this.activePane = null;
    }
  }

  async createTerminal(projectId: number, name?: string) {
    // Get CWD from active terminal if possible
    let cwd: string | undefined;
    if (this.activePane?.type === 'terminal') {
      try {
        const res = await api.get<{ cwd: string | null }>(`/terminals/${this.activePane.id}/cwd`);
        if (res.cwd) cwd = res.cwd;
      } catch {}
    }

    const t = await api.post<any>(`/projects/${projectId}/terminals`, { name: name || 'Terminal', cwd });
    const project = this.projects.find(p => p.id === projectId);
    if (project) project.terminals = [...project.terminals, t];
    this.activePane = { type: 'terminal', id: t.id };
    return t;
  }

  /** Graceful stop: SIGTERM, show red dot. On exit, auto-remove. */
  async stopTerminal(id: number) {
    await api.post(`/terminals/${id}/stop`);
    for (const p of this.projects) {
      const t = p.terminals.find(t => t.id === id);
      if (t) t.isStopping = true;
    }
  }

  /** Force kill + remove from DB */
  async killTerminal(id: number) {
    await api.del(`/terminals/${id}`);
    this.removeTerminalFromState(id);
  }

  /** Remove terminal from local state + close its pane */
  removeTerminalFromState(id: number) {
    for (const p of this.projects) {
      p.terminals = p.terminals.filter(t => t.id !== id);
    }
    if (this.activePane?.type === 'terminal' && this.activePane.id === id) {
      this.activePane = null;
    }
    this.onPaneRemoved?.('terminal', id);
  }

  /** Check if terminal is in stopping state */
  isTerminalStopping(id: number): boolean {
    for (const p of this.projects) {
      const t = p.terminals.find(t => t.id === id);
      if (t) return !!t.isStopping;
    }
    return false;
  }

  async deleteTerminal(id: number) {
    // If already stopping or already dead: force kill + remove
    let isDead = false;
    for (const p of this.projects) {
      const t = p.terminals.find(t => t.id === id);
      if (t) { isDead = !t.isAlive || !!t.isStopping; break; }
    }

    if (isDead) {
      await this.killTerminal(id);
    } else {
      await this.stopTerminal(id);
    }
  }

  async createNote(projectId: number, name?: string) {
    const n = await api.post<any>(`/projects/${projectId}/notes`, { name: name || 'Note' });
    const project = this.projects.find(p => p.id === projectId);
    if (project) project.notes = [...project.notes, n];
    this.activePane = { type: 'note', id: n.id };
    return n;
  }

  async deleteNote(id: number) {
    await api.del(`/notes/${id}`);
    for (const p of this.projects) {
      p.notes = p.notes.filter(n => n.id !== id);
    }
    if (this.activePane?.type === 'note' && this.activePane.id === id) {
      this.activePane = null;
    }
    this.onPaneRemoved?.('note', id);
  }

  async createIframe(projectId: number, name?: string, url?: string) {
    const i = await api.post<any>(`/projects/${projectId}/iframes`, { name: name || 'Preview', url: url || '' });
    const project = this.projects.find(p => p.id === projectId);
    if (project) project.iframes = [...project.iframes, i];
    this.activePane = { type: 'iframe', id: i.id };
    return i;
  }

  async deleteIframe(id: number) {
    await api.del(`/iframes/${id}`);
    for (const p of this.projects) {
      p.iframes = p.iframes.filter(i => i.id !== id);
    }
    if (this.activePane?.type === 'iframe' && this.activePane.id === id) {
      this.activePane = null;
    }
    this.onPaneRemoved?.('iframe', id);
  }

  toggleProject(id: number) {
    const project = this.projects.find(p => p.id === id);
    if (project) project.expanded = !project.expanded;
  }

  async renameProject(id: number, name: string) {
    await api.put(`/projects/${id}`, { name });
    const project = this.projects.find(p => p.id === id);
    if (project) project.name = name;
  }

  async renameTerminal(id: number, name: string) {
    await api.put(`/terminals/${id}`, { name });
    for (const p of this.projects) {
      const t = p.terminals.find(t => t.id === id);
      if (t) { t.name = name; t.title_override = name; }
    }
  }

  async renameNote(id: number, name: string) {
    await api.put(`/notes/${id}`, { name });
    for (const p of this.projects) {
      const n = p.notes.find(n => n.id === id);
      if (n) n.name = name;
    }
  }

  async renameIframe(id: number, name: string) {
    await api.put(`/iframes/${id}`, { name });
    for (const p of this.projects) {
      const i = p.iframes.find(i => i.id === id);
      if (i) i.name = name;
    }
  }

  async reorderProjects(ids: number[]) {
    await api.put('/projects/reorder', { ids });
    const ordered: Project[] = [];
    for (const id of ids) {
      const p = this.projects.find(p => p.id === id);
      if (p) ordered.push(p);
    }
    this.projects = ordered;
  }

  async moveItem(type: 'terminal' | 'note' | 'iframe', id: number, toProjectId: number) {
    const endpoint = type === 'terminal' ? 'terminals' : type === 'note' ? 'notes' : 'iframes';
    await api.put(`/${endpoint}/${id}`, { projectId: toProjectId });

    // Move in local state
    let item: any;
    for (const p of this.projects) {
      const list = type === 'terminal' ? p.terminals : type === 'note' ? p.notes : p.iframes;
      const idx = list.findIndex((i: any) => i.id === id);
      if (idx >= 0) {
        item = list.splice(idx, 1)[0];
        if (type === 'terminal') p.terminals = [...p.terminals];
        else if (type === 'note') p.notes = [...p.notes];
        else p.iframes = [...p.iframes];
        break;
      }
    }
    if (item) {
      const target = this.projects.find(p => p.id === toProjectId);
      if (target) {
        item.project_id = toProjectId;
        if (type === 'terminal') target.terminals = [...target.terminals, item];
        else if (type === 'note') target.notes = [...target.notes, item];
        else target.iframes = [...target.iframes, item];
      }
    }
  }
}

export const appState = new AppState();
