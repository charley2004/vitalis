const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// expo-notifications used to be stubbed out whenever the bundle was not built
// by EAS (`EAS_BUILD` unset) to work around a bundling failure in Expo Go.
// That check also caught every local native build and the sideloading CI
// build, where it silently turned reminders and alarms into no-ops forever.
//
// This app cannot run in Expo Go anyway (expo-speech-recognition is a custom
// native module), so the real package is now the default. Set
// VITALIS_STUB_NOTIFICATIONS=1 to opt back into the stub.
if (process.env.VITALIS_STUB_NOTIFICATIONS === '1') {
  config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules ?? {}),
    'expo-notifications': path.resolve(__dirname, './stubs/notifications.js'),
  };
}

module.exports = config;
