var Class  = require('js-class'),
    stream = require('stream'),

    Protocol = require('./Protocol');

var InStream = Class(stream.Writable, {
    constructor: function (tunnel) {
        stream.Writable.call(this, {});
        this.tun = tunnel;
    },

    _write: function (chunk, encoding, callback) {
        this.tun.send(chunk, callback);
    }
});

var OutStream = Class(stream.Readable, {
    constructor: function () {
        stream.Readable.call(this, {});
    },

    _read: function () {
        // do nothing
    }
});

var Tunnel = Class(process.EventEmitter, {
    constructor: function (id, options, ctl) {
        this.id = id;
        this.ctl = ctl;
        this._streams = [new InStream(this), new OutStream()];
        options.mergeOut || this._streams.push(new OutStream());
    },

    get stdin () {
        return this._streams[0];
    },

    get stdout () {
        return this._streams[1];
    },

    get stderr () {
        return this._streams[2];
    },

    send: function (data, callback) {
        var pktBuf = Protocol.data(this.id, 0, data);
        this.ctl.send(pktBuf, callback);
    },

    data: function (data, fd) {
        this._streams[fd].push(data);
    },

    close: function (code) {
        this._streams[0].end();
        this._streams[1].emit('end');
        this._streams[2] && this._streams[2].emit('end');
        this.emit('close', code);
    }
});

module.exports = Tunnel;