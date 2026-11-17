// Local-only notifications.
//
// expo-notifications' config plugin always writes an `aps-environment`
// entitlement, even though Vitalis only schedules LOCAL notifications and never
// registers for remote push. A free Apple ID cannot sign the Push
// Notifications capability, so keeping that entitlement in the .app makes
// AltStore/SideStore fail with "invalid entitlements" at install or launch
// time. Removing it — plus the matching background mode — keeps every
// reminder/alarm working while letting the IPA be re-signed with a free account.
//
// Note: Expo runs mods in reverse plugin order, so this can run BEFORE
// expo-notifications re-adds the entitlement. The ios-sideload workflow
// therefore also strips it from the generated project after prebuild.

const { withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins');

module.exports = function withLocalOnlyNotifications(config) {
  config = withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });

  config = withInfoPlist(config, (cfg) => {
    if (Array.isArray(cfg.modResults.UIBackgroundModes)) {
      const modes = cfg.modResults.UIBackgroundModes.filter(
        (mode) => mode !== 'remote-notification'
      );
      if (modes.length > 0) {
        cfg.modResults.UIBackgroundModes = modes;
      } else {
        delete cfg.modResults.UIBackgroundModes;
      }
    }
    return cfg;
  });

  return config;
};
