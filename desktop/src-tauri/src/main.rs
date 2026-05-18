#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::certificates::IdentityStore;
use std::sync::Mutex;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(IdentityStore(Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![
            commands::settings::configure_settings,
            commands::settings::check_docker,
            commands::settings::open_docker_desktop,
            commands::certificates::scan_certificates,
            commands::proving::generate_proof,
            commands::proving::delegated_prove,
            commands::onchain::fetch_registry_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
