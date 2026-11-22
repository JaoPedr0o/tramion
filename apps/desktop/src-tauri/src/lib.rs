// Ponto de entrada do backend nativo (Rust).
// Os comandos (#[tauri::command]) do app serão registrados aqui, conforme
// os módulos forem sendo criados. Por enquanto não há nenhum: o que a
// interface pode pedir ao Rust é, deliberadamente, nada.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("erro ao executar o aplicativo Tauri");
}
