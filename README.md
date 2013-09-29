# Tunnel Multiplexer

Tunnel Multiplexer is designed for multiplexing stdin/stdout/stderr of
multiple running processes into a single bi-directional stream.
It is designed specially for developing boxes which may not have network
or before network becomes available through serial ports.

On the client side, it is a SSH-like tool.

## How it works

Tunnel Multiplexer has a server which is compiled statically with go so
we can easily copy-and-run it on different Linux distributions. The server
can listen on tcp/unix sockets and waits on a serial port.

A client establishes a connection to the server and request to start
a process with stdin/stdout/stderr redirected to client. Within the same
connection, it can start multiple processes with multiple tunnels.

## How to use it

Make sure you have [go](http://golang.org) and [Node.js](http://nodejs.org) installed.
Pre-install [grunt-cli](http://gruntjs.com):

```bash
npm install grunt-cli -g
```

Now get the source code

```bash
git clone https://github.com/evo-cloud/tunmux
```

Build `tunmux` server

```bash
grunt
```

You can also install CLI tool, using

```bash
npm install https://github.com/evo-cloud/tunmux -g
```

Launch `tunmux` on your dev box

```bash
tunmux tcp::25666 unix:/tmp/tunmux.sock /dev/ttyS0
```

Connect using CLI if you connect from ttyS1 on another box, like `ssh`

```bash
tunmux-cli tun '/bin/bash' -e /dev/ttyS1
```

Transfer a file to remote is as simple as `scp` but looks quite different

```bash
cat local-file | tunmux-cli tun 'cat >/dir/file' -e /dev/ttyS1
```
