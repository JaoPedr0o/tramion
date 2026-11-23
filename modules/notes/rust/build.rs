// Declara os comandos que este plugin expõe. O Tauri gera uma permissão `allow-<comando>` para
// cada um; o app decide, nas capabilities, quais habilitar.
const COMMANDS: &[&str] = &[
    "create",
    "get",
    "list",
    "list_trash",
    "update",
    "set_pinned",
    "move_note",
    "delete",
    "restore",
    "purge",
    "save_asset",
    "set_appearance",
    "report_error",
    "open_external",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
