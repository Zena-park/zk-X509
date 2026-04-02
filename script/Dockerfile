# ── Stage 1: Build ELF with SP1 toolchain ──
FROM rust:1.85-slim AS elf-builder

RUN apt-get update && \
    apt-get install -y pkg-config libssl-dev curl git protobuf-compiler && \
    rm -rf /var/lib/apt/lists/*

# Install SP1 toolchain (pinned version for deterministic ELF)
RUN curl -L https://sp1.succinct.xyz | bash && \
    ~/.sp1/bin/sp1up --version v6.0.2

ENV PATH="/root/.sp1/bin:${PATH}"

WORKDIR /build
COPY Cargo.toml Cargo.lock rust-toolchain ./
COPY lib lib
COPY program program
COPY script script

# Build ELF only (via vkey binary which triggers build.rs)
RUN cargo build --release --bin vkey

# Extract vkey for verification
RUN cargo run --release --bin vkey 2>/dev/null | grep -oE '0x[0-9a-fA-F]{64}' | head -1 > /build/vkey.txt

# ── Stage 2: Build prover-server using pre-built ELF ──
FROM rust:1.85-slim AS builder

RUN apt-get update && \
    apt-get install -y pkg-config libssl-dev curl git protobuf-compiler && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY Cargo.toml Cargo.lock rust-toolchain ./
COPY lib lib
COPY program program
COPY script script

# Copy pre-built ELF from stage 1
COPY --from=elf-builder /build/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/zk-x509-program /build/elf/zk-x509-program

# Build using pre-built ELF (no SP1 toolchain needed in this stage)
ENV PREBUILT_ELF=/build/elf/zk-x509-program
RUN cargo build --release --bin prover-server --bin vkey

# ── Stage 3: Minimal runtime ──
FROM debian:bookworm-slim

# Install only Docker CLI (not the engine) for SP1 gnark container invocation.
# Using distro package avoids supply-chain risk from get.docker.com script.
RUN apt-get update && \
    apt-get install -y ca-certificates libssl3 docker.io && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/prover-server /usr/local/bin/prover-server
COPY --from=builder /build/target/release/vkey /usr/local/bin/vkey
COPY --from=elf-builder /build/vkey.txt /usr/local/share/vkey.txt

EXPOSE 9090
CMD ["prover-server"]
