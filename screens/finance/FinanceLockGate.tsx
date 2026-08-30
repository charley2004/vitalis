import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LockIcon, FingerprintIcon } from '../../components/icons';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../theme';
import { verifyPin, authenticateBiometric, isBiometricAvailable } from '../../services/financeLock';
import type { LockMode } from '../../services/finance';

interface FinanceLockGateProps {
  lockMode: LockMode;
  onUnlock: () => void;
}

export function FinanceLockGate({ lockMode, onUnlock }: FinanceLockGateProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [biometricTried, setBiometricTried] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const tryBiometric = useCallback(async () => {
    const ok = await authenticateBiometric();
    setBiometricTried(true);
    if (ok) onUnlock();
  }, [onUnlock]);

  useEffect(() => {
    if (lockMode === 'biometric' || lockMode === 'both') {
      isBiometricAvailable().then((avail) => {
        setBiometricAvailable(avail);
        if (avail) tryBiometric();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockMode]);

  const handlePinSubmit = useCallback(async () => {
    const ok = await verifyPin(pin);
    if (ok) { onUnlock(); return; }
    setError('Incorrect PIN');
    setPin('');
  }, [pin, onUnlock]);

  const showPinField = lockMode === 'pin' || lockMode === 'both' || (lockMode === 'biometric' && biometricTried && !biometricAvailable);

  return (
    <View style={styles.overlay}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={styles.iconBox}><LockIcon size={28} color={COLORS.textPrimary} /></View>
          <Text style={styles.title}>FINANCE LOCKED</Text>

          {(lockMode === 'biometric' || lockMode === 'both') && (
            <TouchableOpacity style={styles.bioBtn} onPress={tryBiometric} activeOpacity={0.7}>
              <FingerprintIcon size={18} color={COLORS.textPrimary} />
              <Text style={styles.bioBtnText}>UNLOCK WITH BIOMETRICS</Text>
            </TouchableOpacity>
          )}

          {showPinField && (
            <>
              <TextInput
                style={styles.pinInput}
                value={pin}
                onChangeText={(v) => { setPin(v); setError(null); }}
                placeholder="****"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                autoFocus={lockMode === 'pin'}
              />
              {error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity style={styles.unlockBtn} onPress={handlePinSubmit} disabled={pin.length === 0} activeOpacity={0.7}>
                <Text style={styles.unlockBtnText}>UNLOCK</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.background, zIndex: 100 },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl, gap: SPACING.md },
  iconBox: { width: 64, height: 64, borderRadius: RADII.full, borderWidth: 1, borderColor: COLORS.borderNeon, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  title: { fontSize: FONT_SIZE.md, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 2 },
  bioBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  bioBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  pinInput: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.md, width: 160,
    textAlign: 'center', fontSize: FONT_SIZE.xl, letterSpacing: 8, color: COLORS.textPrimary,
    paddingVertical: SPACING.sm, backgroundColor: COLORS.surface,
  },
  error: { fontSize: FONT_SIZE.xs, color: COLORS.red, fontFamily: FONTS.body ?? undefined },
  unlockBtn: { backgroundColor: COLORS.white, borderRadius: RADII.md, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm },
  unlockBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1.5 },
});
