package main

import (
	"fmt"
	"os"
	"runtime/debug"
)

var version = "dev"

func main() {
	if len(os.Args) > 1 && os.Args[1] == "version" {
		if version != "dev" {
			fmt.Println(version)
		} else if info, ok := debug.ReadBuildInfo(); ok && info.Main.Version != "(devel)" {
			fmt.Println(info.Main.Version)
		} else {
			fmt.Println("dev (no version info)")
		}
		return
	}
	fmt.Println("Hello, CI/CD!")
}
