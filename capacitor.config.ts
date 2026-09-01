import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nohomework.notebook',
  appName: 'No Homework Notebook',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost'
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
    buildOptions: {
      keystorePath: process.env.KEYSTORE_PATH || 'android/app/nohomework-release.keystore',
      keystorePassword: process.env.KEYSTORE_PASSWORD,
      keystoreAlias: process.env.KEY_ALIAS,
      keystoreAliasPassword: process.env.KEY_PASSWORD
    }
  },
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: true
  }
};

export default config;
