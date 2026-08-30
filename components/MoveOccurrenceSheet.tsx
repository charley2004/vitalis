import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Occurrence, moveOccurrence, weekdayOf, parseDateKey, fmtDateHuman } from '../services/calendar';
import { DateField } from './finance/DateField';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../theme';

const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

interface MoveOccurrenceSheetProps {
  visible: boolean;
  occ: Occurrence | null;
  /** The 7 YYYY-MM-DD dates of the week currently in view */
  weekDays: string[];
  onClose: () => void;
  onMoved: () => void;
}

/** Moves a single Planner occurrence to another day — a one-off event just
 *  moves outright; a recurring event's occurrence is skipped in place and
 *  reborn as a one-time copy on the new day (see moveOccurrence()), so the
 *  rest of its series is never touched. */
export function MoveOccurrenceSheet({ visible, occ, weekDays, onClose, onMoved }: MoveOccurrenceSheetProps) {
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The sheet stays mounted (only `visible` toggles) so a stale pick from a
  // previous occurrence — or a previous open that got cancelled — can't
  // silently carry over and pre-fill the wrong target date here.
  useEffect(() => {
    if (visible) setCustomDate(null);
  }, [visible, occ?.event.id, occ?.dateKey]);

  const handlePick = async (toDateKey: string) => {
    if (!occ || saving) return;
    setSaving(true);
    await moveOccurrence(occ.event.id, occ.dateKey, toDateKey);
    setSaving(false);
    setCustomDate(null);
    onMoved();
    onClose();
  };

  if (!occ) return null;
  const isRecurring = occ.event.repeat !== 'none';
  const otherDays = weekDays.filter((d) => d !== occ.dateKey);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.title}>MOVE TO ANOTHER DAY</Text>
          <Text style={s.subtitle} numberOfLines={1}>{occ.event.title}</Text>

          {isRecurring && (
            <Text style={s.note}>
              This creates a one-time copy on the new day — the regular {occ.event.repeat} plan stays unchanged.
            </Text>
          )}

          {otherDays.length > 0 && (
            <>
              <Text style={s.sectionLabel}>THIS WEEK</Text>
              <View style={s.chipRow}>
                {otherDays.map((d) => (
                  <TouchableOpacity key={d} onPress={() => handlePick(d)} style={s.chip} activeOpacity={0.7} disabled={saving}>
                    <Text style={s.chipDay}>{DAY_ABBR[weekdayOf(d)]}</Text>
                    <Text style={s.chipDate}>{parseDateKey(d).getDate()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={s.sectionLabel}>OR PICK A DATE</Text>
          <DateField value={customDate ?? occ.dateKey} onChange={setCustomDate} />
          <TouchableOpacity
            onPress={() => customDate && handlePick(customDate)}
            style={[s.confirmBtn, !customDate && { opacity: 0.4 }]}
            activeOpacity={0.7}
            disabled={!customDate || saving}
          >
            <Text style={s.confirmBtnText}>MOVE TO {customDate ? fmtDateHuman(customDate).toUpperCase() : 'SELECTED DATE'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={s.cancelBtn} activeOpacity={0.7}>
            <Text style={s.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.overlay },
  sheet: {
    backgroundColor: COLORS.surfaceSolid,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    borderWidth: 1,
    borderColor: COLORS.borderDim,
    padding: SPACING.xl,
    gap: SPACING.sm,
  },
  handle: { width: 36, height: 3, borderRadius: 2, backgroundColor: COLORS.borderBright, alignSelf: 'center', marginBottom: SPACING.xs },
  title: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 2 },
  subtitle: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.bodyMedium ?? undefined, marginTop: -4 },
  note: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, lineHeight: 17, marginTop: SPACING.xs },
  sectionLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginTop: SPACING.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    width: 52, alignItems: 'center', paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, backgroundColor: COLORS.surface,
  },
  chipDay: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5 },
  chipDate: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', marginTop: 2 },
  confirmBtn: { backgroundColor: COLORS.textPrimary, borderRadius: RADII.sm, paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.xs },
  confirmBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1.5 },
  cancelBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
  cancelText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.body ?? undefined },
});
