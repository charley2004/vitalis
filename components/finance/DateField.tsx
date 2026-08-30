import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../theme';
import { fmtDateHuman } from '../../services/calendar';

interface DateFieldProps {
  /** YYYY-MM-DD */
  value: string;
  onChange: (dateKey: string) => void;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DateField({ value, onChange }: DateFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const dateObj = new Date(`${value}T12:00:00`);

  const handleChange = useCallback((event: DateTimePickerEvent, selected?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (event.type === 'dismissed') { setShowPicker(false); return; }
    if (selected) onChange(toDateKey(selected));
  }, [onChange]);

  return (
    <View>
      <TouchableOpacity style={styles.field} onPress={() => setShowPicker(true)} activeOpacity={0.7}>
        <Text style={styles.value}>{fmtDateHuman(value)}</Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={handleChange}
          themeVariant="dark"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2,
    backgroundColor: COLORS.surface,
  },
  value: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined },
  chevron: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
});
