package dev.tramion.app

import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
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
  }
}
