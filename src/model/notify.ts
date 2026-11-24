import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}

interface ToastState {
  toasts: Toast[]
  push: (text: string, kind?: Toast['kind']) => void
  dismiss: (id: number) => void
}

let seq = 0

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (text, kind = 'info') => {
    const id = ++seq
    set({ toasts: [...get().toasts, { id, text, kind }] })
    setTimeout(() => get().dismiss(id), kind === 'error' ? 6000 : 3000)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

export const notify = (text: string, kind: Toast['kind'] = 'info') => useToasts.getState().push(text, kind)
