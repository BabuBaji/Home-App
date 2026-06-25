import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.homehelp.admin',
  appName: 'HomeHelp Admin',
  webDir: 'dist',
  backgroundColor: '#5b51e8',
  android: { backgroundColor: '#5b51e8' },
  server: {
    // served at http://localhost in the WebView so cleartext LAN calls to the
    // backend (http://192.168.x.x:4000) are same-scheme and not blocked.
    androidScheme: 'http',
    cleartext: true,
  },
}

export default config
