package dev.tramion.app

import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // O app desenha por baixo das barras do sistema (borda a borda, obrigatório no Android 15 ou mais novo). Sem isto,
    // o título e os menus ficam sob a barra de status e o fim da tela sob a barra de navegação. Empurramos o conteúdo
    // para dentro da área segura: barras do sistema, recorte da câmera e teclado (que também deve empurrar o conteúdo).
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val safe = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime()
      )
      view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(content)

    requestLocalNetworkAccess()
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
