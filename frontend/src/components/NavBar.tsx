import type { Session } from '@supabase/supabase-js'
import type { ActiveStage, View } from '../types'
import type { Theme } from '../hooks/useTheme'
import { supabase } from '../lib/supabase'
import { Button } from './ui/button'
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover'
import { StagesSettings } from './StagesSettings'

interface Props {
  view: View
  onNavigate: (v: View) => void
  session: Session | null
  authLoading: boolean
  streak: number | null
  streakStatus: 'solid' | 'hollow' | 'none' | null
  activeStages: ActiveStage[]
  onStagesChange: (stages: ActiveStage[]) => void
  hideTitle: boolean
  onHideTitleChange: (value: boolean) => void
  hideDifficulty: boolean
  onHideDifficultyChange: (value: boolean) => void
  conciseMode: boolean
  onConciseModeChange: (value: boolean) => void
  onTakeTour?: () => void
  theme: Theme
  onThemeChange: (t: Theme) => void
}

export function NavBar({
  view,
  onNavigate,
  session,
  authLoading,
  streak,
  streakStatus,
  activeStages,
  onStagesChange,
  hideTitle,
  onHideTitleChange,
  hideDifficulty,
  onHideDifficultyChange,
  conciseMode,
  onConciseModeChange,
  onTakeTour,
  theme,
  onThemeChange,
}: Props) {
  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="border-border bg-background flex shrink-0 items-center gap-1 border-b px-4 py-2">
      {(['practice', 'search'] as const).map((v) => (
        <Button
          key={v}
          data-tour={`nav-${v}`}
          variant={view === v ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onNavigate(v)}
        >
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </Button>
      ))}
      {session && (
        <Button
          data-tour="nav-stats"
          variant={view === 'stats' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onNavigate('stats')}
        >
          Stats
        </Button>
      )}
      <Button
        variant={view === 'mission' ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => onNavigate('mission')}
      >
        Mission
      </Button>

      <div className="ml-auto flex items-center gap-2">
        {!authLoading && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="text-muted-foreground hover:text-foreground px-1 text-2xl leading-none transition-colors"
                title="Practice stages"
              >
                ⚙
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0">
              <StagesSettings
                activeStages={activeStages}
                onChange={onStagesChange}
                hideTitle={hideTitle}
                onHideTitleChange={onHideTitleChange}
                hideDifficulty={hideDifficulty}
                onHideDifficultyChange={onHideDifficultyChange}
                conciseMode={conciseMode}
                onConciseModeChange={onConciseModeChange}
                onTakeTour={onTakeTour}
                theme={theme}
                onThemeChange={onThemeChange}
              />
            </PopoverContent>
          </Popover>
        )}
        {authLoading ? null : session ? (
          <>
            {streakStatus === 'solid' && (
              <span data-tour="streak" className="text-sm font-medium">
                🔥 {streak}
              </span>
            )}
            {streakStatus === 'hollow' && (
              <span
                data-tour="streak"
                className="text-sm font-medium opacity-50 grayscale"
              >
                🔥 {streak}
              </span>
            )}
            {session.user.user_metadata?.avatar_url && (
              <img
                src={session.user.user_metadata.avatar_url as string}
                alt="avatar"
                className="h-6 w-6 rounded-full"
              />
            )}
            <span className="text-muted-foreground hidden text-sm sm:inline">
              {(session.user.user_metadata?.name as string) ??
                session.user.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleSignOut()}
            >
              Sign out
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => void handleSignIn()}>
            Sign in
          </Button>
        )}
      </div>
    </div>
  )
}
