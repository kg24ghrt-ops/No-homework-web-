import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nohomework.notebook',
  appName: 'No Homework Notebook',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true
  },
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: true
  }
};

export default config;