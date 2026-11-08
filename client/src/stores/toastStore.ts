import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
}

interface ToastState {
  toasts: Toast[];
  push: (text: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, text }] }));
    setTimeout(() => get().dismiss(id), 3_000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
