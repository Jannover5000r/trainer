//go:build !(js && wasm)

// Stub so cmd/wasm only compiles for js/wasm (see main.go) while keeping
// `go build/vet/test ./...` working on other hosts.
package main

func main() {}
