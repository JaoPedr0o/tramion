package dev.tramion.app

import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.max

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private var multicastLock: WifiManager.MulticastLock? = null

  // Margens seguras em pixels (esquerda, topo, direita, base): barras do sistema, recorte da câmera e teclado.
  private var safeLeft = 0
  private var safeTop = 0
  private var safeRight = 0
  private var safeBottom = 0

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // O app desenha de ponta a ponta, por baixo das barras do sistema (obrigatório no Android 15 ou mais novo). Quem
    // empurra o conteúdo para dentro da área segura é o CSS da tela, com as margens que passamos por `TramionNative`.
    // Assim a gaveta lateral e o escurecimento por trás dela cobrem também a faixa da barra de status, e a cor fica
    // contínua (com um recuo nativo, essa faixa ficava de outra cor).
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { _, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      safeLeft = bars.left
      safeTop = bars.top
      safeRight = bars.right
      safeBottom = max(bars.bottom, ime.bottom) // o teclado também empurra o conteúdo
      notifyInsetsChanged()
      insets
    }
    ViewCompat.requestApplyInsets(content)

    requestLocalNetworkAccess()
  }

  // Com o app visível, o aparelho recebe os anúncios mDNS do computador (para achá-lo se o IP mudar). Fora da tela o
  // bloqueio é solto, para não gastar bateria.
  override fun onResume() {
    super.onResume()
    try {
      val wifi = applicationContext.getSystemService(WIFI_SERVICE) as? WifiManager
      if (multicastLock == null) {
        multicastLock = wifi?.createMulticastLock("tramion-mdns")?.apply { setReferenceCounted(false) }
      }
      multicastLock?.acquire()
    } catch (_: Exception) {
      // Sem Wi-Fi ou sem permissão: a descoberta por nome não funciona, mas o endereço guardado ainda vale.
    }
  }

  override fun onPause() {
    super.onPause()
    try {
      if (multicastLock?.isHeld == true) multicastLock?.release()
    } catch (_: Exception) {
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(NativeBridge(), "TramionNative")
  }

  private fun notifyInsetsChanged() {
    webView?.post {
      webView?.evaluateJavascript("window.dispatchEvent(new Event('tramion-insets'))", null)
    }
  }

  /** O que a tela do app pode pedir ao Android. Só existe o conteúdo local do app dentro da WebView. */
  inner class NativeBridge {
    /** "esquerda,topo,direita,base" em pixels CSS (pixels do aparelho divididos pela densidade). */
    @JavascriptInterface
    fun insets(): String {
      val density = resources.displayMetrics.density
      return listOf(safeLeft, safeTop, safeRight, safeBottom).joinToString(",") { (it / density).toString() }
    }

    /** Ícones escuros nas barras (tema claro do app) ou claros (tema escuro), qualquer que seja o tema do sistema. */
    @JavascriptInterface
    fun setLightBars(light: Boolean) {
      runOnUiThread {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = light
        controller.isAppearanceLightNavigationBars = light
      }
    }
  }

  // No Android 17 (API 37) o app só fala com aparelhos da rede local (o computador do pareamento) depois que a pessoa
  // permite. A permissão é pedida aqui, na abertura; o sistema mostra o aviso uma vez e lembra a escolha.
  private fun requestLocalNetworkAccess() {
    if (Build.VERSION.SDK_INT < 37) return
    if (ContextCompat.checkSelfPermission(this, LOCAL_NETWORK) == PackageManager.PERMISSION_GRANTED) return
    ActivityCompat.requestPermissions(this, arrayOf(LOCAL_NETWORK), REQUEST_LOCAL_NETWORK)
  }

  private companion object {
    const val LOCAL_NETWORK = "android.permission.ACCESS_LOCAL_NETWORK"
    const val REQUEST_LOCAL_NETWORK = 4242
  }
}
