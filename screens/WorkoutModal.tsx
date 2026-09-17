import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, StatusBar, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BODY_PART_META, EXERCISES, EXERCISE_INSTRUCTIONS,
  getExercisesByBodyPart, getMuscleGroups, deriveWorkoutCategory,
  buildSessionPlan, planEstimatedMinutes, estimateSessionIntensity,
  type BodyPart, type Exercise, type Equipment, type Phase, type IntensityLevel,
} from '../services/exercises';
import {
  getWgerByBodyPart, wgerToExercise, prefetchWger,
  type WgerExercise,
} from '../services/wger';
import { ExerciseImage } from '../components/ExerciseImage';
import { getSettings, type AppSettings, type LoggedExercise } from '../services/storage';
import type { SplitDay } from '../services/fitness';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../theme';
import * as Haptics from 'expo-haptics';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'browse' | 'exercises' | 'setup' | 'active' | 'complete';
type EquipFilter = 'all' | 'bodyweight' | 'gym';

export interface CompletedSession {
  durationMinutes: number;
  exerciseIds: string[];
  completedIds: string[];
  category: 'upper' | 'lower' | 'cardio' | 'full';
  loggedExercises?: LoggedExercise[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onComplete: (session: CompletedSession) => void;
  weekActiveDays: number;
  annualTarget?: number;
  /** Today's assigned split day, when launched from "Start Today's Workout" —
   *  pre-selects these exercises (still editable in setup) and, once the
   *  session ends, offers a quick weight/reps log for each so progressive
   *  overload has real numbers to work from. Undefined for an ad-hoc session. */
  programDay?: SplitDay;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function matchesFilter(e: Exercise, filter: EquipFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'bodyweight') return e.equipment.every((eq) => eq === 'bodyweight' || eq === 'bar');
  return e.equipment.some((eq: Equipment) => eq !== 'bodyweight');
}

function difficultyDots(d: Exercise['difficulty']): string {
  return d === 'beginner' ? '●○○' : d === 'intermediate' ? '●●○' : '●●●';
}

const ANNUAL_TARGET_DEFAULT = 200;
const WEEKS_PER_YEAR = 52;
const TIME_OPTIONS = [15, 30, 45, 60, 90];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={ui.sectionHeader}>{title}</Text>;
}

