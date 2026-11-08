// Dynamic Expo configuration.
//
// app.json holds every static value; this file only flips build-time switches
// that would otherwise change how the app behaves in normal development.
//
// VITALIS_SIDELOAD=1 is set by .github/workflows/ios-sideload.yml. That build
// is re-signed on the iPhone by AltStore/SideStore with a free Apple ID, so it
// has no EAS Update channel of its own. Leaving expo-updates enabled would make
// every cold start wait on an update server that can never answer for this
// build, so updates are switched off for sideload builds only.

const isSideloadBuild = process.env.VITALIS_SIDELOAD === '1';

module.exports = ({ config }) => {
  if (!isSideloadBuild) {
    return config;
  }

  return {
    ...config,
    updates: {
      enabled: false,
      checkAutomatically: 'NEVER',
    },
  };
};
