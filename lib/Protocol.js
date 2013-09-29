var Class = require('js-class');

var Protocol = {
    HDR_CMD_DATA:  0x00,    // flags: 0 - stdin, 1 - stdout, 2 - stderr
    HDR_CMD_OPEN:  0x01,    // flags: TUN_MERGE_OUT
    HDR_CMD_CLOSE: 0x02,    // flags: signal
    HDR_CMD_ERR:   0xff,    // flags: error code

    TUN_MERGE_OUT: 0x01,    // merge stderr into stdout
    TUN_TTY:       0x02,    // open a terminal for tunnel

    encode: function (cmd, params) {
        params || (params = {});
        var data = params.data;
        typeof(data) == 'string' && (data = new Buffer(data));
        var pkt = new Buffer(8 + (data ? data.length : 0));
        if (data) {
            data.copy(pkt, 8);
            pkt.writeUInt32BE(data.length, 4);
        } else {
            pkt.writeUInt32BE(0, 4);
        }
        pkt.writeUInt16BE(params.id ? params.id : 0, 0);
        pkt.writeUInt8(cmd, 2);
        pkt.writeUInt8(params.flags ? params.flags : 0, 3);
        return pkt;
    },

    open: function (command, opts) {
        var flags = 0;
        opts && opts.mergeOut && (flags |= this.TUN_MERGE_OUT);
        opts && opts.tty && (flags |= this.TUN_TTY);
        return this.encode(this.HDR_CMD_OPEN, { data: command, flags: flags });
    },

    data: function (id, flags, data) {
        return this.encode(this.HDR_CMD_DATA, { id: id, flags: flags, data: data });
    },

    Parser: Class(process.EventEmitter, {
        constructor: function () {
            this._proc = this._procHead;
            this._expLen = 8;
            this._rcvLen = 0;
            this._rcvBufs = [];
        },

        push: function (chunk) {
            this._rcvBufs.push(chunk);
            this._rcvLen += chunk.length;
            while (this._rcvLen >= this._expLen) {
                chunk = Buffer.concat(this._rcvBufs);
                var buf = chunk.slice(0, this._expLen);
                this._rcvBufs = [];
                if (this._rcvLen > this._expLen) {
                    this._rcvBufs.push(chunk.slice(this._expLen));
                }
                this._rcvLen -= this._expLen;
                this._proc.call(this, buf);
            }
        },

        _procHead: function (data) {
            this._packet = {
                id:     data.readUInt16BE(0) & 0x0fff,
                cmd:    data.readUInt8(2),
                flags:  data.readUInt8(3),
                size:   data.readUInt32BE(4)
            };
            if (this._packet.size > 0) {
                this._expLen = this._packet.size;
                this._proc = this._procData;
            } else {
                this.emit('packet', this._packet);
                this._expLen = 8;
            }
        },

        _procData: function (data) {
            this._packet.data = data;
            this.emit('packet', this._packet);
            this._proc = this._procHead;
            this._expLen = 8;
        }
    })
};

module.exports = Protocol;
