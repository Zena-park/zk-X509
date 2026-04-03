use serde::Serialize;

#[derive(Serialize)]
pub struct SettingsResult {
    pub max_wallets: u32,
    pub delegated_required: bool,
    pub prover_url: String,
}

#[tauri::command]
pub async fn configure_settings(
    rpc_url: String,
    registry_address: String,
    chain_id: u64,
) -> Result<SettingsResult, String> {
    // chain_id is accepted for API consistency (used by the UI for proof params);
    // registry lookup is chain-agnostic since the RPC endpoint determines the network.
    let _ = chain_id;
    let registry = zk_x509_script::parse_eth_address(&registry_address)?;

    tokio::task::spawn_blocking(move || {
        let max_wallets =
            zk_x509_script::onchain::fetch_max_wallets(&rpc_url, &registry)?;

        let config =
            zk_x509_script::onchain::fetch_delegated_proving_config(&rpc_url, &registry)
                .unwrap_or(zk_x509_script::onchain::DelegatedProvingConfig {
                    required: false,
                    prover_url: String::new(),
                });

        Ok(SettingsResult {
            max_wallets,
            delegated_required: config.required,
            prover_url: config.prover_url,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub fn check_docker() -> bool {
    std::process::Command::new("docker")
        .arg("info")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}
