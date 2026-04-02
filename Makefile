.PHONY: up down clean status logs addresses elf help

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
	@echo ""
	@echo "Extracting vkey for local consistency..."
	@mkdir -p elf
	@IMAGE_ID=$$(docker compose images -q prover 2>/dev/null); \
	 if [ -n "$$IMAGE_ID" ]; then \
	 	CID=$$(docker create "$$IMAGE_ID" 2>/dev/null); \
	 	if [ -n "$$CID" ]; then \
	 		(docker cp $$CID:/usr/local/share/vkey.txt elf/vkey.txt 2>/dev/null && \
	 		 echo "   VKEY=$$(cat elf/vkey.txt)" && \
	 		 echo "   Run 'make elf' to extract full ELF for local builds") || \
	 		 echo "   WARNING: vkey extraction failed"; \
	 		docker rm -f "$$CID" > /dev/null 2>&1 || true; \
	 	else \
	 		echo "   WARNING: vkey extraction skipped (could not create container)"; \
	 	fi; \
	 else \
	 	echo "   WARNING: vkey extraction skipped (prover image not found)"; \
	 fi

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

elf:               ## Extract pre-built ELF from Docker (for local vkey consistency)
	@mkdir -p elf
	@docker build --target elf-builder -f script/Dockerfile -t prover-elf-builder . -q
	@CID=$$(docker create prover-elf-builder) && \
	 trap 'docker rm -f "$$CID" > /dev/null 2>&1 || true' EXIT && \
	 docker cp $$CID:/build/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/zk-x509-program elf/zk-x509-program
	@echo "ELF extracted. Usage:"
	@echo "  PREBUILT_ELF=$$(pwd)/elf/zk-x509-program cargo build --release --bin interactive"

help:              ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'
