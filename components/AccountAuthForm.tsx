import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { GlassCard } from './GlassCard';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../theme';
import { signIn, signUp } from '../services/auth';
import { syncNow } from '../services/sync';

interface AccountAuthFormProps {
  /** Fired after a successful sign-in (and its post-sign-in sync) — not after
   *  sign-up, since a new account has no session until the user confirms
   *  their email and signs in separately. */
  onSignedIn?: () => void;
}

/** Shared by Settings → Account & Sync and the onboarding "Sync Across
 *  Devices?" step, so there's exactly one place that knows how to sign
 *  in/up — the two callers differ only in what happens next. */
export function AccountAuthForm({ onSignedIn }: AccountAuthFormProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!email.trim() || !password) { setAuthError('Enter an email and password.'); return; }
    setAuthError(null);
    setAuthLoading(true);
    const result = mode === 'signin' ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setAuthLoading(false);
    if (result.error) { setAuthError(result.error); return; }
    if (mode === 'signup') {
      Alert.alert('Check your email', 'Confirm your address to finish creating your account, then sign in.');
      setMode('signin');
      return;
    }
    setPassword('');
    await syncNow();
    onSignedIn?.();
  }, [email, password, mode, onSignedIn]);

  return (
    <>
      <GlassCard>
        <View style={styles.tabRow}>
          <TouchableOpacity onPress={() => setMode('signin')} style={[styles.tab, mode === 'signin' && styles.tabActive]}>
            <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>SIGN IN</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMode('signup')} style={[styles.tab, mode === 'signup' && styles.tabActive]}>
            <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>CREATE ACCOUNT</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel="Email"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry
          accessibilityLabel="Password"
        />
        {authError && <Text style={styles.errorText}>{authError}</Text>}
      </GlassCard>
      <TouchableOpacity onPress={handleSubmit} style={styles.primaryBtn} activeOpacity={0.7} disabled={authLoading}>
        {authLoading ? <ActivityIndicator color={COLORS.textInverse} /> : (
          <Text style={styles.primaryBtnText}>{mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}</Text>
        )}
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', gap: SPACING.sm, paddingBottom: SPACING.sm },
  tab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderDim,
  },
  tabActive: { borderColor: COLORS.textPrimary, backgroundColor: COLORS.surfaceElevated },
  tabText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  tabTextActive: { color: COLORS.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: COLORS.borderDim,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.textPrimary,
    fontFamily: FONTS.body ?? undefined,
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.sm,
  },
  errorText: { color: COLORS.red, fontSize: FONT_SIZE.xs, fontFamily: FONTS.body ?? undefined, marginTop: SPACING.sm },
  primaryBtn: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.textPrimary,
    borderRadius: RADII.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textInverse,
    fontFamily: FONTS.mono ?? undefined,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