function Chip({
  label, active, onPress,
}: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[ui.chip, active && ui.chipActive]}
    >
      <Text style={[ui.chipText, { color: active ? COLORS.textPrimary : COLORS.textMuted }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Browse: body part grid ───────────────────────────────────────────────────

type Region = 'ALL' | 'UPPER' | 'LOWER';

const UPPER_PARTS = new Set<BodyPart>(['CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'FOREARMS']);
const LOWER_PARTS = new Set<BodyPart>(['HIPS', 'GLUTES', 'QUADS', 'HAMSTRINGS', 'CALVES']);

function BrowseView({
  selectedIds,
  onSelectBodyPart,
  onContinue,
}: {
  selectedIds: Set<string>;
  onSelectBodyPart: (bp: BodyPart) => void;
  onContinue: () => void;
}) {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<Region>('ALL');
  const count = selectedIds.size;

  const tiles = BODY_PART_META.filter((meta) => {
    if (region === 'UPPER' && !UPPER_PARTS.has(meta.key)) return false;
    if (region === 'LOWER' && !LOWER_PARTS.has(meta.key)) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return meta.label.toLowerCase().includes(q) || meta.muscles.toLowerCase().includes(q);
  });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={browse.scroll} showsVerticalScrollIndicator={false}>
        <View style={browse.searchBox}>
          <Text style={browse.searchIcon}>⌕</Text>
          <TextInput
            style={browse.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search muscle groups…"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>

        <View style={browse.regionRow}>
          {(['ALL', 'UPPER', 'LOWER'] as Region[]).map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setRegion(r)}
              activeOpacity={0.7}
              style={[browse.regionChip, region === r && browse.regionChipActive]}
            >
              <Text style={[browse.regionChipText, region === r && { color: COLORS.textPrimary }]}>
                {r === 'ALL' ? 'ALL AREAS' : r === 'UPPER' ? 'UPPER BODY' : 'LOWER BODY'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={browse.sectionRow}>
          <Text style={browse.sectionLabel}>SELECT FOCUS</Text>
          <View style={browse.availablePill}>
            <Text style={browse.availablePillText}>{tiles.length} AVAILABLE</Text>
          </View>
        </View>

        <View style={browse.grid}>
          {tiles.map((meta) => {
            const exCount = getExercisesByBodyPart(meta.key).length;
            const selCount = Array.from(selectedIds).filter(
              (id) => EXERCISES.find((e) => e.id === id)?.bodyPart === meta.key,
            ).length;
            const selected = selCount > 0;
            return (
              <TouchableOpacity
                key={meta.key}
                onPress={() => onSelectBodyPart(meta.key)}
                activeOpacity={0.7}
                style={[browse.tile, selected && browse.tileSelected]}
              >
                <View style={browse.tileTopRow}>
                  {meta.priority && <View style={browse.priorityDot} />}
                  <View style={{ flex: 1 }} />
                  <View style={[browse.countBadge, selected && browse.countBadgeSelected]}>
                    <Text style={[browse.countBadgeText, selected && { color: COLORS.textInverse }]}>
                      {selCount > 0 ? selCount : exCount}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1 }} />
                <Text style={[browse.tileLabel, selected && { color: COLORS.textPrimary }]}>
                  {meta.label.toUpperCase()}
                </Text>
                <Text style={browse.tileMuscles} numberOfLines={1}>{meta.muscles}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={browse.note}>
          <View style={browse.noteDot} />
          <Text style={browse.noteText}>
            HIPS marked as priority — key area for your gait goals
          </Text>
        </View>
      </ScrollView>
      {count > 0 && (
        <View style={browse.footer}>
          <TouchableOpacity onPress={onContinue} activeOpacity={0.8} style={browse.continueBtn}>
            <Text style={browse.continueCheck}>✓</Text>
            <Text style={browse.continueBtnText}>
              {count} EXERCISE{count !== 1 ? 'S' : ''} SELECTED
            </Text>
            <Text style={browse.continueArrow}>›</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const browse = StyleSheet.create({
  scroll: { padding: SPACING.screenPad, paddingBottom: 120 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderNeon,
    borderRadius: RADII.full, paddingHorizontal: SPACING.md, marginBottom: SPACING.sm,
  },
  searchIcon:  { fontSize: FONT_SIZE.md, color: COLORS.textMuted },
  searchInput: {
    flex: 1, paddingVertical: SPACING.sm + 2,
    fontSize: FONT_SIZE.sm, color: COLORS.textPrimary,
    fontFamily: FONTS.mono ?? undefined, letterSpacing: 1,
  },
  regionRow: { flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.md },
  regionChip: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full,
    paddingHorizontal: SPACING.md, paddingVertical: 6,
  },
  regionChipActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  regionChipText:   { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },

  sectionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  sectionLabel: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },
  availablePill: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  availablePillText: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  tile: {
    width: '48%',
    borderWidth: 1,
    borderColor: COLORS.borderNeon,
    borderRadius: RADII.md,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    aspectRatio: 1.15,
  },
  tileSelected: { borderColor: COLORS.borderBright, backgroundColor: COLORS.surfaceElevated },
  tileTopRow: { flexDirection: 'row', alignItems: 'center' },
  priorityDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.textPrimary },
  countBadge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5,
    borderWidth: 1, borderColor: COLORS.borderBright,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceElevated,
  },
  countBadgeSelected: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  countBadgeText: { fontSize: FONT_SIZE.xxs, color: COLORS.textSecondary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  tileLabel: {
    fontSize: FONT_SIZE.md, color: COLORS.textSecondary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 0.5,
  },
  tileMuscles: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5, marginTop: 2 },
  note: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    marginTop: SPACING.lg, paddingTop: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.borderDim,
  },
  noteDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.textPrimary },
  noteText: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, flex: 1 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: SPACING.screenPad,
    backgroundColor: COLORS.background,
    borderTopWidth: 1, borderTopColor: COLORS.borderDim,
  },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.textPrimary, borderRadius: RADII.full,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.md, justifyContent: 'center',
  },
  continueCheck: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontWeight: '700' },
  continueBtnText: {
    fontSize: FONT_SIZE.xs, color: COLORS.textInverse,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1.5,
  },
  continueArrow: { fontSize: FONT_SIZE.lg, color: COLORS.textInverse, marginLeft: 'auto' },
});

// ─── Exercises: list grouped by muscle ───────────────────────────────────────

function ExercisesView({
  bodyPart,
  selectedIds,
  onToggle,
  onToggleAll,
  onAddWger,
  onBack,
  defaultFilter,
  fitnessLevel,
}: {
  bodyPart: BodyPart;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], select: boolean) => void;
  onAddWger: (wger: WgerExercise) => void;
  onBack: () => void;
  defaultFilter: EquipFilter;
  fitnessLevel: AppSettings['fitnessLevel'];
}) {
  const [filter, setFilter] = useState<EquipFilter>(defaultFilter);
  const [query, setQuery] = useState('');
  const [wgerList, setWgerList] = useState<WgerExercise[]>([]);
  const [wgerLoading, setWgerLoading] = useState(true);
  const [discoverOpen, setDiscoverOpen] = useState(false);

  const muscles = getMuscleGroups(bodyPart);
  const meta = BODY_PART_META.find((m) => m.key === bodyPart)!;
  const allForBodyPart = getExercisesByBodyPart(bodyPart);
  const q = query.trim().toLowerCase();
  const allFiltered = allForBodyPart.filter(
    (e) => matchesFilter(e, filter) && (!q || e.name.toLowerCase().includes(q)),
  );
  const allSelected = allFiltered.length > 0 && allFiltered.every((e) => selectedIds.has(e.id));
  const bodyPartSelectedCount = Array.from(selectedIds).filter(
    (id) => (EXERCISES.find((e) => e.id === id)?.bodyPart === bodyPart) ||
             id.startsWith('wger_'),
  ).length;

  useEffect(() => {
    setWgerLoading(true);
    getWgerByBodyPart(bodyPart).then((list) => {
      setWgerList(list);
      setWgerLoading(false);
    }).catch(() => setWgerLoading(false));
  }, [bodyPart]);

  // Filter out wger exercises whose names already exist in local library
  const localNames = new Set(allForBodyPart.map((e) => e.name.toLowerCase()));
  const wgerUnique = wgerList.filter(
    (w) => !localNames.has(w.name.toLowerCase()) && (!q || w.name.toLowerCase().includes(q)),
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={exv.topBar}>
        <TouchableOpacity
          onPress={onBack}
          style={exv.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={exv.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={exv.bodyPartLabel}>{meta.label.toUpperCase()} EXERCISES</Text>
        {bodyPartSelectedCount > 0 && (
          <View style={exv.badge}>
            <Text style={exv.badgeText}>{bodyPartSelectedCount} SELECTED</Text>
          </View>
        )}
      </View>

      <View style={exv.searchSection}>
        <View style={exv.searchTopRow}>
          <Text style={exv.searchLabel}>FILTERS & SEARCH</Text>
          <TouchableOpacity
            onPress={() => onToggleAll(allFiltered.map((e) => e.id), !allSelected)}
            activeOpacity={0.7}
          >
            <Text style={exv.selectAllLink}>{allSelected ? 'DESELECT ALL' : 'SELECT ALL'}</Text>
          </TouchableOpacity>
        </View>
        <View style={exv.filterRow}>
          {(['all', 'bodyweight', 'gym'] as EquipFilter[]).map((f) => (
            <Chip
              key={f}
              label={f === 'all' ? 'ALL' : f === 'bodyweight' ? 'BODYWEIGHT' : 'GYM'}
              active={filter === f}
              onPress={() => setFilter(f)}
            />
          ))}
        </View>
        <View style={exv.searchBox}>
          <Text style={exv.searchIcon}>⌕</Text>
          <TextInput
            style={exv.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search movements…"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={exv.scroll}>
        {/* Local exercise library */}
        {muscles.map((muscle) => {
          // Exercises matching the user's stated fitness level surface first
          // within each muscle group — a nudge, not a hard filter, so nothing
          // that matches the equipment filter ever disappears from view.
          const exercises = allForBodyPart
            .filter((e) => e.muscle === muscle && matchesFilter(e, filter) && (!q || e.name.toLowerCase().includes(q)))
            .slice()
            .sort((a, b) => Number(b.difficulty === fitnessLevel) - Number(a.difficulty === fitnessLevel));
          if (exercises.length === 0) return null;
          return (
            <View key={muscle}>
              <SectionHeader title={muscle} />
              {exercises.map((e) => {
                const sel = selectedIds.has(e.id);
                const isTrendy = e.tags?.includes('trendelenburg');
                return (
                  <TouchableOpacity
                    key={e.id}
                    onPress={() => onToggle(e.id)}
                    activeOpacity={0.7}
                    style={[exv.row, sel && exv.rowSelected]}
                  >
                    <ExerciseImage exerciseName={e.name} size="sm" style={exv.thumb} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[exv.exName, sel && { color: COLORS.textPrimary }]}>
                          {e.name.toUpperCase()}
                        </Text>
                        {isTrendy && <View style={exv.trendyDot} />}
                      </View>
                      <View style={exv.exMetaRow}>
                        <Text style={exv.difficultyDots}>{difficultyDots(e.difficulty)}</Text>
                        <View style={exv.equipTag}>
                          <Text style={exv.equipTagText}>{e.equipment[0]?.toUpperCase() ?? 'BODYWEIGHT'}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={[exv.checkbox, sel && exv.checkboxOn]}>
                      {sel && <Text style={exv.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}

        {/* DISCOVER: additional exercises from wger */}
        <TouchableOpacity
          onPress={() => setDiscoverOpen((v) => !v)}
          activeOpacity={0.7}
          style={exv.discoverToggle}
        >
          <Text style={exv.discoverGlobe}>⊕</Text>
          <Text style={exv.discoverToggleLabel}>
            DISCOVER MORE EXERCISES{wgerUnique.length > 0 ? ` (${wgerUnique.length})` : ''}
          </Text>
          {wgerLoading
            ? <ActivityIndicator size="small" color={COLORS.textMuted} />
            : <Text style={exv.discoverArrow}>{discoverOpen ? '▲' : '▼'}</Text>
          }
        </TouchableOpacity>
        {discoverOpen && (
          <Text style={exv.discoverSubtitle}>
            Community-sourced library via wger.de. These exercises may lack step-by-step cues.
          </Text>
        )}

        {discoverOpen && !wgerLoading && (
          wgerUnique.length === 0
            ? <Text style={exv.discoverEmpty}>No additional exercises found for this body part.</Text>
            : wgerUnique.map((w) => {
                const sel = selectedIds.has(w.wgerId);
                return (
                  <TouchableOpacity
                    key={w.wgerId}
                    onPress={() => onAddWger(w)}
                    activeOpacity={0.7}
                    style={[exv.discoverRow, sel && exv.rowSelected]}
                  >
                    <View style={exv.discoverThumbWrap}>
                      <ExerciseImage exerciseName={w.name} size="sm" style={exv.thumb} />
                      <View style={exv.globeBadge}><Text style={exv.globeBadgeText}>⊕</Text></View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[exv.exName, sel && { color: COLORS.textPrimary }]}>
                          {w.name.toUpperCase()}
                        </Text>
                        {sel && <Text style={exv.addedTag}>ADDED</Text>}
                      </View>
                      <View style={exv.exMetaRow}>
                        <Text style={exv.difficultyDots}>●●○</Text>
                        <View style={exv.equipTag}>
                          <Text style={exv.equipTagText}>{(w.equipment[0] ?? 'BODYWEIGHT').toUpperCase()}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={[exv.checkbox, sel && exv.checkboxOn]}>
                      {sel && <Text style={exv.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {bodyPartSelectedCount > 0 && (
        <View style={exv.footer}>
          <TouchableOpacity onPress={onBack} style={exv.footerBtn} activeOpacity={0.8}>
            <Text style={exv.footerBtnText}>
              ADD SELECTED · {bodyPartSelectedCount} MOVEMENT{bodyPartSelectedCount !== 1 ? 'S' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const exv = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.screenPad,
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderDim, gap: SPACING.sm,
  },
  backBtn:       { padding: SPACING.xs },
  backArrow:     { fontSize: FONT_SIZE.lg, color: COLORS.textSecondary, fontFamily: FONTS.heading ?? undefined },
  bodyPartLabel: {
    flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1.5,
  },
  badge: {
    borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 4, backgroundColor: COLORS.surfaceElevated,
  },
  badgeText: { fontSize: 8, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },

  searchSection: { paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.sm },
  searchTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  searchLabel:  { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },
  selectAllLink: { fontSize: 9, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },
  filterRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.sm },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderNeon,
    borderRadius: RADII.md, paddingHorizontal: SPACING.md, marginBottom: SPACING.sm,
  },
  searchIcon:  { fontSize: FONT_SIZE.md, color: COLORS.textMuted },
  searchInput: {
    flex: 1, paddingVertical: SPACING.sm + 2,
    fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined,
  },

  scroll: { paddingHorizontal: SPACING.screenPad },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderDim,
  },
  rowSelected:   { backgroundColor: 'transparent' },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1,
    borderColor: COLORS.borderNeon, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkboxOn:    { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  checkmark:     { fontSize: 12, color: COLORS.textInverse, fontWeight: '700' },
  exName:        { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 0.5 },
  exMetaRow:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 4 },
  difficultyDots:{ fontSize: 8, color: COLORS.textMuted, letterSpacing: 1 },
  equipTag: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.xs,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  equipTagText: { fontSize: 7, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5, fontWeight: '700' },
  trendyDot:     { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.textPrimary },
  thumb:         { width: 52, height: 52, borderRadius: RADII.sm, flexShrink: 0 },

  discoverToggle: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    paddingVertical: SPACING.sm, marginTop: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.borderDim,
  },
  discoverGlobe:       { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  discoverToggleLabel: { flex: 1, fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },
  discoverArrow:       { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted },
  discoverSubtitle:    { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, lineHeight: 14, marginBottom: SPACING.sm },
  discoverEmpty:       { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, paddingVertical: SPACING.sm },
  discoverRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderDim,
  },
  discoverThumbWrap: { position: 'relative' },
  globeBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.surfaceSolid,
    borderWidth: 1, borderColor: COLORS.borderBright, alignItems: 'center', justifyContent: 'center',
  },
  globeBadgeText: { fontSize: 8, color: COLORS.textSecondary },
  addedTag: {
    fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined,
    letterSpacing: 1, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.xs, paddingHorizontal: 4, paddingVertical: 1,
  },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: SPACING.screenPad, backgroundColor: COLORS.background,
    borderTopWidth: 1, borderTopColor: COLORS.borderDim,
  },
  footerBtn: {
    backgroundColor: COLORS.textPrimary, borderRadius: RADII.full,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  footerBtnText: {
    fontSize: FONT_SIZE.xs, color: COLORS.textInverse,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1.5,
  },
});

// ─── Setup: review + time picker ─────────────────────────────────────────────

interface OrderRow {
  id: string;
  exercise: Exercise;
  sets: number;
  totalSeconds: number;
}

function buildOrderRows(ids: string[], phases: Phase[], extras: ReadonlyMap<string, Exercise>): OrderRow[] {
  return ids.map((id) => {
    const exercise = EXERCISES.find((e) => e.id === id) ?? extras.get(id);
    const exPhases = phases.filter((p) => p.exerciseId === id);
    const sets = exPhases.reduce((max, p) => Math.max(max, p.totalSets ?? 0), 0);
    const totalSeconds = exPhases.reduce((sum, p) => sum + p.durationSeconds, 0);
    return { id, exercise: exercise!, sets, totalSeconds };
  }).filter((r): r is OrderRow => !!r.exercise);
}

function SetupView({
  orderedIds,
  extraExercises,
  onRemove,
  onReorder,
  onAddMore,
  targetMinutes,
  setTargetMinutes,
  exerciseCount,
  setExerciseCount,
  onStart,
  weekActiveDays,
  annualTarget,
}: {
  orderedIds: string[];
  extraExercises: ReadonlyMap<string, Exercise>;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onAddMore: () => void;
  targetMinutes: number;
  setTargetMinutes: (m: number) => void;
  exerciseCount: number;
  setExerciseCount: (n: number) => void;
  onStart: () => void;
  weekActiveDays: number;
  annualTarget: number;
}) {
  const ids = orderedIds;
  const sessionIds = ids.slice(0, exerciseCount);
  const sessionsPerWeek = Math.round(annualTarget / WEEKS_PER_YEAR);
  const remaining = Math.max(0, sessionsPerWeek - weekActiveDays);

  const plan = sessionIds.length > 0 ? buildSessionPlan(sessionIds, targetMinutes, extraExercises) : [];
  // The actual duration of the (compressed-to-fit) plan — not a fixed-table
  // guess — so this only disagrees with your target when even the floors
  // couldn't make it fit.
  const estimatedMins = Math.round(plan.reduce((s, p) => s + p.durationSeconds, 0) / 60);
  const comfortableMins = sessionIds.length > 0 ? planEstimatedMinutes(sessionIds, extraExercises) : 0;

  const exercises = ids
    .map((id) => EXERCISES.find((e) => e.id === id) ?? extraExercises.get(id))
    .filter((e): e is Exercise => !!e);
  const hasNoHips = !exercises.some((e) => e.bodyPart === 'HIPS' || e.bodyPart === 'GLUTES');
  const overTime = estimatedMins > targetMinutes + 10;
  const underTime = estimatedMins < targetMinutes - 10;
  const intensity: IntensityLevel = sessionIds.length > 0 ? estimateSessionIntensity(sessionIds, targetMinutes, extraExercises) : 'LOW';

  const orderRows = buildOrderRows(ids, plan, extraExercises);

  const moveRow = useCallback((index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  }, [ids, onReorder]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={setup.scroll} showsVerticalScrollIndicator={false}>
        {/* Estimated duration */}
        <View style={[setup.estimateCard, overTime && setup.estimateCardWarn]}>
          <View style={setup.estimateTopRow}>
            <View>
              <Text style={setup.estimateLabel}>ESTIMATED DURATION</Text>
              <View style={setup.estimateValueRow}>
                <Text style={setup.estimateValue}>{estimatedMins}</Text>
                <Text style={setup.estimateUnit}>MIN</Text>
              </View>
            </View>
            {(overTime || underTime) && (
              <View style={setup.warnCircle}>
                <Text style={setup.warnCircleText}>!</Text>
              </View>
            )}
          </View>
          {overTime && (
            <View style={setup.warnBanner}>
              <Text style={setup.warnBannerText}>
                ⚠ WARNING: PLAN EXCEEDS YOUR {targetMinutes}M BUDGET
              </Text>
            </View>
          )}
          {underTime && (
            <View style={setup.warnBanner}>
              <Text style={setup.warnBannerText}>
                UNDER BUDGET — CONSIDER ADDING AN EXERCISE
              </Text>
            </View>
          )}
          {!overTime && intensity !== 'LOW' && comfortableMins > estimatedMins && (
            <Text style={setup.compressionHint}>
              Compressed from a comfortable ~{comfortableMins}m to fit your {targetMinutes}m budget.
            </Text>
          )}
          <View style={setup.statsRow}>
            <View>
              <Text style={setup.statLabel}>EXERCISES</Text>
              <Text style={setup.statValue}>
                {exerciseCount}{ids.length !== exerciseCount ? ` / ${ids.length}` : ''} In Session
              </Text>
            </View>
            <View>
              <Text style={setup.statLabel}>INTENSITY</Text>
              <Text style={setup.statValue}>{intensity}</Text>
            </View>
          </View>
        </View>

        {hasNoHips && (
          <View style={setup.nudge}>
            <Text style={setup.nudgeText}>
              TIP: Adding HIPS or GLUTES work supports your gait stability goals
            </Text>
          </View>
        )}

        {/* Time budget */}
        <View style={setup.timeSectionRow}>
          <Text style={setup.sectionLabel}>TIME BUDGET</Text>
          <Text style={setup.sectionLabelDim}>TARGETS</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }}>
          <View style={{ flexDirection: 'row', gap: SPACING.xs }}>
            {TIME_OPTIONS.map((min) => (
              <TouchableOpacity
                key={min}
                onPress={() => setTargetMinutes(min)}
                activeOpacity={0.7}
                style={[setup.timeChip, targetMinutes === min && setup.timeChipActive]}
              >
                <Text style={[setup.timeChipText, targetMinutes === min && { color: COLORS.textInverse }]}>
                  {min}
                </Text>
                <Text style={[setup.timeChipUnit, targetMinutes === min && { color: COLORS.textInverse }]}>
                  MIN
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Exercise count */}
        <View style={setup.timeSectionRow}>
          <Text style={setup.sectionLabel}>EXERCISE COUNT</Text>
          <Text style={setup.sectionLabelDim}>HOW MANY THIS SESSION</Text>
        </View>
        <View style={setup.countRow}>
          <TouchableOpacity
            onPress={() => setExerciseCount(Math.max(1, exerciseCount - 1))}
            disabled={exerciseCount <= 1}
            style={[setup.countBtn, exerciseCount <= 1 && { opacity: 0.3 }]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Decrease exercise count"
          >
            <Text style={setup.countBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={setup.countValue}>{exerciseCount}</Text>
          <TouchableOpacity
            onPress={() => setExerciseCount(Math.min(ids.length, exerciseCount + 1))}
            disabled={exerciseCount >= ids.length}
            style={[setup.countBtn, exerciseCount >= ids.length && { opacity: 0.3 }]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Increase exercise count"
          >
            <Text style={setup.countBtnText}>+</Text>
          </TouchableOpacity>
          <Text style={setup.countHint}>of {ids.length} selected</Text>
        </View>

        {/* Session order */}
        <View style={setup.timeSectionRow}>
          <Text style={setup.sectionLabel}>SESSION ORDER</Text>
          <Text style={setup.sectionLabelDim}>TAP ▲▼ TO REORDER</Text>
        </View>
        {orderRows.map((row, i) => {
          const inSession = i < exerciseCount;
          return (
          <View key={row.id} style={[setup.orderRow, !inSession && { opacity: 0.4 }]}>
            <View style={setup.orderReorderCol}>
              <TouchableOpacity
                onPress={() => moveRow(i, -1)}
                disabled={i === 0}
                hitSlop={6}
                activeOpacity={0.7}
              >
                <Text style={[setup.orderArrow, i === 0 && { opacity: 0.25 }]}>▲</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => moveRow(i, 1)}
                disabled={i === orderRows.length - 1}
                hitSlop={6}
                activeOpacity={0.7}
              >
                <Text style={[setup.orderArrow, i === orderRows.length - 1 && { opacity: 0.25 }]}>▼</Text>
              </TouchableOpacity>
            </View>
            <ExerciseImage exerciseName={row.exercise.name} size="sm" style={setup.orderThumb} />
            <View style={{ flex: 1 }}>
              <Text style={setup.orderName} numberOfLines={1}>{row.exercise.name.toUpperCase()}</Text>
              <Text style={setup.orderMeta}>
                {inSession ? `${row.sets > 0 ? `${row.sets} SETS · ` : ''}${row.exercise.type.toUpperCase()}` : 'NOT IN SESSION — REORDER OR RAISE COUNT'}
              </Text>
            </View>
            {inSession && (
              <View style={setup.orderTimeChip}>
                <Text style={setup.orderTimeText}>⏱ {Math.round(row.totalSeconds / 60)}M</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => onRemove(row.id)}
              hitSlop={10}
              activeOpacity={0.7}
              style={{ marginLeft: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${row.exercise.name}`}
            >
              <Text style={setup.removeBtn}>×</Text>
            </TouchableOpacity>
          </View>
          );
        })}

        <TouchableOpacity onPress={onAddMore} style={setup.addMore} activeOpacity={0.7}>
          <Text style={setup.addMoreText}>+ ADD FINISHING EXERCISE</Text>
        </TouchableOpacity>

        <View style={setup.pacing}>
          <Text style={setup.pacingLabel}>WEEKLY GOAL PACE</Text>
          <Text style={setup.pacingValue}>
            {sessionsPerWeek} sessions/week · {weekActiveDays} done · {remaining} remaining
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={setup.footer}>
        <TouchableOpacity
          onPress={onStart}
          activeOpacity={0.8}
          style={[setup.startBtn, ids.length === 0 && { opacity: 0.4 }]}
          disabled={ids.length === 0}
        >
          <View>
            <Text style={setup.startBtnSub}>CONFIRM PLAN</Text>
            <Text style={setup.startBtnText}>START SESSION</Text>
          </View>
          <Text style={setup.startBtnArrow}>▷</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const setup = StyleSheet.create({
  scroll: { padding: SPACING.screenPad },

  estimateCard: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.lg,
    padding: SPACING.md, backgroundColor: COLORS.surface, marginBottom: SPACING.md,
  },
  estimateCardWarn: { borderColor: COLORS.amber },
  estimateTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  estimateLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginBottom: 4 },
  estimateValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  estimateValue: { fontSize: FONT_SIZE.xxxl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  estimateUnit:  { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined },
  warnCircle: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: COLORS.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  warnCircleText: { fontSize: FONT_SIZE.sm, color: COLORS.amber, fontWeight: '700' },
  warnBanner: {
    borderWidth: 1, borderColor: COLORS.amber, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, marginTop: SPACING.sm,
  },
  warnBannerText: { fontSize: 9, color: COLORS.amber, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5, fontWeight: '700' },
  compressionHint: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.body ?? undefined, marginTop: SPACING.sm, lineHeight: 15 },
  statsRow: {
    flexDirection: 'row', gap: SPACING.xl, marginTop: SPACING.md,
    paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderDim,
  },
  statLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginBottom: 3 },
  statValue: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },

  nudge: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderBright,
    borderRadius: RADII.sm, padding: SPACING.sm, marginBottom: SPACING.md,
  },
  nudgeText: { fontSize: FONT_SIZE.xxs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5, lineHeight: 16 },

  timeSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  sectionLabel:    { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },
  sectionLabelDim: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },

  timeChip: {
    minWidth: 56, borderWidth: 1, borderColor: COLORS.borderNeon,
    borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  timeChipActive:{ borderColor: COLORS.textPrimary, backgroundColor: COLORS.textPrimary },
  timeChipText:  { fontSize: FONT_SIZE.lg, color: COLORS.textMuted, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  timeChipUnit:  { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },

  countRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  countBtn: {
    width: 36, height: 36, borderRadius: RADII.sm, borderWidth: 1, borderColor: COLORS.borderNeon,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface,
  },
  countBtnText: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  countValue: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  countHint: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5 },

  orderRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.md, padding: SPACING.sm, marginBottom: SPACING.xs,
  },
  orderReorderCol: { alignItems: 'center', gap: 2, width: 16 },
  orderArrow: { fontSize: 9, color: COLORS.textMuted },
  orderThumb: { width: 44, height: 44, borderRadius: RADII.sm, flexShrink: 0 },
  orderName: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 0.3 },
  orderMeta: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5, marginTop: 3 },
  orderTimeChip: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  orderTimeText: { fontSize: 9, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined },
  removeBtn: { fontSize: FONT_SIZE.lg, color: COLORS.textMuted, lineHeight: FONT_SIZE.lg * 1.2 },

  addMore: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.md,
    borderStyle: 'dashed', paddingVertical: SPACING.sm,
    alignItems: 'center', marginVertical: SPACING.sm,
  },
  addMoreText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },

  pacing: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.sm,
    padding: SPACING.sm, marginTop: SPACING.xs,
  },
  pacingLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginBottom: 3 },
  pacingValue: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: SPACING.screenPad, backgroundColor: COLORS.background,
    borderTopWidth: 1, borderTopColor: COLORS.borderDim,
  },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.textPrimary, borderRadius: RADII.md,
    paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.md,
  },
  startBtnSub: { fontSize: 8, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, opacity: 0.6 },
  startBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  startBtnArrow: { fontSize: FONT_SIZE.lg, color: COLORS.textInverse },
});

// ─── Active: guided session ───────────────────────────────────────────────────

function ActiveView({
  phases,
  phaseIndex,
  phaseTimeLeft,
  totalElapsed,
  paused,
  completedIds,
  extraExercises,
  onPause,
  onSkip,
  onSkipExercise,
  onAdjustTime,
  onEnd,
}: {
  phases: Phase[];
  phaseIndex: number;
  phaseTimeLeft: number;
  totalElapsed: number;
  paused: boolean;
  completedIds: Set<string>;
  extraExercises: ReadonlyMap<string, Exercise>;
  onPause: () => void;
  onSkip: () => void;
  onSkipExercise: () => void;
  onAdjustTime: (deltaSeconds: number) => void;
  onEnd: () => void;
}) {
  const [showInstructions, setShowInstructions] = useState(true);
  const phase = phases[phaseIndex];
  const nextPhase = phases[phaseIndex + 1];
  const isRest = phase?.kind === 'rest-set' || phase?.kind === 'rest-exercise';
  const isWork = phase?.kind === 'work';
  const exercise = phase?.exerciseId
    ? (EXERCISES.find((e) => e.id === phase.exerciseId) ?? extraExercises.get(phase.exerciseId))
    : undefined;
  const instructions = phase?.exerciseId ? EXERCISE_INSTRUCTIONS[phase.exerciseId] : undefined;
  const completedCount = completedIds.size;
  const totalExercises = new Set(phases.filter(p => p.exerciseId).map(p => p.exerciseId)).size;
  const overallProgress = phases.length > 0 ? phaseIndex / phases.length : 0;

  // Auto-open instructions for each new work phase
  useEffect(() => {
    setShowInstructions(true);
  }, [phaseIndex]);

  if (!phase) return null;

  const setLabel = phase.kind === 'warmup'          ? 'WARM UP'
                 : phase.kind === 'cooldown'        ? 'COOL DOWN'
                 : phase.kind === 'rest-set'        ? 'REST'
                 : phase.kind === 'rest-exercise'   ? 'TRANSITION REST'
                 : `SET ${phase.setNumber ?? 1} OF ${phase.totalSets ?? 1}`;

  return (
    <View style={{ flex: 1 }}>
      {/* Custom header */}
      <View style={actv.header}>
        <Text style={actv.headerTitle}>{setLabel}</Text>
        <TouchableOpacity onPress={onEnd} activeOpacity={0.7} style={actv.endBtn}>
          <Text style={actv.endBtnText}>End Session</Text>
        </TouchableOpacity>
      </View>
      <View style={actv.progressTrack}>
        <View style={[actv.progressFill, { width: `${overallProgress * 100}%` as any }]} />
      </View>

      <ScrollView contentContainerStyle={actv.scroll} showsVerticalScrollIndicator={false}>
        <Text style={actv.metaLine}>
          PHASE {phaseIndex + 1} OF {phases.length}  •  ELAPSED {formatTime(totalElapsed)}
        </Text>

        {/* Countdown */}
        <Text style={actv.timer}>{formatTime(phaseTimeLeft)}</Text>
        <View style={actv.timeAdjustRow}>
          <TouchableOpacity onPress={() => onAdjustTime(10)} activeOpacity={0.7} style={actv.timeAdjustBtn}>
            <Text style={actv.timeAdjustText}>+10s</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onAdjustTime(-10)} activeOpacity={0.7} style={actv.timeAdjustBtn}>
            <Text style={actv.timeAdjustText}>-10s</Text>
          </TouchableOpacity>
        </View>

        {/* Exercise photo */}
        {isWork && exercise && (
          <View style={actv.photoWrap}>
            <ExerciseImage exerciseName={exercise.name} size="lg" style={actv.exerciseImg} />
            <View style={actv.activeBadge}><Text style={actv.activeBadgeText}>ACTIVE</Text></View>
          </View>
        )}

        {isWork && exercise && (
          <>
            <Text style={actv.exerciseName}>{exercise.name.toUpperCase()}</Text>
            <View style={actv.metaRow}>
              <View style={actv.metaChip}>
                <Text style={actv.metaChipIcon}>⚭</Text>
                <Text style={actv.metaChipText}>{(exercise.equipment[0] ?? 'BODYWEIGHT').toUpperCase()}</Text>
              </View>
              {phase.repsLabel && (
                <View style={actv.metaChip}>
                  <Text style={actv.metaChipIcon}>⚡</Text>
                  <Text style={actv.metaChipText}>{phase.repsLabel.toUpperCase()}</Text>
                </View>
              )}
            </View>
          </>
        )}

        {!isWork && (
          <Text style={actv.restLabel}>{phase.sublabel}</Text>
        )}

        {/* Form cues */}
        {isWork && instructions && (
          <View style={actv.instructionBlock}>
            <TouchableOpacity
              onPress={() => setShowInstructions((v) => !v)}
              activeOpacity={0.7}
              style={actv.instructionToggle}
            >
              <Text style={actv.instructionToggleLabel}>FORM CUES ({instructions.length})</Text>
              <Text style={actv.instructionArrow}>{showInstructions ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showInstructions && (
              <View style={actv.instructionList}>
                {instructions.map((cue, i) => (
                  <View key={i} style={actv.cueRow}>
                    <Text style={actv.cueNum}>{String(i + 1).padStart(2, '0')}</Text>
                    <Text style={actv.cueText}>{cue}</Text>
                  </View>
                ))}
                {exercise?.tags?.includes('trendelenburg') && (
                  <View style={actv.cueTrendNote}>
                    <View style={actv.cueTrendDot} />
                    <Text style={actv.cueTrendText}>Targets gait stability</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {isWork && !instructions && exercise && (
          <View style={actv.genericCue}>
            <Text style={actv.genericCueText}>
              Focus: {exercise.muscle} · Equipment: {exercise.equipment.slice(0, 2).join(', ')}
            </Text>
            <Text style={actv.genericCueText}>Keep core braced · Breathe out on exertion</Text>
          </View>
        )}

        {/* Up next */}
        {nextPhase && (
          <TouchableOpacity style={actv.nextBlock} activeOpacity={0.7} onPress={onSkip}>
            <View style={actv.nextIcon}><Text style={actv.nextIconText}>⚭</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={actv.nextLabel}>UP NEXT</Text>
              <Text style={actv.nextValue}>{phase.nextLabel ?? nextPhase.label}</Text>
            </View>
            <Text style={actv.nextArrow}>›</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Controls */}
      <View style={actv.controlsRow}>
        <TouchableOpacity
          onPress={onSkip}
          activeOpacity={0.7}
          style={actv.circleBtn}
          accessibilityRole="button"
          accessibilityLabel="Skip to next phase"
        >
          <Text style={actv.circleBtnText}>▶│</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPause} activeOpacity={0.8} style={actv.pauseBtn}>
          <Text style={actv.pauseBtnText}>{paused ? '▶  Resume' : '❙❙  Pause'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowInstructions((v) => !v)}
          activeOpacity={0.7}
          style={actv.circleBtn}
          accessibilityRole="button"
          accessibilityLabel={showInstructions ? 'Hide instructions' : 'Show instructions'}
        >
          <Text style={actv.circleBtnText}>ⓘ</Text>
        </TouchableOpacity>
      </View>
      {phase?.exerciseId && (
        <TouchableOpacity onPress={onSkipExercise} activeOpacity={0.7} style={{ paddingBottom: SPACING.md }}>
          <Text style={actv.skipExerciseLink}>Skip to next exercise</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const actv = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.sm, paddingBottom: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZE.md, color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1,
  },
  endBtn: {
    borderWidth: 1, borderColor: COLORS.red, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: 5,
  },
  endBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.red, fontFamily: FONTS.bodyMedium ?? undefined },

  progressTrack: { height: 2, backgroundColor: COLORS.borderNeon, marginHorizontal: SPACING.screenPad, borderRadius: RADII.full, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: COLORS.textPrimary, borderRadius: RADII.full },

  scroll: { padding: SPACING.screenPad, alignItems: 'center' },
  metaLine: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginTop: SPACING.sm },
  timer: {
    fontSize: 64, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700',
    letterSpacing: -3, lineHeight: 70, marginVertical: SPACING.xs,
  },
  timeAdjustRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  timeAdjustBtn: {
    borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.full,
    paddingHorizontal: SPACING.md, paddingVertical: 5, backgroundColor: COLORS.surfaceElevated,
  },
  timeAdjustText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700' },

  photoWrap: { width: '100%', position: 'relative', marginBottom: SPACING.md },
  exerciseImg: { width: '100%', height: 200, borderRadius: RADII.md },
  activeBadge: {
    position: 'absolute', top: SPACING.sm, left: SPACING.sm,
    backgroundColor: COLORS.textPrimary, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  activeBadgeText: { fontSize: 8, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },

  exerciseName: {
    fontSize: FONT_SIZE.xl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined,
    fontWeight: '700', letterSpacing: -0.3, textAlign: 'center', width: '100%',
  },
  metaRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, marginBottom: SPACING.md },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 5,
  },
  metaChipIcon: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  metaChipText: { fontSize: 9, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },

  restLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, textAlign: 'center', letterSpacing: 0.5, marginBottom: SPACING.md },

  instructionBlock: {
    width: '100%', borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.md,
    overflow: 'hidden', marginBottom: SPACING.md,
  },
  instructionToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: SPACING.sm, backgroundColor: COLORS.surface,
  },
  instructionToggleLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  instructionArrow:       { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted },
  instructionList:        { padding: SPACING.sm, gap: SPACING.sm },
  cueRow:          { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start' },
  cueNum: {
    width: 18, fontSize: FONT_SIZE.xxs, color: COLORS.textMuted,
    fontFamily: FONTS.mono ?? undefined, marginTop: 2, flexShrink: 0,
  },
  cueText:         { flex: 1, fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined, lineHeight: 18 },
  cueTrendNote:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.xs, paddingTop: SPACING.xs, borderTopWidth: 1, borderTopColor: COLORS.borderDim },
  cueTrendDot:     { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.textPrimary },
  cueTrendText:    { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  genericCue: {
    width: '100%', borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.md,
    padding: SPACING.sm, marginBottom: SPACING.md, gap: 4,
  },
  genericCueText:  { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5 },

  nextBlock: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.md,
    padding: SPACING.sm, marginBottom: SPACING.md, backgroundColor: COLORS.surface,
  },
  nextIcon: {
    width: 34, height: 34, borderRadius: RADII.sm,
    borderWidth: 1, borderColor: COLORS.borderDim, backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  nextIconText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  nextLabel:    { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, marginBottom: 2 },
  nextValue:    { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  nextArrow:    { fontSize: FONT_SIZE.lg, color: COLORS.textMuted },

  controlsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.screenPad, paddingBottom: SPACING.sm,
  },
  circleBtn: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1, borderColor: COLORS.borderNeon, backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  circleBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  pauseBtn: {
    flex: 1, maxWidth: 200, backgroundColor: COLORS.textPrimary, borderRadius: RADII.full,
    paddingVertical: SPACING.sm + 2, alignItems: 'center',
  },
  pauseBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  skipExerciseLink: {
    fontSize: FONT_SIZE.xs, color: COLORS.textMuted, textAlign: 'center',
    textDecorationLine: 'underline',
  },
});

// ─── Complete ─────────────────────────────────────────────────────────────────

interface LoggedInput { weightKg: string; reps: string; tooHeavy: boolean }

function CompleteView({
  totalElapsed,
  selectedIds,
  completedIds,
  phases,
  phaseIndex,
  programExercises,
  loggedWeights,
  onChangeLoggedWeight,
  onToggleTooHeavy,
  onSave,
}: {
  totalElapsed: number;
  selectedIds: Set<string>;
  completedIds: Set<string>;
  phases: Phase[];
  phaseIndex: number;
  programExercises?: { exerciseId: string; name: string; targetSets: number; targetReps: string; currentWeightKg: number }[];
  loggedWeights: Record<string, LoggedInput>;
  onChangeLoggedWeight: (exerciseId: string, field: 'weightKg' | 'reps', value: string) => void;
  onToggleTooHeavy: (exerciseId: string) => void;
  onSave: () => void;
}) {
  const mins = Math.max(1, Math.floor(totalElapsed / 60));
  const done = completedIds.size;
  const total = selectedIds.size;
  const phasesCompleted = Math.min(phaseIndex, phases.length);
  const phasePct = phases.length > 0 ? Math.round((phasesCompleted / phases.length) * 100) : 0;

  return (
    <ScrollView contentContainerStyle={complete.wrap} showsVerticalScrollIndicator={false}>
      <Text style={complete.heading}>SESSION{'\n'}COMPLETE</Text>
      <View style={complete.statsRow}>
        <View style={complete.stat}>
          <Text style={complete.statVal}>{mins}</Text>
          <Text style={complete.statUnit}>MIN</Text>
        </View>
        <View style={complete.statDivider} />
        <View style={complete.stat}>
          <Text style={complete.statVal}>{done}</Text>
          <Text style={complete.statUnit}>EXERCISES DONE</Text>
        </View>
        <View style={complete.statDivider} />
        <View style={complete.stat}>
          <Text style={complete.statVal}>{phasePct}%</Text>
          <Text style={complete.statUnit}>PLAN DONE</Text>
        </View>
      </View>

      {programExercises && programExercises.length > 0 && (
        <View style={complete.logSection}>
          <Text style={complete.logTitle}>LOG TODAY'S LIFTS</Text>
          <Text style={complete.logSub}>So Vitalis AI can suggest next week's weight — leave a row blank to skip logging it.</Text>
          {programExercises.map((e) => {
            const entry = loggedWeights[e.exerciseId] ?? { weightKg: String(e.currentWeightKg), reps: '', tooHeavy: false };
            return (
              <View key={e.exerciseId} style={complete.logRow}>
                <Text style={complete.logExName} numberOfLines={1}>{e.name}</Text>
                <Text style={complete.logExTarget}>{e.targetSets}×{e.targetReps} target</Text>
                <View style={complete.logInputsRow}>
                  <View style={complete.logInputCol}>
                    <Text style={complete.logInputLabel}>KG</Text>
                    <TextInput
                      style={complete.logInput}
                      value={entry.weightKg}
                      onChangeText={(v) => onChangeLoggedWeight(e.exerciseId, 'weightKg', v)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={complete.logInputCol}>
                    <Text style={complete.logInputLabel}>REPS</Text>
                    <TextInput
                      style={complete.logInput}
                      value={entry.reps}
                      onChangeText={(v) => onChangeLoggedWeight(e.exerciseId, 'reps', v)}
                      keyboardType="number-pad"
                      placeholder="—"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => onToggleTooHeavy(e.exerciseId)}
                    activeOpacity={0.7}
                    style={[complete.tooHeavyBtn, entry.tooHeavy && complete.tooHeavyBtnActive]}
                  >
                    <Text style={[complete.tooHeavyText, entry.tooHeavy && { color: COLORS.textInverse }]}>TOO HEAVY</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <TouchableOpacity onPress={onSave} activeOpacity={0.8} style={complete.saveBtn}>
        <Text style={complete.saveBtnText}>SAVE & CLOSE</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const complete = StyleSheet.create({
  wrap:        { flex: 1, padding: SPACING.screenPad, justifyContent: 'center', alignItems: 'center', gap: SPACING.xl },
  heading: {
    fontSize: 44, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined,
    fontWeight: '700', letterSpacing: -1, textAlign: 'center', lineHeight: 50,
  },
  statsRow:    { flexDirection: 'row', borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.sm, overflow: 'hidden' },
  stat:        { flex: 1, alignItems: 'center', paddingVertical: SPACING.md, gap: 4 },
  statVal:     { fontSize: FONT_SIZE.xxl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  statUnit:    { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: COLORS.borderDim },
  saveBtn: {
    backgroundColor: COLORS.textPrimary, borderRadius: RADII.sm,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.xxl,
    alignSelf: 'stretch', alignItems: 'center',
  },
  saveBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 2 },

  logSection: { alignSelf: 'stretch', gap: SPACING.sm },
  logTitle: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },
  logSub: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, lineHeight: 15, marginBottom: SPACING.xs },
  logRow: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.md,
    padding: SPACING.sm + 2, gap: 6,
  },
  logExName: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.bodySemi ?? undefined, fontWeight: '600' },
  logExTarget: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined },
  logInputsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm, marginTop: 2 },
  logInputCol: { gap: 4 },
  logInputLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  logInput: {
    width: 64, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: 6, color: COLORS.textPrimary,
    fontFamily: FONTS.body ?? undefined, fontSize: FONT_SIZE.sm, textAlign: 'center',
    backgroundColor: COLORS.surface,
  },
  tooHeavyBtn: {
    flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm,
    paddingVertical: 8, alignItems: 'center', justifyContent: 'center',
  },
  tooHeavyBtnActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  tooHeavyText: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },
});

// ─── Shared UI ────────────────────────────────────────────────────────────────

const ui = StyleSheet.create({
  sectionHeader: {
    fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined,
    letterSpacing: 2, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderDim,
    marginBottom: 2,
  },
  chip: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
  },
  chipActive:  { borderColor: COLORS.borderBright, backgroundColor: COLORS.surfaceElevated },
  chipText:    { fontSize: 9, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },
});

// ─── Modal header ─────────────────────────────────────────────────────────────

function ModalHeader({
  step,
  onClose,
  onBack,
}: {
  step: Step;
  onClose: () => void;
  onBack: (() => void) | null;
}) {
  const titles: Record<Step, string> = {
    browse:   'BUILD WORKOUT',
    exercises:'EXERCISES',
    setup:    'SESSION SETUP',
    active:   'ACTIVE SESSION',
    complete: '',
  };
  return (
    <View style={hdr.row}>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={hdr.btn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={hdr.backText}>←</Text>
        </TouchableOpacity>
      ) : (
        <View style={hdr.btn} />
      )}
      <Text style={hdr.title}>{titles[step]}</Text>
      <TouchableOpacity
        onPress={onClose}
        style={hdr.btn}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Text style={hdr.closeText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

const hdr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.screenPad, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderDim,
  },
  btn:       { width: 36, alignItems: 'center' },
  title: {
    flex: 1, textAlign: 'center',
    fontSize: FONT_SIZE.xs, color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 2,
  },
  backText:  { fontSize: FONT_SIZE.lg, color: COLORS.textSecondary },
  closeText: { fontSize: FONT_SIZE.xl, color: COLORS.textMuted, lineHeight: FONT_SIZE.xl * 1.2 },
});

// ─── WorkoutModal ─────────────────────────────────────────────────────────────

export function WorkoutModal({ visible, onClose, onComplete, weekActiveDays, annualTarget = ANNUAL_TARGET_DEFAULT, programDay }: Props) {
  const [step, setStep]                      = useState<Step>('browse');
  const [activeBodyPart, setActiveBodyPart]  = useState<BodyPart | null>(null);
  const [selectedIds, setSelectedIds]        = useState<Set<string>>(new Set());
  const [orderedIds, setOrderedIds]          = useState<string[]>([]);
  const [exerciseCount, setExerciseCount]    = useState(0);
  const [sessionIds, setSessionIds]          = useState<string[]>([]);
  const [completedIds, setCompletedIds]      = useState<Set<string>>(new Set());
  const [targetMinutes, setTargetMinutes]    = useState(45);
  const [paused, setPaused]                  = useState(false);
  const [phases, setPhases]                  = useState<Phase[]>([]);
  const [phaseIndex, setPhaseIndex]          = useState(0);
  const [phaseTimeLeft, setPhaseTimeLeft]    = useState(0);
  const [totalElapsed, setTotalElapsed]      = useState(0);
  const [extraExercises, setExtraExercises]  = useState<Map<string, Exercise>>(new Map());
  const [defaultFilter, setDefaultFilter]    = useState<EquipFilter>('all');
  const [fitnessLevel, setFitnessLevel]      = useState<AppSettings['fitnessLevel']>('intermediate');
  const [loggedWeights, setLoggedWeights]    = useState<Record<string, LoggedInput>>({});
  const timerRef                             = useRef<ReturnType<typeof setInterval> | null>(null);
  const phasesRef                            = useRef<Phase[]>([]);
  const prevOrderedLenRef                    = useRef(0);

  // Pre-select today's program exercises and jump straight to setup for
  // review — still fully editable/removable there, matching an ad-hoc
  // session's flow from that point on.
  useEffect(() => {
    if (!visible || !programDay || programDay.exercises.length === 0) return;
    const ids = programDay.exercises.map((e) => e.exerciseId);
    setSelectedIds(new Set(ids));
    setOrderedIds(ids);
    setStep('setup');
    const init: Record<string, LoggedInput> = {};
    programDay.exercises.forEach((e) => {
      init[e.exerciseId] = { weightKg: String(e.currentWeightKg), reps: '', tooHeavy: false };
    });
    setLoggedWeights(init);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, programDay]);

  // Prefetch wger data so it's ready when user opens exercise view, and pick
  // up equipment/fitness-level preferences from onboarding for this session.
  useEffect(() => {
    if (!visible) return;
    prefetchWger();
    getSettings().then((s) => {
      setDefaultFilter(s.equipmentAccess);
      setFitnessLevel(s.fitnessLevel);
    }).catch(() => {});
  }, [visible]);

  // Exercise count defaults to "all selected" and grows with newly-added
  // exercises, but a manual reduction sticks until the list shrinks below it.
  useEffect(() => {
    if (orderedIds.length > prevOrderedLenRef.current) {
      setExerciseCount(orderedIds.length);
    } else if (exerciseCount > orderedIds.length) {
      setExerciseCount(Math.max(1, orderedIds.length));
    }
    prevOrderedLenRef.current = orderedIds.length;
  }, [orderedIds.length, exerciseCount]);

  // Reset on close
  useEffect(() => {
    if (!visible) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setStep('browse');
      setActiveBodyPart(null);
      setSelectedIds(new Set());
      setOrderedIds([]);
      setExerciseCount(0);
      setSessionIds([]);
      setCompletedIds(new Set());
      setTargetMinutes(45);
      setPaused(false);
      setPhases([]);
      setPhaseIndex(0);
      setPhaseTimeLeft(0);
      setTotalElapsed(0);
      setExtraExercises(new Map());
      setLoggedWeights({});
      phasesRef.current = [];
      prevOrderedLenRef.current = 0;
    }
  }, [visible]);

  const handleAddWgerExercise = useCallback((wger: WgerExercise) => {
    const localEx = wgerToExercise(wger);
    setExtraExercises((prev) => new Map([...prev, [localEx.id, localEx]]));
    setSelectedIds((prev) => new Set([...prev, localEx.id]));
    setOrderedIds((prev) => (prev.includes(localEx.id) ? prev : [...prev, localEx.id]));
  }, []);

  // Main interval — ticks every second when active and not paused
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (step !== 'active' || paused) return;
    timerRef.current = setInterval(() => {
      setTotalElapsed((e) => e + 1);
      setPhaseTimeLeft((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [step, paused]);

  // Phase transition — fires when phaseTimeLeft hits 0 during active session.
  // Skipped while paused so the +10s/-10s adjuster can't auto-advance a
  // paused phase; re-checked when the user resumes in case time is still 0.
  useEffect(() => {
    if (step !== 'active' || paused || phaseTimeLeft !== 0 || phasesRef.current.length === 0) return;
    advancePhase();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseTimeLeft, step, paused]);

  const advancePhase = useCallback(() => {
    const plan = phasesRef.current;
    setPhaseIndex((pi) => {
      const current = plan[pi];
      if (current?.autoComplete && current.exerciseId) {
        setCompletedIds((prev) => new Set([...prev, current.exerciseId!]));
      }
      const next = pi + 1;
      if (next >= plan.length) {
        setStep('complete');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return next;
      }
      setPhaseTimeLeft(plan[next].durationSeconds);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return next;
    });
  }, []);

  const toggleExercise = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setOrderedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const toggleAllExercises = useCallback((ids: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (select) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
    setOrderedIds((prev) => {
      if (select) {
        const additions = ids.filter((id) => !prev.includes(id));
        return [...prev, ...additions];
      }
      return prev.filter((id) => !ids.includes(id));
    });
  }, []);

  const removeExercise = useCallback((id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setOrderedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const handleReorderExercises = useCallback((newOrder: string[]) => {
    setOrderedIds(newOrder);
  }, []);

  const handleSelectBodyPart = useCallback((bp: BodyPart) => {
    setActiveBodyPart(bp);
    setStep('exercises');
  }, []);

  const handleBackFromExercises = useCallback(() => {
    setActiveBodyPart(null);
    setStep('browse');
  }, []);

  const handleStartSession = useCallback(() => {
    // Only the exercises within the chosen count actually run — the rest
    // stay queued (visible, reorderable) in case the count gets raised later.
    const ids = orderedIds.slice(0, exerciseCount);
    setSessionIds(ids);
    const plan = buildSessionPlan(ids, targetMinutes, extraExercises);
    phasesRef.current = plan;
    setPhases(plan);
    setPhaseIndex(0);
    setPhaseTimeLeft(plan[0]?.durationSeconds ?? 0);
    setTotalElapsed(0);
    setCompletedIds(new Set());
    setPaused(false);
    setStep('active');
  }, [orderedIds, exerciseCount, targetMinutes, extraExercises]);

  const handleSkipPhase = useCallback(() => {
    advancePhase();
  }, [advancePhase]);

  const handleAdjustTime = useCallback((deltaSeconds: number) => {
    setPhaseTimeLeft((prev) => Math.max(0, prev + deltaSeconds));
  }, []);

  const handleSkipExercise = useCallback(() => {
    const plan = phasesRef.current;
    const currentExId = plan[phaseIndex]?.exerciseId;
    if (!currentExId) return;
    // Scan forward past all phases belonging to this exercise
    let next = phaseIndex + 1;
    while (next < plan.length && plan[next].exerciseId === currentExId) {
      next++;
    }
    if (next >= plan.length) {
      setPhaseIndex(next);
      setStep('complete');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }
    setPhaseIndex(next);
    setPhaseTimeLeft(plan[next].durationSeconds);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [phaseIndex]);

  const handleEndSession = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    // Mark current exercise as complete if ending on a work phase
    const plan = phasesRef.current;
    const current = plan[phaseIndex];
    if (current?.exerciseId) {
      setCompletedIds((prev) => new Set([...prev, current.exerciseId!]));
    }
    setStep('complete');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [phaseIndex]);

  const handleChangeLoggedWeight = useCallback((exerciseId: string, field: 'weightKg' | 'reps', value: string) => {
    setLoggedWeights((prev) => ({
      ...prev,
      [exerciseId]: { ...(prev[exerciseId] ?? { weightKg: '', reps: '', tooHeavy: false }), [field]: value },
    }));
  }, []);

  const handleToggleTooHeavy = useCallback((exerciseId: string) => {
    setLoggedWeights((prev) => ({
      ...prev,
      [exerciseId]: { ...(prev[exerciseId] ?? { weightKg: '', reps: '', tooHeavy: false }), tooHeavy: !(prev[exerciseId]?.tooHeavy) },
    }));
  }, []);

  const handleSave = useCallback(() => {
    // Only exercises the user actually filled in a rep count for get logged —
    // a blank row means "skip logging this one," not "did zero reps."
    const loggedExercises: LoggedExercise[] | undefined = programDay?.exercises
      .map((e): LoggedExercise | null => {
        const entry = loggedWeights[e.exerciseId];
        const reps = entry ? parseInt(entry.reps, 10) : NaN;
        if (!entry || isNaN(reps) || reps <= 0) return null;
        const weightKg = parseFloat(entry.weightKg);
        return {
          exerciseId: e.exerciseId,
          sets: Array.from({ length: e.targetSets }, () => ({ weightKg: isNaN(weightKg) ? e.currentWeightKg : weightKg, reps })),
          feltTooHeavy: entry.tooHeavy ? true : undefined,
        };
      })
      .filter((x): x is LoggedExercise => x !== null);

    onComplete({
      durationMinutes: Math.max(1, Math.floor(totalElapsed / 60)),
      exerciseIds: sessionIds,
      completedIds: Array.from(completedIds),
      category: deriveWorkoutCategory(sessionIds, extraExercises),
      loggedExercises: loggedExercises && loggedExercises.length > 0 ? loggedExercises : undefined,
    });
  }, [sessionIds, completedIds, totalElapsed, extraExercises, onComplete, programDay, loggedWeights]);

  const backAction: (() => void) | null =
    step === 'exercises' ? handleBackFromExercises :
    step === 'setup'     ? () => setStep('browse') :
    null;

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <SafeAreaView style={modal.safe} edges={['top', 'left', 'right', 'bottom']}>
        {step !== 'complete' && step !== 'active' && (
          <ModalHeader step={step} onClose={onClose} onBack={backAction} />
        )}

        {step === 'browse' && (
          <BrowseView
            selectedIds={selectedIds}
            onSelectBodyPart={handleSelectBodyPart}
            onContinue={() => setStep('setup')}
          />
        )}

        {step === 'exercises' && activeBodyPart && (
          <ExercisesView
            bodyPart={activeBodyPart}
            selectedIds={selectedIds}
            onToggle={toggleExercise}
            onToggleAll={toggleAllExercises}
            onAddWger={handleAddWgerExercise}
            onBack={handleBackFromExercises}
            defaultFilter={defaultFilter}
            fitnessLevel={fitnessLevel}
          />
        )}

        {step === 'setup' && (
          <SetupView
            orderedIds={orderedIds}
            extraExercises={extraExercises}
            onRemove={removeExercise}
            onReorder={handleReorderExercises}
            onAddMore={() => setStep('browse')}
            targetMinutes={targetMinutes}
            setTargetMinutes={setTargetMinutes}
            exerciseCount={exerciseCount}
            setExerciseCount={setExerciseCount}
            onStart={handleStartSession}
            weekActiveDays={weekActiveDays}
            annualTarget={annualTarget}
          />
        )}

        {step === 'active' && (
          <ActiveView
            phases={phases}
            phaseIndex={phaseIndex}
            phaseTimeLeft={phaseTimeLeft}
            totalElapsed={totalElapsed}
            paused={paused}
            completedIds={completedIds}
            extraExercises={extraExercises}
            onPause={() => setPaused((p) => !p)}
            onSkip={handleSkipPhase}
            onSkipExercise={handleSkipExercise}
            onAdjustTime={handleAdjustTime}
            onEnd={handleEndSession}
          />
        )}

        {step === 'complete' && (
          <CompleteView
            totalElapsed={totalElapsed}
            selectedIds={new Set(sessionIds)}
            completedIds={completedIds}
            phases={phases}
            phaseIndex={phaseIndex}
            programExercises={programDay?.exercises.filter((e) => sessionIds.includes(e.exerciseId))}
            loggedWeights={loggedWeights}
            onChangeLoggedWeight={handleChangeLoggedWeight}
            onToggleTooHeavy={handleToggleTooHeavy}
            onSave={handleSave}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const modal = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
});
