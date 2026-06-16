import { Button } from './ui/button'

interface Props {
  onNext: () => void
  onBack?: () => void
}

export function CompleteView({ onNext, onBack }: Props) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 font-sans">
      <h1 className="m-0 text-3xl font-medium">Nice work!</h1>
      <p className="text-muted-foreground m-0 text-base">
        You nailed the algorithm and complexity.
      </p>
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="ghost" size="lg" onClick={onBack}>
            ← Back
          </Button>
        )}
        <Button size="lg" onClick={onNext}>
          Next Problem
        </Button>
      </div>
    </div>
  )
}
