import { Stack } from 'expo-router'
import { AuthProvider } from '@/auth/auth-context'
import { ThemeProvider } from '@/theme/theme-context'

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="sign-in"
            options={{ presentation: 'modal', title: 'Sign in' }}
          />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  )
}
