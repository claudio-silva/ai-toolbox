BINARY  := imagen
# Baseline major version; overridden by an imagen-vX.Y.Z tag when one exists.
VERSION := $(shell git describe --tags --match 'imagen-v*' --dirty 2>/dev/null | sed 's/^imagen-v//')
ifeq ($(strip $(VERSION)),)
VERSION := 2.0.0
endif
LDFLAGS := -s -w -X main.version=$(VERSION)
# The built binary is committed to the repo, so keep builds reproducible:
# without this Go stamps the current commit hash and dirty flag into it,
# which makes bin/imagen differ on every commit regardless of source changes.
FLAGS   := -trimpath -buildvcs=false -ldflags="$(LDFLAGS)"

.PHONY: build test vet install release clean

build:
	CGO_ENABLED=0 go build $(FLAGS) -o bin/$(BINARY) .

test:
	go test ./...

vet:
	go vet ./...

install: build
	mkdir -p $(HOME)/bin
	install -m 755 bin/$(BINARY) $(HOME)/bin/$(BINARY)
	@echo
	@echo "Note: if an imagen MCP server is already running (e.g. spawned by your"
	@echo "MCP client), restart the client so it picks up the newly installed binary."

release:
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64  go build $(FLAGS) -o bin/$(BINARY)-darwin-arm64  .
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build $(FLAGS) -o bin/$(BINARY)-darwin-amd64 .
	lipo -create -output bin/$(BINARY)-darwin-universal bin/$(BINARY)-darwin-arm64 bin/$(BINARY)-darwin-amd64
	# Uncomment when needed:
	# CGO_ENABLED=0 GOOS=linux   GOARCH=amd64 go build $(FLAGS) -o bin/$(BINARY)-linux-amd64   .
	# CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build $(FLAGS) -o bin/$(BINARY)-windows-amd64.exe .

clean:
	rm -rf bin
