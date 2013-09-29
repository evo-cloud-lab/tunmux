package main

import (
    "fmt"
    "flag"
    "strings"
    "net"
    "os"
    "io"
    "time"
)

var queue = make(chan string)
var endpoints int = 0

func handleStream(reader io.Reader, writer io.Writer, name string) {
    NewTunCtrl(reader, writer, name).Run()
}

func startListener(protocol, laddr string) {
    if ln, err := net.Listen(protocol, laddr); err == nil {
        endpoints ++
        go func () {
            for {
                if conn, err := ln.Accept(); err == nil {
                    switch c := conn.(type) {
                    case *net.TCPConn:
                        c.SetNoDelay(true)
                    }
                    handleStream(conn, conn, protocol + ":" + laddr)
                } else {
                    fmt.Fprintf(os.Stderr, "Accept error %s:%s: %s\n", protocol, laddr, err.Error())
                }
            }
        }()
    } else {
        fmt.Fprintf(os.Stderr, "Listen error %s:%s: %s\n", protocol, laddr, err.Error())
    }
}

func handleSerial(file *os.File, filename string) {
    for {
        handleStream(file, file, filename)
        var err error
        for file, err = os.OpenFile(filename, os.O_RDWR | os.O_EXCL, os.ModePerm); err != nil; {
            fmt.Fprintf(os.Stderr, "Open error: %s: %s\n", filename, err.Error())
            time.Sleep(1 * time.Second)
        }
    }
}

func main() {
    flag.Parse()
    for _, arg := range flag.Args() {
        switch {
        case strings.HasPrefix(arg, "tcp:"):
            startListener("tcp", arg[4:])
        case strings.HasPrefix(arg, "unix:"):
            startListener("unix", arg[5:])
        default:
            if file, err := os.OpenFile(arg, os.O_RDWR | os.O_EXCL, os.ModePerm); err == nil {
                endpoints ++
                go handleSerial(file, arg)
            } else {
                fmt.Fprintf(os.Stderr, "Open error: %s: %s\n", arg, err.Error())
            }
        }
    }

    if endpoints > 0 {
        <- queue
    }
}