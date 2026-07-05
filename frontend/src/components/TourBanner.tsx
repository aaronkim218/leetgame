interface Props {
  onStart: () => void
  onDismiss: () => void
}

export function TourBanner({ onStart, onDismiss }: Props) {
  return (
    <div className="bg-muted border-border flex shrink-0 items-center justify-between gap-3 border-b px-4 py-1 text-sm">
      <span className="text-muted-foreground">New here?</span>
      <div className="flex items-center gap-1">
        <button
          onClick={onStart}
          className="text-foreground px-2 py-2 font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
        >
          Take a tour
        </button>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground flex h-9 w-9 items-center justify-center text-lg transition-colors"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
