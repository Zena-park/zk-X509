use serde::Serialize;

#[derive(Serialize)]
pub struct RegistryInfo {
    pub max_wallets: u32,
    pub delegated_required: bool,
    pub prover_url: String,
    pub ca_count: usize,
}

#[tauri::command]
pub async fn fetch_registry_info(
    rpc_url: String,
    registry_address: String,
) -> Result<RegistryInfo, String> {
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

        let ca_leaves =
            zk_x509_script::onchain::fetch_ca_leaves(&rpc_url, &registry)
                .unwrap_or_default();

        Ok(RegistryInfo {
            max_wallets,
            delegated_required: config.required,
            prover_url: config.prover_url,
            ca_count: ca_leaves.len(),
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
