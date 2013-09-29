var Class  = require('js-class'),
    stream = require('stream');

var SocketStream = Class(stream.Duplex, {
    constructor: function (socket) {
        stream.Duplex.call(this, {});
        (this.socket = socket)
            .on('connect', this.onConnect.bind(this))
            .on('data', this.onData.bind(this))
            .on('end', this.onEnd.bind(this))
            .on('error', this.onError.bind(this))
            .on('close', this.onClose.bind(this))
            .setNoDelay(true);
    },

    close: function () {
        this.socket.destroy();
    },

    onConnect: function () {
        this.emit('ready');
    },

    onData: function (chunk) {
        if (!this.push(chunk)) {
            this.socket.pause();
        }
    },

    onEnd: function () {
        this.push(null);
    },

    onError: function (err) {
        this.emit('error', err);
    },

    onClose: function (hasErr) {
        this.emit('close', hasErr);
    },

    _read: function () {
        this.socket.resume();
    },

    _write: function (chunk, encoding, callback) {
        this.socket.write(chunk, encoding, callback);
    }
});

module.exports = SocketStream;