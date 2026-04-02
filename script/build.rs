use std::path::Path;

fn main() {
    // Support pre-built ELF for cross-platform vkey consistency.
    // When PREBUILT_ELF is set, skip SP1 program compilation and use the provided ELF.
    // This ensures all platforms (macOS, Windows, Linux/Docker) use the exact same ELF
    // and therefore produce the same verification key (vkey).
    if let Ok(elf_path) = std::env::var("PREBUILT_ELF") {
        let path = Path::new(&elf_path);
        if !path.exists() {
            panic!("PREBUILT_ELF set but file not found: {}", elf_path);
        }
        let abs = match path.canonicalize() {
            Ok(p) => p,
            Err(e) => panic!("failed to canonicalize PREBUILT_ELF path {}: {}", elf_path, e),
        };
        println!("cargo:rustc-env=SP1_ELF_zk-x509-program={}", abs.display());
        println!("cargo:warning=Using pre-built ELF: {}", abs.display());
        println!("cargo:rerun-if-env-changed=PREBUILT_ELF");
        println!("cargo:rerun-if-changed={}", abs.display());
        return;
    }

    println!("cargo:rerun-if-env-changed=PREBUILT_ELF");
    sp1_build::build_program_with_args("../program", Default::default())
}
