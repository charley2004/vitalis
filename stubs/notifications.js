// Stub for expo-notifications — used in Expo Go where the real package cannot bundle.
// All functions are no-ops; notifications require a custom dev build.
const noop = () => {};
const asyncNoop = async () => {};

module.exports = {
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval', DAILY: 'daily' },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: noop,
  getPermissionsAsync: async () => ({ status: 'undetermined', granted: false }),
  requestPermissionsAsync: async () => ({ status: 'denied', granted: false }),
  cancelAllScheduledNotificationsAsync: asyncNoop,
  scheduleNotificationAsync: asyncNoop,
  dismissNotificationAsync: asyncNoop,
  setNotificationCategoryAsync: asyncNoop,
  getLastNotificationResponseAsync: async () => null,
  addNotificationReceivedListener: () => ({ remove: noop }),
  addNotificationResponseReceivedListener: () => ({ remove: noop }),
  removeNotificationSubscription: noop,
};
