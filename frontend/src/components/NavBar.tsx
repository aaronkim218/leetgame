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
    <div className="border-border bg-background flex shrink-0 items-center gap-1 border-b px-2 py-2 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(['practice', 'search'] as const).map((v) => (
          <Button
            key={v}
            data-tour={`nav-${v}`}
            variant={view === v ? 'secondary' : 'ghost'}
            size="sm"
            className="shrink-0"
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
            className="shrink-0"
            onClick={() => onNavigate('stats')}
          >
            Stats
          </Button>
        )}
        <Button
          variant={view === 'mission' ? 'secondary' : 'ghost'}
          size="sm"
          className="shrink-0"
          onClick={() => onNavigate('mission')}
        >
          Mission
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {!authLoading && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="text-muted-foreground hover:text-foreground flex h-10 w-10 items-center justify-center text-2xl leading-none transition-colors"
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
                onTakeTour={onTakeTour}
                theme={theme}
                onThemeChange={onThemeChange}
                signedInAs={
                  session
                    ? ((session.user.user_metadata?.name as string) ??
                      session.user.email)
                    : undefined
                }
                onSignOut={session ? () => void handleSignOut() : undefined}
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
              className="hidden sm:inline-flex"
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
