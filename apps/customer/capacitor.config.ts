import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.homehelp.customer',
  appName: 'HomeHelp',
  webDir: 'dist',
  // WebView background while the app boots — violet, so there is no white flash
  // before index.html paints.
  backgroundColor: '#5b51e8',
  android: { backgroundColor: '#5b51e8' },
  server: {
    // app is served at http://localhost inside the WebView so cleartext calls
    // to the LAN backend (http://192.168.x.x:4000) are same-scheme, not blocked.
    androidScheme: 'http',
    cleartext: true,
  },
}

export default config
