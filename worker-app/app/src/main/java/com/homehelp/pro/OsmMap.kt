package com.homehelp.pro

import android.graphics.Color as AndroidColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline

/**
 * Real interactive map rendered inside the app using OpenStreetMap tiles (osmdroid, no API key).
 * Shows the destination marker, the worker's current location, and a route line between them.
 */
@Composable
fun OsmMap(
    destLat: Double,
    destLng: Double,
    destLabel: String,
    myLat: Double?,
    myLng: Double?,
    modifier: Modifier = Modifier,
) {
    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            MapView(ctx).apply {
                setTileSource(TileSourceFactory.MAPNIK)
                setMultiTouchControls(true)
                controller.setZoom(15.0)
                controller.setCenter(GeoPoint(destLat, destLng))
                onResume()
            }
        },
        update = { map ->
            map.overlays.clear()
            val dest = GeoPoint(destLat, destLng)

            val destMarker = Marker(map).apply {
                position = dest
                title = destLabel
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            }
            map.overlays.add(destMarker)

            if (myLat != null && myLng != null) {
                val me = GeoPoint(myLat, myLng)
                val meMarker = Marker(map).apply {
                    position = me
                    title = "Your location"
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                }
                map.overlays.add(meMarker)

                val route = Polyline(map).apply {
                    setPoints(listOf(me, dest))
                    outlinePaint.color = AndroidColor.parseColor("#4A26C9")
                    outlinePaint.strokeWidth = 10f
                }
                map.overlays.add(route)

                val box = BoundingBox.fromGeoPoints(listOf(me, dest))
                map.post { map.zoomToBoundingBox(box.increaseByScale(1.6f), false) }
            } else {
                map.controller.setCenter(dest)
            }
            map.invalidate()
        },
        onRelease = { it.onPause() },
    )
}
