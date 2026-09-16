// Profile-photo capture. Native uses @capacitor/camera (real camera / photo library); the browser
// falls back to a hidden <input type="file">, so the dev server still works.
import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

export type PhotoSource = 'camera' | 'gallery'

/** Longest edge of the uploaded image. A profile photo is shown at ~96px, so 512 is plenty and
 *  keeps a phone-camera JPEG (3-8 MB) well under the server's 5 MB cap. */
const MAX_EDGE = 512
const QUALITY = 0.85

/** Downscale to a square-ish JPEG. Returns the original blob if canvas isn't usable. */
export async function downscale(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && blob.size < 1_000_000) return blob      // already small enough
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    ctx.drawImage(bitmap, 0, 0, w, h)
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', QUALITY))
    return out || blob
  } catch { return blob }
}

/** data: URL -> Blob, without a fetch (which the webview may refuse for large data URLs). */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',')
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/jpeg'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Open the camera or the photo library and return the chosen image, or null if cancelled. */
export async function pickPhoto(source: PhotoSource): Promise<Blob | null> {
  if (Capacitor.isNativePlatform()) {
    // Uri + fetch keeps the image out of the JS bridge as base64 — much lighter on memory.
    const photo = await Camera.getPhoto({
      quality: 80,
      // Deliberately NOT allowEditing: Android hands off to the OEM crop intent, which is
      // free-form (so it never matches the round avatar) and on many devices only reveals its
      // confirm button once the crop has been dragged. We frame it in-app instead — see
      // components/PhotoCropper.
      allowEditing: false,
      // DataUrl, not Uri: fetching a webPath (capacitor/http-scheme file URL) fails on some
      // Android webviews, which threw before the cropper could ever open. Base64 crosses the
      // bridge instead — heavier, but the image is downscaled straight after, and it always works.
      resultType: CameraResultType.DataUrl,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      correctOrientation: true,           // honour the EXIF rotation instead of saving it sideways
    })
    if (!photo?.dataUrl) return null
    return dataUrlToBlob(photo.dataUrl)   // framing + downscale happen in the cropper
  }

  // Browser: `capture` hints at the camera on mobile web; desktop just opens a file chooser.
  return new Promise<Blob | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (source === 'camera') input.setAttribute('capture', 'user')
    input.onchange = async () => {
      const f = input.files?.[0]
      resolve(f || null)
    }
    // A cancelled picker fires no event in some browsers; the promise simply never settles,
    // which is fine — the element is discarded with the closure.
    input.click()
  })
}

/** True when the user dismissed the native picker, which the plugin reports as a thrown error. */
export const isCancelled = (e: unknown) => /cancel/i.test((e as Error)?.message || '')
