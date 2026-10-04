//go:build !(js && wasm)

// Command wasm is only meaningful for js/wasm (see main.go). This stub keeps
// `go build ./...`, `go vet ./...` and `go test ./...` working on normal hosts.
package main

func main() {}
