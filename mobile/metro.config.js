const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Reuse the existing web viewer rather than maintain a second model implementation.
config.watchFolders = [path.resolve(__dirname, '..', 'FE')];
config.resolver.resolveRequest = (context, name, platform) => {
  if (/^(react|react-dom)(\/|$)/.test(name)) {
    return context.resolveRequest({...context, originModulePath: path.join(__dirname, 'package.json')}, name, platform);
  }
  return context.resolveRequest(context, name, platform);
};
module.exports = config;
