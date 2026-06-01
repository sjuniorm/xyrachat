// Metro bundler config — extends Expo's default.
// https://docs.expo.dev/guides/customizing-metro/
//
// Explicit (rather than relying on the default) so Metro doesn't walk up the
// monorepo / OneDrive tree and pick up an unrelated config.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

module.exports = config;
