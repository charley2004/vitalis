import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, { Circle, Rect, Path, Line } from 'react-native-svg';
import { TodayScreen } from '../screens/TodayScreen';
import { RoutinesScreen } from '../screens/RoutinesScreen';
import { PlannerScreen } from '../screens/PlannerScreen';
import { FitnessScreen } from '../screens/FitnessScreen';
import { GrowthScreen } from '../screens/GrowthScreen';
import { FinanceScreen } from '../screens/finance/FinanceScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { COLORS, FONTS, FONT_SIZE, SPACING } from '../theme';

const Tab = createBottomTabNavigator();

const ICON_SIZE = 22;

function TodayIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" />
      <Circle cx="12" cy="12" r="3" fill={color} opacity="0.9" />
      <Line x1="12" y1="3"  x2="12" y2="6"  stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="12" y1="18" x2="12" y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="3"  y1="12" x2="6"  y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="18" y1="12" x2="21" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

function RoutinesIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x="3"  y="5"  width="18" height="2" rx="1" fill={color} opacity="0.35" />
      <Rect x="3"  y="11" width="18" height="2" rx="1" fill={color} opacity="0.65" />
      <Rect x="3"  y="17" width="18" height="2" rx="1" fill={color} />
      <Circle cx="6.5" cy="6"  r="2" fill={color} />
      <Circle cx="6.5" cy="12" r="2" fill={color} />
      <Circle cx="6.5" cy="18" r="2" fill={color} />
    </Svg>
  );
}

function PlannerIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth="1.5" />
      <Line x1="3" y1="10" x2="21" y2="10" stroke={color} strokeWidth="1.5" />
      <Line x1="8" y1="3" x2="8" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="16" y1="3" x2="16" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Circle cx="8" cy="14.5" r="1.2" fill={color} />
      <Circle cx="12" cy="14.5" r="1.2" fill={color} opacity="0.5" />
      <Circle cx="16" cy="17.5" r="1.2" fill={color} opacity="0.5" />
    </Svg>
  );
}

function FitnessIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 12h2V8h2v8h2V6h2v12h2V10h2"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function GrowthIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 18L8.5 12L12 15L16 9L20 6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M17 6h3v3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function FinanceIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="6" width="18" height="13" rx="2" stroke={color} strokeWidth="1.5" />
      <Path d="M3 10h18" stroke={color} strokeWidth="1.5" />
      <Path d="M15 14.5a2 2 0 100 3h3a1 1 0 001-1v-1a1 1 0 00-1-1h-3z" fill={color} opacity="0.85" />
    </Svg>
  );
}

function SettingsIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.5" />
      <Path
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function TabIconWrapper({
  children,
  focused,
}: {
  children: React.ReactNode;
  focused: boolean;
}) {
  return (
    <View style={tabIconStyles.wrapper}>
      {focused && <View style={tabIconStyles.activeDot} />}
      {children}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    paddingHorizontal: 6,
  },
  activeDot: {
    position: 'absolute',
    top: -6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.white,
  },
});

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={[labelStyles.text, { color: focused ? COLORS.textPrimary : COLORS.textMuted }]}>
      {label}
    </Text>
  );
}

const labelStyles = StyleSheet.create({
  text: {
    fontSize: 9,
    fontFamily: FONTS.mono ?? undefined,
    letterSpacing: 1.0,
    marginTop: 3,
    fontWeight: '600',
  },
});

const tabBarStyle = {
  backgroundColor: COLORS.backgroundAlt,
  borderTopWidth: 1,
  borderTopColor: COLORS.borderDim,
  paddingTop: SPACING.xs,
  paddingBottom: Platform.OS === 'ios' ? SPACING.md : SPACING.xs,
  height: Platform.OS === 'ios' ? 88 : 68,
  ...Platform.select({
    web: { boxShadow: `0 -1px 0 ${COLORS.borderDim}` } as any,
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -1 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
    },
    android: { elevation: 8 },
  }),
};

export function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: COLORS.textPrimary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarShowLabel: true,
      }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIconWrapper focused={focused}>
              <TodayIcon color={focused ? COLORS.textPrimary : COLORS.textMuted} />
            </TabIconWrapper>
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="TODAY" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Routines"
        component={RoutinesScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIconWrapper focused={focused}>
              <RoutinesIcon color={focused ? COLORS.textPrimary : COLORS.textMuted} />
            </TabIconWrapper>
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="ROUTINES" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Planner"
        component={PlannerScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIconWrapper focused={focused}>
              <PlannerIcon color={focused ? COLORS.textPrimary : COLORS.textMuted} />
            </TabIconWrapper>
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="PLANNER" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Fitness"
        component={FitnessScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIconWrapper focused={focused}>
              <FitnessIcon color={focused ? COLORS.textPrimary : COLORS.textMuted} />
            </TabIconWrapper>
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="FITNESS" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Growth"
        component={GrowthScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIconWrapper focused={focused}>
              <GrowthIcon color={focused ? COLORS.textPrimary : COLORS.textMuted} />
            </TabIconWrapper>
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="GROWTH" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Finance"
        component={FinanceScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIconWrapper focused={focused}>
              <FinanceIcon color={focused ? COLORS.textPrimary : COLORS.textMuted} />
            </TabIconWrapper>
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="FINANCE" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIconWrapper focused={focused}>
              <SettingsIcon color={focused ? COLORS.textPrimary : COLORS.textMuted} />
            </TabIconWrapper>
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="SETTINGS" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}
