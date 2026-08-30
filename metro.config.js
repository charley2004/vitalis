const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// expo-notifications fails to bundle in Expo Go on this SDK, so it's stubbed
// out there — but a real EAS build needs the actual module, or notification
// permissions/scheduling silently no-op forever. EAS sets EAS_BUILD=true on
// every cloud build (all profiles); plain `expo start` (Expo Go) does not.
if (!process.env.EAS_BUILD) {
  config.resolver.extraNodeModules = {
    'expo-notifications': path.resolve(__dirname, './stubs/notifications.js'),
  };
}

module.exports = config;
