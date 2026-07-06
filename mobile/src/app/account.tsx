import { View, Text, Pressable } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useAuth } from '@/auth/auth-context'
import { useTheme } from '@/theme/theme-context'

export default function AccountScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { session, streak, signOut } = useAuth()

  if (!session) {
    return (
      <View
        testID="account-screen"
        style={{
          flex: 1,
          backgroundColor: theme.background,
          padding: 16,
          gap: 12,
        }}
      >
        <Text style={{ color: theme.foreground, fontSize: 16 }}>
          You are practicing anonymously. Sign in to track your streak and
          progress.
        </Text>
        <Link href="/sign-in" asChild>
          <Pressable
            testID="account-sign-in"
            style={{
              backgroundColor: theme.primary,
              borderRadius: 10,
              padding: 14,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>
              Sign in
            </Text>
          </Pressable>
        </Link>
      </View>
    )
  }

  return (
    <View
      testID="account-screen"
      style={{
        flex: 1,
        backgroundColor: theme.background,
        padding: 16,
        gap: 12,
      }}
    >
      <Text style={{ color: theme.foreground, fontSize: 16 }}>
        {session.user.email}
      </Text>
      <Text style={{ color: theme.mutedForeground }}>
        Streak: {streak ?? 0}
      </Text>
      <Pressable
        testID="account-sign-out"
        onPress={async () => {
          await signOut()
          router.back()
        }}
        style={{
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: 10,
          padding: 14,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: theme.destructive, fontWeight: '600' }}>
          Sign out
        </Text>
      </Pressable>
    </View>
  )
}
