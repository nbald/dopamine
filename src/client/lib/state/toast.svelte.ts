export interface Toast {
  id: number;
  type: 'success' | 'error' | 'confirm';
  message: string;
  x: number;
  y: number;
  resolve?: (value: boolean) => void;
}

let nextId = 0;

class ToastState {
  toasts = $state<Toast[]>([]);

  success(message: string, x = 0, y = 0, duration = 3000) {
    const id = nextId++;
    this.toasts = [...this.toasts, { id, type: 'success', message, x, y }];
    setTimeout(() => this.dismiss(id), duration);
  }

  error(message: string, x = 0, y = 0, duration = 5000) {
    const id = nextId++;
    this.toasts = [...this.toasts, { id, type: 'error', message, x, y }];
    setTimeout(() => this.dismiss(id), duration);
  }

  confirm(message: string, x = 0, y = 0): Promise<boolean> {
    return new Promise((resolve) => {
      const id = nextId++;
      this.toasts = [...this.toasts, { id, type: 'confirm', message, x, y, resolve }];
    });
  }

  dismiss(id: number, result?: boolean) {
    const toast = this.toasts.find(t => t.id === id);
    if (toast?.resolve) toast.resolve(result ?? false);
    this.toasts = this.toasts.filter(t => t.id !== id);
  }
}

export const toastState = new ToastState();
