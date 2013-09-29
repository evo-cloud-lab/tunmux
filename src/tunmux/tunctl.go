package main

import (
    "io"
    "bytes"
    "syscall"
    "fmt"
    "log"
)

type TunCtrl interface {
    Run()
}

// Raw packet format
// byte 0 RSV(VER)   0xf0
//        TUNID_MASK 0x0f
// byte 1 TUNNEL ID  lower 8 bits
// byte 2 COMMAND/RESPONSE
// byte 3 COMMAND/RESPONSE FLAGS
// byte 4 - 7 DATA LENGTH
// byte 8 ... DATA

const (
    // Reserved bits: 0 for current version
    HDR_RSV_MASK = 0xf0
    HDR_RSV_VAL  = 0

    // Tunnel ID higher 4 bits
    HDR_TUNID_MASK = 0x0f

    // Commands
    HDR_CMD_DATA  = 0x00    // flags: 0 - stdin, 1 - stdout, 2 - stderr
    HDR_CMD_OPEN  = 0x01    // flags: TUN_MERGE_OUT
    HDR_CMD_CLOSE = 0x02    // flags: signal
    HDR_CMD_ERR   = 0xff    // flags: error code

    // Response codes
    HDR_ERR_BADPACKET = 0x01
    HDR_ERR_UNKNOWN   = 0x02
    HDR_ERR_BADTUNID  = 0x03
    HDR_ERR_OPEN      = 0x04
)

func encodePacket(tunnel uint, cmd byte, flags byte, size int) ([]byte) {
    head := make([]byte, 8)
    head[0] = HDR_RSV_VAL | (byte)(tunnel >> 8)
    head[1] = (byte)(tunnel & 0xff)
    head[2] = cmd
    head[3] = flags
    for i := 0; i < 4; i ++ {
        head[7 - i] = (byte)(size >> (uint)(8 * i))
    }
    return head
}

type packet struct {
    tunnel  uint        // tunnel ID
    cmd     byte        // command code
    flags   byte        // command flags
    data    []byte      // actual data
}

type tuncmd struct {
    cmd string
    arg interface {}
}

type controller struct {
    reader  io.Reader
    writer  io.Writer
    name    string
    tunnels map[uint]Tunnel
    lastId  uint
    queue   chan *tuncmd
    close   bool
}

func NewTunCtrl(reader io.Reader, writer io.Writer, name string) (TunCtrl) {
    return &controller {
        reader:  reader,
        writer:  writer,
        name:    name,
        tunnels: make(map[uint]Tunnel),
        lastId:  0,
        queue:   make(chan *tuncmd),
        close:   false,
    }
}

func (c *controller) Run() {
    c.log("START")
    go c.processCtrl()
    for !c.close {
        cmd := <- c.queue
        c.log("CMD %s", cmd.cmd)
        switch cmd.cmd {
        case "open":
            c.openTunnel(cmd.arg.(*packet))
        case "close":
            c.closeTunnel(cmd.arg.(Tunnel))
        }
    }
    for _, t := range c.tunnels {
        t.Signal(syscall.SIGPIPE)
        t.Close()
    }
    c.log("STOP")
}

func (c *controller) log(format string, a ...interface{}) {
    log.Println("CTL " + fmt.Sprintf(format, a...) + " [" + c.name + "]")
}

func (c *controller) notify(cmd string, arg interface {}) {
    c.queue <- &tuncmd { cmd: cmd, arg: arg }
}

func (c *controller) closeTunnel(t Tunnel) {
    id := t.GetData()
    if id != nil {
        c.log("CLOSE TUN %d", id.(uint))
        delete(c.tunnels, id.(uint))
        t.SetData(nil)
        t.Close()
        c.reply(id.(uint), HDR_CMD_CLOSE, (byte)(t.ExitCode()))
    }
}

