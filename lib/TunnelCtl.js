var Class = require('js-class'),
    net   = require('net'),

    SocketStream = require('./SocketStream'),
    SerialStream = require('./SerialStream'),
    Protocol     = require('./Protocol'),
    Tunnel       = require('./Tunnel');

var TunnelCtl = Class(process.EventEmitter, {
    constructor: function (endpoint) {
        this._requests = [];
        this._tunnels = {};
        endpoint && this.connect(endpoint);
    },

    connect: function (endpoint) {
        if (endpoint.substr(0, 4) == 'tcp:') {
            var tokens = endpoint.substr(4).split(':');
            var host = tokens[0].length > 0 ? tokens[0] : 'localhost';
            var port = parseInt(tokens[1]);
            this._connector = function () {
                return new SocketStream(net.connect(port, host));
            };
        } else if (endpoint.substr(0, 5) == 'unix:') {
            this._connector = function () {
                return new SocketStream(net.connect(endpoint.substr(5)));
            };
        } else {
            this._connector = function () {
                return new SerialStream(endpoint);
            }
        }
        (this._stream = this._connector())
            .on('ready', this.onReady.bind(this))
            .on('error', this.onError.bind(this))
            .on('close', this.onClose.bind(this));
    },

    spawn: function (command, options, callback) {
        if (typeof(options) == 'function') {
            callback = options;
            options = { };
        }
        var packet = Protocol.open(command, options);
        var request = {
            callback: function (err, id) {
                var tunnel;
                if (!err) {
                    var tunnel = new Tunnel(id, options || {}, this);
                    this._tunnels[id] = tunnel;
                }
                callback && callback(err, tunnel);
            }.bind(this)
        };
        this._stream.write(packet, function (err) {
            err && callback && callback(err);
            err || this._requests.push(request);
        }.bind(this));
    },

    send: function (pktBuf, callback) {
        this._stream.write(pktBuf, callback);
    },

    onPacket: function (packet) {
        switch (packet.cmd) {
        case Protocol.HDR_CMD_OPEN:
            this.onTunnelOpen(packet.id);
            break;
        case Protocol.HDR_CMD_CLOSE:
            this.onTunnelClose(packet.id, packet.flags);
            break;
        case Protocol.HDR_CMD_DATA:
            this.onTunnelData(packet.id, packet.flags, packet.data);
            break;
        case Protocol.HDR_CMD_ERR:
            this.onTunnelError(packet.id, packet.flags);
            break;
        }
    },

    onTunnelOpen: function (id) {
        var request = this._requests.shift();
        if (request) {
            request.callback(undefined, id);
        }
    },

    onTunnelError: function (id, code) {
        var error = new Error('Tunnel Error ' + code);
        error.code = code;
        var request = this._requests.shift();
        if (request) {
            request.callback(error);
        }
    },

    onTunnelClose: function (id, code) {
        var tunnel = this._tunnels[id];
        if (tunnel) {
            delete this._tunnels[id];
            tunnel.close(code);
        }
    },

    onTunnelData: function (id, flags, data) {
        var tunnel = this._tunnels[id];
        if (tunnel) {
            tunnel.data(data, flags);
        }
    },

    onData: function (chunk) {
        this.parser.push(chunk);
    },

    onReady: function () {
        (this.parser = new Protocol.Parser())
            .on('packet', this.onPacket.bind(this));
        this._stream.on('data', this.onData.bind(this));
        this.emit('ready', this);
    },

    onError: function (err) {
        this.emit('error', err);
    },

    onClose: function () {
        this.parser.removeAllListeners();
        delete this.parser;
        for (var id in this._tunnels) {
            this._tunnels[id].close(-1);
        }
        this._tunnels = {};
        for (var i in this._requests) {
            this._requests.callback(new Error('Closed'));
        }
        this._requests = [];
        this.emit('close');
    }
});

module.exports = TunnelCtl;