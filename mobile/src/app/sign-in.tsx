import { useState } from 'react'
import { View, TextInput, Pressable, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/auth/supabase'
import { useTheme } from '@/theme/theme-context'

export default function SignInScreen() {
  const theme = useTheme()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message)
    else router.back()
  }

  const input = {
    color: theme.foreground,
    backgroundColor: theme.secondary,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  } as const

  return (
    <View
      testID="sign-in-screen"
      style={{ flex: 1, backgroundColor: theme.background, padding: 16, gap: 12 }}
    >
      <TextInput
        testID="sign-in-email"
        style={input}
        placeholder="Email"
        placeholderTextColor={theme.mutedForeground}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        testID="sign-in-password"
        style={input}
        placeholder="Password"
        placeholderTextColor={theme.mutedForeground}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {!!error && <Text style={{ color: theme.destructive }}>{error}</Text>}
      <Pressable
        testID="sign-in-submit"
        onPress={submit}
        disabled={busy}
        style={{
          backgroundColor: theme.primary,
          opacity: busy ? 0.6 : 1,
          borderRadius: 10,
          padding: 14,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Text>
      </Pressable>
    </View>
  )
}
