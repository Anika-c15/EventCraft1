import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'

// --- Interfaces ---

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  duration?: number
}

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
}

interface ToastAndConfirmContextType {
  toast: {
    success: (message: string, duration?: number) => void
    error: (message: string, duration?: number) => void
    info: (message: string, duration?: number) => void
  }
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

// --- Contexts ---

const ToastAndConfirmContext = createContext<ToastAndConfirmContextType | null>(null)

// --- Provider Component ---

export const ToastAndConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmConfig, setConfirmConfig] = useState<{
    options: ConfirmOptions
    resolve: (value: boolean) => void
  } | null>(null)

  // -- Toast Methods --

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info', duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { id, message, type, duration }])

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, duration)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useMemo(
    () => ({
      success: (msg: string, dur?: number) => addToast(msg, 'success', dur),
      error: (msg: string, dur?: number) => addToast(msg, 'error', dur),
      info: (msg: string, dur?: number) => addToast(msg, 'info', dur),
    }),
    [addToast]
  )

  // -- Confirm Method --

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmConfig({
        options,
        resolve: (result: boolean) => {
          setConfirmConfig(null)
          resolve(result)
        },
      })
    })
  }, [])

  const contextValue = useMemo(() => ({ toast, confirm }), [toast, confirm])

  return (
    <ToastAndConfirmContext.Provider value={contextValue}>
      {children}

      {/* Toasts Container */}
      {createPortal(
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 md:px-0">
          {toasts.map((t) => {
            const bgClass =
              t.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 shadow-emerald-100/40 dark:shadow-none'
                : t.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300 shadow-rose-100/40 dark:shadow-none'
                : 'bg-blue-50 dark:bg-slate-900/60 border-blue-200 dark:border-slate-800 text-blue-800 dark:text-blue-300 shadow-blue-100/40 dark:shadow-none'

            const Icon =
              t.type === 'success'
                ? CheckCircle2
                : t.type === 'error'
                ? XCircle
                : Info

            return (
              <div
                key={t.id}
                className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border backdrop-blur-md shadow-lg transition-all duration-300 transform translate-x-0 animate-slide-in ${bgClass}`}
              >
                <Icon size={18} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-xs font-semibold leading-relaxed leading-5">
                  {t.message}
                </div>
                <button
                  onClick={() => removeToast(t.id)}
                  className="flex-shrink-0 text-current opacity-60 hover:opacity-100 p-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>,
        document.body
      )}

      {/* Confirmation Modal */}
      {confirmConfig &&
        createPortal(
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in">
            <div 
              className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 dark:border-slate-800/80 space-y-5 animate-scale-up"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                    confirmConfig.options.type === 'danger'
                      ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-500'
                      : confirmConfig.options.type === 'warning'
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-500'
                      : 'bg-primary/10 dark:bg-primary/20 text-primary'
                  }`}
                >
                  {confirmConfig.options.type === 'danger' ? (
                    <XCircle size={22} />
                  ) : confirmConfig.options.type === 'warning' ? (
                    <AlertTriangle size={22} />
                  ) : (
                    <Info size={22} />
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">
                    {confirmConfig.options.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed leading-5">
                    {confirmConfig.options.message}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => confirmConfig.resolve(false)}
                  className="flex-1 border border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-300 text-xs font-semibold py-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  {confirmConfig.options.cancelText || 'Cancel'}
                </button>
                <button
                  onClick={() => confirmConfig.resolve(true)}
                  className={`flex-1 text-white text-xs font-semibold py-3 rounded-2xl transition-colors shadow-lg shadow-black/5 ${
                    confirmConfig.options.type === 'danger'
                      ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/10'
                      : confirmConfig.options.type === 'warning'
                      ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/10'
                      : 'bg-primary hover:bg-primary-hover shadow-primary/10'
                  }`}
                >
                  {confirmConfig.options.confirmText || 'Confirm'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ToastAndConfirmContext.Provider>
  )
}

export const useToast = () => {
  const ctx = useContext(ToastAndConfirmContext)
  if (!ctx) throw new Error('useToast must be used within ToastAndConfirmProvider')
  return ctx.toast
}

export const useConfirm = () => {
  const ctx = useContext(ToastAndConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ToastAndConfirmProvider')
  return ctx.confirm
}
