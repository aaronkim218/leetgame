import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/theme-context'
import type { PlaylistFilters } from '../types'

export function playlistSummary(filters: PlaylistFilters): string {
  const parts: string[] = []
  if (filters.q) parts.push(`"${filters.q}"`)
  if (filters.difficulties.length) parts.push(filters.difficulties.join('/'))
  if (filters.tags.length)
    parts.push(filters.tags.join(filters.tagMatch === 'and' ? '+' : ', '))
  return parts.length ? parts.join(' · ') : 'Playlist'
}

export function PlaylistBanner({
  filters,
  onExit,
}: {
  filters: PlaylistFilters
  onExit: () => void
}) {
  const theme = useTheme()
  return (
    <View
      testID="playlist-banner"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginHorizontal: 12,
        marginTop: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 8,
        backgroundColor: theme.muted,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          color: theme.mutedForeground,
          fontSize: 12,
          fontWeight: '600',
          letterSpacing: 0.5,
        }}
      >
        {playlistSummary(filters)}
      </Text>
      <Pressable
        testID="playlist-exit"
        accessibilityLabel="Exit playlist"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onExit}
      >
        <Text style={{ color: theme.mutedForeground, fontSize: 16 }}>×</Text>
      </Pressable>
    </View>
  )
}
