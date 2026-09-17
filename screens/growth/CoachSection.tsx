import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { AppIcon } from '../../components/icons';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../theme';
import { askCoach, getCoachHistory, clearCoachHistory, CoachMessage } from '../../services/coach';

// Vitalis AI — a real full-screen chat, not a card embedded among other
// widgets. The rule-based Daily Verdict/Insights that used to live alongside
// this now live on the Goals tab; the AI still reads all of that same data
// as context for every answer (see services/coach.ts's buildCoachContext),
// it's just not rendered as separate cards here anymore.

const SUGGESTED_QUESTIONS = [
  'Why am I behind today?',
  "How's my week trending?",
  'What should I focus on tomorrow?',
];

export function CoachSection() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getCoachHistory().then((h) => {
        if (!active) return;
        setMessages(h);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
      });
      return () => { active = false; };
    }, [])
  );

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript;
    if (transcript !== undefined) setQuestion(transcript);
  });
  useSpeechRecognitionEvent('end', () => setRecognizing(false));
  useSpeechRecognitionEvent('error', (event) => {
    setRecognizing(false);
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      Alert.alert('Voice input', event.message || "Couldn't hear that clearly — try again.");
    }
  });

  const handleMicPress = useCallback(async () => {
    if (recognizing) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone access needed', 'Enable microphone and speech recognition access in your device settings to use voice input.');
        return;
      }
      setQuestion('');
      setRecognizing(true);
      ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true, continuous: false });
    } catch {
      setRecognizing(false);
    }
  }, [recognizing]);

  const handleAsk = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    if (recognizing) ExpoSpeechRecognitionModule.stop();
    setQuestion('');
    setError(null);
    setLoading(true);
    // Optimistic: show the question immediately, replaced by the canonical
    // persisted pair (with the real reply) once the request resolves.
    setMessages((prev) => [...prev, { id: `pending-${Date.now()}`, role: 'user', content: trimmed, createdAt: new Date().toISOString() }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    const result = await askCoach(trimmed);
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    const history = await getCoachHistory();
    setMessages(history);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [loading, recognizing]);

  const handleClear = useCallback(() => {
    clearCoachHistory();
    setMessages([]);
    setError(null);
  }, []);

  return (
    <KeyboardAvoidingView
      style={s.safe}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <View style={s.header}>
        <Text style={s.headerTitle}>VITALIS AI</Text>
        {messages.length > 0 && (
          <TouchableOpacity onPress={handleClear} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Clear conversation">
            <Text style={s.clearText}>CLEAR</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconBox}><AppIcon id="bolt" size={22} color={COLORS.textPrimary} /></View>
            <Text style={s.emptyTitle}>Ask me anything</Text>
            <Text style={s.emptySub}>Your routines, schedule, and progress — I have the full picture.</Text>
            <View style={s.chipsCol}>
              {SUGGESTED_QUESTIONS.map((q) => (
                <TouchableOpacity key={q} onPress={() => handleAsk(q)} style={s.chip} activeOpacity={0.7} disabled={loading}>
                  <Text style={s.chipText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          messages.map((m) => (
            <View key={m.id} style={[s.bubble, m.role === 'user' && s.bubbleYou]}>
              <Text style={s.bubbleFrom}>{m.role === 'user' ? 'YOU' : 'VITALIS AI'}</Text>
              <Text style={s.bubbleText}>{m.content}</Text>
            </View>
          ))
        )}
        {loading && (
          <View style={s.bubble}>
            <Text style={s.bubbleFrom}>VITALIS AI</Text>
            <ActivityIndicator size="small" color={COLORS.textMuted} />
          </View>
        )}
        {error && <Text style={s.errorText}>{error}</Text>}
      </ScrollView>

      <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}>
        <TouchableOpacity
          onPress={handleMicPress}
          style={[s.micBtn, recognizing && s.micBtnActive]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={recognizing ? 'Stop voice input' : 'Start voice input'}
        >
          <AppIcon id="mic" size={17} color={recognizing ? COLORS.textInverse : COLORS.textSecondary} />
        </TouchableOpacity>
        <TextInput
          style={s.input}
          value={question}
          onChangeText={setQuestion}
          placeholder={recognizing ? 'Listening…' : 'Message Vitalis AI…'}
          placeholderTextColor={COLORS.textMuted}
          onSubmitEditing={() => handleAsk(question)}
          returnKeyType="send"
          multiline
          accessibilityLabel="Message Vitalis AI"
        />
        <TouchableOpacity
          onPress={() => handleAsk(question)}
          style={[s.sendBtn, !question.trim() && { opacity: 0.4 }]}
          activeOpacity={0.7}
          disabled={loading || !question.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          {loading ? <ActivityIndicator size="small" color={COLORS.textInverse} /> : <Text style={s.sendBtnText}>↑</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.xs, paddingBottom: SPACING.sm,
  },
  headerTitle: { fontSize: FONT_SIZE.md, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 2 },
  clearText: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },

  scroll: { padding: SPACING.screenPad, paddingTop: SPACING.xs, gap: SPACING.sm, flexGrow: 1 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingTop: SPACING.xxl },
  emptyIconBox: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1, borderColor: COLORS.borderBright, backgroundColor: COLORS.surfaceSolid,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm,
  },
  emptyTitle: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  emptySub: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, textAlign: 'center', maxWidth: 260, marginBottom: SPACING.md },
  chipsCol: { gap: SPACING.xs, width: '100%' },
  chip: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.lg,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.surface,
  },
  chipText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined, textAlign: 'center' },

  bubble: {
    maxWidth: '86%', alignSelf: 'flex-start',
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.lg,
    padding: SPACING.md, backgroundColor: COLORS.surface,
  },
  bubbleYou: { alignSelf: 'flex-end', backgroundColor: COLORS.surfaceElevated, borderColor: COLORS.borderNeon },
  bubbleFrom: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700', marginBottom: 4 },
  bubbleText: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined, lineHeight: 21 },
  errorText: { fontSize: FONT_SIZE.sm, color: COLORS.red, fontFamily: FONTS.body ?? undefined, alignSelf: 'center', marginTop: SPACING.xs },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm,
    paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.borderDim, backgroundColor: COLORS.background,
  },
  micBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.borderNeon, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  micBtnActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  input: {
    flex: 1,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.borderDim,
    borderRadius: RADII.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.textPrimary,
    fontFamily: FONTS.body ?? undefined,
    fontSize: FONT_SIZE.sm,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.textPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText: { fontSize: FONT_SIZE.base, color: COLORS.textInverse, fontWeight: '700' },
});