func (c *controller) openTunnel(pkt *packet) {
    for c.lastId == 0 || c.tunnels[c.lastId] != nil {
        c.lastId ++
        if c.lastId == 0 {
            c.lastId ++
        }
    }
    id := c.lastId
    command := bytes.NewBuffer(pkt.data).String()
    c.log("OPEN TUN %d %s", id, command)
    tun, err := NewTunnel(command, pkt.flags, id)
    if err == nil {
        err = tun.Start()
    }
    if err != nil {
        c.log("OPEN TUN %d ERROR %s", id, err.Error())
        c.reply(0, HDR_CMD_ERR, HDR_ERR_OPEN)
    } else {
        c.tunnels[id] = tun
        c.reply(id, HDR_CMD_OPEN, 0)
        go c.waitTunnel(tun)
        if stdout := tun.Stdout(); stdout != nil {
            go c.readOutput(tun, stdout, 1)
        }
        if stderr := tun.Stderr(); stderr != nil {
            go c.readOutput(tun, stderr, 2)
        }
    }
}

func (c *controller) readPacket() (*packet, error) {
    head := make([]byte, 8)
    if _, err := io.ReadFull(c.reader, head); err != nil {
        c.log("READ PKT HEAD ERR %s", err.Error())
        return nil, err
    }

    // check reserved bits
    if (head[0] & HDR_RSV_MASK) != HDR_RSV_VAL {
        c.log("READ PKT HEAD INVALID 0x%x", head[0])
        return nil, nil
    }

    // extract length
    var dataLen uint = 0
    for i := 4; i < 8; i ++ {
        dataLen <<= 8
        dataLen |= (uint)(head[i])
    }

    pkt := &packet {
        tunnel: (((uint)(head[0] & HDR_TUNID_MASK)) << 8) | (uint)(head[1]),
        cmd:    head[2],
        flags:  head[3],
        data:   make([]byte, dataLen),
    }

    if _, err := io.ReadFull(c.reader, pkt.data); err != nil {
        c.log("READ PKT DATA ERR %s", err.Error())
        return nil, err
    }

    return pkt, nil
}

func (c *controller) writePacket(pkt []byte) {
    if _, err := c.writer.Write(pkt); err != nil {
        c.close = true;
    }
}

func (c *controller) reply(tunnel uint, code, flags byte) {
    c.writePacket(encodePacket(tunnel, code, flags, 0))
}

func (c *controller) processCtrl() {
    for !c.close {
        pkt, err := c.readPacket()
        if err != nil {
            break
        } else if pkt == nil {
            c.reply(0, HDR_CMD_ERR, HDR_ERR_BADPACKET)
            continue
        }

        //c.log("PKT 0x%x TUN %d", pkt.cmd, pkt.tunnel)

        switch pkt.cmd {
        case HDR_CMD_DATA:
            c.writeTunnel(pkt.tunnel, pkt.data)
        case HDR_CMD_OPEN:
            c.notify("open", pkt)
        case HDR_CMD_CLOSE:
            t := c.tunnels[pkt.tunnel]
            if t == nil {
                c.reply(pkt.tunnel, HDR_CMD_ERR, HDR_ERR_BADTUNID)
            } else {
                t.Signal((syscall.Signal)(pkt.flags))
            }
        default:
            c.reply(0, HDR_CMD_ERR, HDR_ERR_UNKNOWN)
        }
    }
    c.log("ROUTE STOP")
    c.close = true
    c.notify("stop", nil)
}

func (c *controller) writeTunnel(tunnel uint, data []byte) {
    t := c.tunnels[tunnel]
    if t == nil {
        c.reply(tunnel, HDR_CMD_ERR, HDR_ERR_BADTUNID)
        return
    }
    if stdin := t.Stdin(); stdin != nil {
        stdin.Write(data)
    }
}

func (c *controller) readOutput(t Tunnel, reader io.Reader, fd byte) {
    for id := t.GetData(); id != nil; {
        data := make([]byte, 4096)
        sz, err := io.ReadAtLeast(reader, data, 1)
        if err == nil && sz > 0 {
            c.log("TUNOUT %d SIZE %d", fd, sz)
            c.writePacket(encodePacket(id.(uint), HDR_CMD_DATA, fd, sz))
            c.writePacket(data[0:sz])
            if c.close {
                c.notify("stop", nil)
                break
            }
        } else {
            c.log("TUNOUT %d CLOSE", fd)
            break
        }
    }
}

func (c *controller) waitTunnel(t Tunnel) {
    code := t.Wait()
    c.log("TUN %d EXIT %d", t.GetData().(uint), code)
    c.notify("close", t)
}
