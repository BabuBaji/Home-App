package com.homehelp.pro

import android.content.pm.PackageManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapType
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState

/** Charminar / city centre of Hyderabad. */
private const val HYD_LAT = 17.3850
private const val HYD_LNG = 78.4867
private val HYDERABAD = LatLng(HYD_LAT, HYD_LNG)

/** The placeholder value shipped in AndroidManifest.xml until a real key is dropped in. */
private const val KEY_PLACEHOLDER = "YOUR_API_KEY_HERE"

/**
 * Map of Hyderabad. Renders genuine Google Maps tiles when a valid
 * com.google.android.geo.API_KEY is present in the manifest; otherwise falls back
 * to the OpenStreetMap engine so the screen always shows a real, working map.
 */
@Composable
fun HyderabadMapScreen(nav: NavHostController) {
    val context = LocalContext.current
    val hasGoogleKey = remember {
        val key = runCatching {
            context.packageManager
                .getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
                .metaData?.getString("com.google.android.geo.API_KEY")
        }.getOrNull()
        !key.isNullOrBlank() && key != KEY_PLACEHOLDER
    }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Hyderabad", onBack = { nav.popBackStack() })
        if (hasGoogleKey) {
            GoogleHyderabadMap(Modifier.fillMaxSize())
        } else {
            // No valid Google key yet — use the no-key OpenStreetMap engine so the map still works.
            OsmMap(
                destLat = HYD_LAT,
                destLng = HYD_LNG,
                destLabel = "Hyderabad",
                myLat = null,
                myLng = null,
                modifier = Modifier.fillMaxSize(),
            )
            Text(
                "Showing OpenStreetMap. Add a Google Maps API key to switch to Google tiles.",
                color = TextGray,
                fontSize = 11.sp,
                modifier = Modifier.fillMaxWidth().background(ScreenBg).padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }
    }
}

@Composable
private fun GoogleHyderabadMap(modifier: Modifier) {
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(HYDERABAD, 12f)
    }
    GoogleMap(
        modifier = modifier,
        cameraPositionState = cameraPositionState,
        properties = MapProperties(mapType = MapType.NORMAL),
        uiSettings = MapUiSettings(zoomControlsEnabled = true, myLocationButtonEnabled = false),
    ) {
        Marker(
            state = MarkerState(position = HYDERABAD),
            title = "Hyderabad",
            snippet = "Telangana, India",
        )
    }
}
