package main

import (
    "io"
    "os"
    "os/exec"
    "syscall"
)

const (
    TUN_MERGE_OUT = 0x01
)

type Tunnel interface {
    Start() (error)
    Wait() (int)
    Signal(signal syscall.Signal)
    Close()
    Stdin() (io.Writer)
    Stdout() (io.Reader)
    Stderr() (io.Reader)
    ExitCode() (int)
    GetData() (interface {})
    SetData(interface {})
}

type processTunnel struct {
    cmd *exec.Cmd
    stdin  io.WriteCloser
    stdout io.ReadCloser
    stderr io.ReadCloser
    code int
    data interface {}
}

func NewTunnel(command string, flags byte, data interface {}) (Tunnel, error) {
    tun := &processTunnel {
        cmd: exec.Command(os.Getenv("SHELL"), "-c", command),
        data: data,
    }
    var err error
    if tun.stdin, err = tun.cmd.StdinPipe(); err != nil {
        return nil, err
    }
    if tun.stdout, err = tun.cmd.StdoutPipe(); err != nil {
        defer tun.Close()
        return nil, err
    }
    if (flags & TUN_MERGE_OUT) != 0 {
        tun.stderr = nil
        tun.cmd.Stderr = tun.cmd.Stdout
    } else if tun.stderr, err = tun.cmd.StderrPipe(); err != nil {
        defer tun.Close()
        return nil, err
    }
    return tun, nil
}

func (t *processTunnel) Start() (error) {
    return t.cmd.Start()
}

func (t *processTunnel) Wait() (int) {
    err := t.cmd.Wait()
    if err == nil {
        t.code = 0
    } else {
        t.code = t.cmd.ProcessState.Sys().(syscall.WaitStatus).ExitStatus()
    }
    return t.code
}

func (t *processTunnel) Signal(signal syscall.Signal) {
    if t.cmd.Process != nil {
        t.cmd.Process.Signal(signal)
    }
}

func (t *processTunnel) Close() {
    if t.stdin != nil {
        t.stdin.Close()
        t.stdin = nil
    }
    if t.stdout != nil {
        t.stdout.Close()
        t.stdout = nil
    }
    if t.stderr != nil {
        t.stderr.Close()
        t.stderr = nil
    }
}

func (t *processTunnel) Stdout() (io.Reader) {
    return t.stdout
}

func (t *processTunnel) Stderr() (io.Reader) {
    return t.stderr
}

func (t *processTunnel) Stdin() (io.Writer) {
    return t.stdin
}

func (t *processTunnel) ExitCode() (int) {
    return t.code
}

func (t *processTunnel) GetData() (interface {}) {
    return t.data
}

func (t *processTunnel) SetData(data interface {}) {
    t.data = data
}
