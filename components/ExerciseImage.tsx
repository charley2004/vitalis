import React, { useEffect, useState } from 'react';
import { View, Image, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { getExerciseImageUrl } from '../services/wger';
import { COLORS, FONTS, FONT_SIZE, RADII } from '../theme';

interface Props {
  exerciseName: string;
  size?: 'sm' | 'lg';
  style?: object;
}

type State = 'loading' | 'loaded' | 'error' | 'none';

export function ExerciseImage({ exerciseName, size = 'lg', style }: Props) {
  const [url, setUrl]     = useState<string | null>(null);
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setUrl(null);

    getExerciseImageUrl(exerciseName)
      .then((found) => {
        if (cancelled) return;
        if (found) { setUrl(found); setState('loaded'); }
        else        setState('none');
      })
      .catch(() => { if (!cancelled) setState('error'); });

    return () => { cancelled = true; };
  }, [exerciseName]);

  const dim = size === 'sm' ? styles.dimSm : styles.dimLg;

  if (state === 'loading') {
    return (
      <View style={[dim, styles.placeholder, style]}>
        <ActivityIndicator color={COLORS.textMuted} size={size === 'sm' ? 'small' : 'large'} />
      </View>
    );
  }

  if ((state === 'none' || state === 'error') || !url) {
    // Letter placeholder
    const letter = exerciseName.charAt(0).toUpperCase();
    return (
      <View style={[dim, styles.placeholder, style]}>
        <Text style={[styles.letter, size === 'sm' && styles.letterSm]}>{letter}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={[dim, styles.image, style]}
      resizeMode={size === 'sm' ? 'cover' : 'contain'}
      onError={() => setState('none')}
    />
  );
}

const styles = StyleSheet.create({
  dimSm:       { width: 48, height: 48 },
  dimLg:       { width: '100%', height: 200 },
  placeholder: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderDim,
  },
  image: {
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surfaceSolid,
  },
  letter: {
    fontSize: FONT_SIZE.xxl,
    color: COLORS.textMuted,
    fontFamily: FONTS.heading ?? undefined,
    fontWeight: '700',
  },
  letterSm: {
    fontSize: FONT_SIZE.md,
  },
});
