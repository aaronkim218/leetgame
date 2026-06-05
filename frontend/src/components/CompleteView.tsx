import { Button } from './ui/button'

interface Props {
  onNext: () => void
  onBack?: () => void
}

export function CompleteView({ onNext, onBack }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-screen font-sans gap-6">
      <h1 className="m-0 text-3xl font-medium">Nice work!</h1>
      <p className="m-0 text-muted-foreground text-base">
        You nailed the algorithm and complexity.
      </p>
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="ghost" size="lg" onClick={onBack}>← Back</Button>
        )}
        <Button size="lg" onClick={onNext}>Next Problem</Button>
      </div>
    </div>
  )
}
