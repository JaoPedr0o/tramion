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
    "empty_trash",
    "search",
    "save_asset",
    "set_appearance",
    "report_error",
    "open_external",
    "create_database",
    "get_database",
    "add_property",
    "update_property",
    "delete_property",
    "create_row",
    "set_cell",
    "rename_note",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
