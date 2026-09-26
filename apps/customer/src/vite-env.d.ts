/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** '0' when the APK was built without google-services.json — push must not register. */
  readonly VITE_PUSH?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
