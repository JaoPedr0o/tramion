// Declara os comandos que este plugin expõe (o Tauri gera `allow-<comando>` para cada um).
const COMMANDS: &[&str] = &[
    "habit_list",
    "habit_create",
    "habit_update",
    "habit_archive",
    "habit_checks",
    "habit_set_check",
    "session_record",
    "session_list",
    "settings_get",
    "settings_set",
    "timer_get",
    "timer_set",
    "timer_finish",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
