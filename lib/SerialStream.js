var Class  = require('js-class'),
    stream = require('stream'),
    fs     = require('fs');

var SerialStream = Class(stream.Duplex, {
    constructor: function (path) {
        stream.Duplex.call(this, {});
        fs.open(path, 'r+', function (err, fd) {
            err && this.emit('error', err);
            err || this._open(fd);
        }.bind(this));
    },

    close: function () {
        fs.closeSync(this._fd);
    },

    _open: function (fd) {
        this._fd = fd;
        (this._reader = new fs.ReadStream('', { fd: fd }))
            .on('data', this.onData.bind(this))
            .on('error', this.onError.bind(this))
            .on('end', this.onEnd.bind(this));
        (this._writer = new fs.WriteStream('', { fd: fd }))
            .on('error', this.onError.bind(this));
        this.emit('ready');
    },

    onData: function (chunk) {
        if (!this.push(chunk)) {
            this._reader.pause();
        }
    },

    onEnd: function () {
        this.push(null);
        this.emit('close');
    },

    onError: function (err) {
        this.emit('error', err);
    },

    _read: function () {
        this._reader.resume();
    },

    _write: function (chunk, encoding, callback) {
        return this._writer.write(chunk, encoding, callback);
    }
});

module.exports = SerialStream;