import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';

// Deliberately outside AsyncStorage / the @vitalis/ prefix that services/sync.ts
// syncs to Supabase — a lock secret should never leave the device in any form.
const PIN_HASH_KEY = 'vitalis_finance_pin_hash';

async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}

export async function hasPinSet(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PIN_HASH_KEY)) !== null;
  } catch { return false; }
}

export async function setPin(pin: string): Promise<void> {
  const hash = await hashPin(pin);
  await SecureStore.setItemAsync(PIN_HASH_KEY, hash);
}

export async function verifyPin(pin: string): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(PIN_HASH_KEY);
    if (!stored) return false;
    return (await hashPin(pin)) === stored;
  } catch { return false; }
}

export async function clearPin(): Promise<void> {
  try { await SecureStore.deleteItemAsync(PIN_HASH_KEY); } catch {}
}

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
  } catch { return false; }
}

export async function authenticateBiometric(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Finance',
      cancelLabel: 'Use PIN instead',
    });
    return result.success;
  } catch { return false; }
}
