// Declara os comandos que este plugin expõe. O Tauri gera uma permissão `allow-<comando>` para
// cada um; o app decide, nas capabilities, quais habilitar.
const COMMANDS: &[&str] = &["list"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
