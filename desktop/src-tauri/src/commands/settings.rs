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
    // Detect Docker by connecting directly to its Unix domain socket — this
    // is exactly what `docker info` does internally, just without the CLI
    // wrapper. Three reasons this beats shelling out:
    //   1. PATH-free: macOS launchd gives Finder-launched GUI apps a
    //      minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) that excludes
    //      `/usr/local/bin` and `/opt/homebrew/bin`, so `Command::new("docker")`
    //      silently fails with "not found" even when the daemon is up.
    //   2. Authoritative: a successful socket connect means the daemon is
    //      actively listening — stronger signal than "docker info exited 0",
    //      which can include version-check shortcuts.
    //   3. No fork+exec: faster on the Connect screen.
    //
    // The candidate list covers Docker Desktop (macOS / Windows-WSL2),
    // standard Linux installs, and the common colima fallback. First
    // socket that accepts a connection wins.
    #[cfg(unix)]
    {
        use std::os::unix::net::UnixStream;

        let mut candidates: Vec<String> = Vec::new();
        if let Ok(home) = std::env::var("HOME") {
            // Docker Desktop on macOS keeps the socket under the user's
            // home; `/var/run/docker.sock` is usually a symlink to it but
            // not guaranteed on every install.
            candidates.push(format!("{}/.docker/run/docker.sock", home));
            // colima default profile — common Docker-Desktop alternative
            // on Apple Silicon dev machines.
            candidates.push(format!("{}/.colima/default/docker.sock", home));
        }
        candidates.push("/var/run/docker.sock".to_string());

        // No `Path::exists()` pre-check: `UnixStream::connect()` already
        // fails with ENOENT when the path is missing, so a separate stat
        // is redundant — and also TOCTOU-prone (the daemon could remove
        // the socket between stat and connect during shutdown).
        for path in &candidates {
            if UnixStream::connect(path).is_ok() {
                return true;
            }
        }
        false
    }

    #[cfg(windows)]
    {
        // Docker Desktop on Windows exposes the engine via a named pipe.
        // Opening the pipe with read/write access succeeds iff the daemon
        // is running and accepting connections — same semantics as a
        // Unix-socket connect above, just over the Windows IPC primitive.
        use std::fs::OpenOptions;
        OpenOptions::new()
            .read(true)
            .write(true)
            .open(r"\\.\pipe\docker_engine")
            .is_ok()
    }

    #[cfg(not(any(unix, windows)))]
    {
        false
    }
}
