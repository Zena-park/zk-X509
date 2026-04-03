.PHONY: up down clean status logs addresses elf app desktop run help

## Docker local environment
up:                ## Start all services (build + deploy + run)
	docker compose up --build -d
	@echo ""
	@echo "Waiting for deployer to finish..."
	@while docker compose ps -a deployer --format '{{.State}}' 2>/dev/null | grep -q running; do sleep 1; done
	@docker compose logs deployer
	@EXIT=$$(docker compose ps -a deployer --format '{{.ExitCode}}' 2>/dev/null); \
	 if [ "$$EXIT" != "0" ]; then echo "ERROR: deployer failed (exit $$EXIT)"; exit 1; fi
	@docker compose cp deployer:/shared/addresses.json .docker-addresses.json 2>/dev/null || true
	@echo ""
	@echo "Services running:"
	@echo "   Frontend   → http://localhost:3000"
	@echo "   Backend    → http://localhost:4000"
	@echo "   Prover     → http://localhost:9090"
	@echo "   Anvil RPC  → http://localhost:8545"
	@echo "   Chain ID   → 31337"
	@echo ""
	@cat .docker-addresses.json 2>/dev/null && echo "" || echo "Addresses not yet available. Run: make addresses"

down:              ## Stop all services (chain state resets on next up)
	docker compose down

clean:             ## Stop all services, remove volumes, and clear cached data
	docker compose down -v
	rm -rf .docker-addresses.json elf/

status:            ## Show service status
	docker compose ps

logs:              ## Tail logs (usage: make logs or make logs s=frontend)
	docker compose logs -f $(s)

addresses:         ## Show deployed contract addresses
	@cat .docker-addresses.json 2>/dev/null || echo "No addresses found. Run: make up"

elf:               ## Extract pre-built ELF from Docker (use V=1 for build logs)
	@mkdir -p elf
	@docker build --target elf-builder -f script/Dockerfile -t prover-elf-builder . $(if $(V),,--quiet)
	@CID=$$(docker create prover-elf-builder) && \
	 trap 'docker rm -f "$$CID" > /dev/null 2>&1 || true' EXIT && \
	 docker cp $$CID:/build/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/zk-x509-program elf/zk-x509-program
	@echo "ELF extracted. Usage:"
	@echo "  PREBUILT_ELF=$$(pwd)/elf/zk-x509-program cargo build --release --bin interactive"

app:               ## Build macOS .app bundle with Docker-matched vkey
	@test -f elf/zk-x509-program || (echo "ELF not found. Run 'make elf' first." && exit 1)
	PREBUILT_ELF=$$(pwd)/elf/zk-x509-program cargo build --release --bin interactive
	@APP_DIR="dist/zk-X509.app" && \
	 rm -rf "$$APP_DIR" && \
	 mkdir -p "$$APP_DIR/Contents/MacOS" "$$APP_DIR/Contents/Resources" && \
	 cp script/app-resources/Info.plist "$$APP_DIR/Contents/" && \
	 (test -f script/app-resources/AppIcon.icns && \
	  cp script/app-resources/AppIcon.icns "$$APP_DIR/Contents/Resources/" || true) && \
	 cp target/release/interactive "$$APP_DIR/Contents/MacOS/interactive" && \
	 cp script/app-resources/launcher.sh "$$APP_DIR/Contents/MacOS/launcher" && \
	 chmod +x "$$APP_DIR/Contents/MacOS/launcher" && \
	 (for dir in data/ca-certs-*; do \
	   [ -d "$$dir" ] || continue; \
	   mkdir -p "$$APP_DIR/Contents/Resources/ca-certs"; \
	   cp "$$dir"/*.der "$$APP_DIR/Contents/Resources/ca-certs/" 2>/dev/null || true; \
	 done) && \
	 echo "App built: $$APP_DIR" && \
	 echo "  open dist/zk-X509.app"

desktop:           ## Build Tauri desktop app (DMG) with Docker-matched vkey
	@test -f elf/zk-x509-program || (echo "ELF not found. Run 'make elf' first." && exit 1)
	cd desktop && npm ci && PREBUILT_ELF="$(CURDIR)/elf/zk-x509-program" npx tauri build
	@echo ""
	@echo "Desktop app built:"
	@ls target/*/release/bundle/dmg/*.dmg 2>/dev/null || echo "  (DMG not found — check target/*/release/bundle/)"
	@echo ""
	@echo "To install: open the DMG and drag to Applications"

run:               ## Run interactive app with Docker-matched vkey (no .app bundle)
	@test -f elf/zk-x509-program || (echo "ELF not found. Run 'make elf' first." && exit 1)
	PREBUILT_ELF=$$(pwd)/elf/zk-x509-program cargo run --release --bin interactive

help:              ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'
