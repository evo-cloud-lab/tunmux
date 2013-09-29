#!/usr/bin/env node

var nomnom = require('nomnom'),

    TunnelCtl = require('./index').TunnelCtl;

nomnom
    .script('tunmux-cli')
    .options({
        endpoint: {
            abbr: 'e',
            metavar: 'ENDPOINT',
            type: 'string',
            required: true,
            help: 'Specify remote endpoint, e.g. tcp:[ip]:port, unix:path, fifo_path, /dev/ttyS0'
        }
    });

nomnom
    .command('tun')
    .option('COMMAND', {
        position: 1,
        type: 'string',
        required: true,
        help: 'Tunnel stdin/stdout/stderr to remote command'
    })
    .option('merge', {
        abbr: 'm',
        flag: true,
        default: false,
        help: 'Merge stderr into stdout on remote'
    })
    .option('tty', {
        abbr: 't',
        flag: true,
        required: false,
        help: 'Force create tty on remote side'
    })
    .callback(function (opts) {
        var options = {};
        opts.merge && (options.mergeOut = true);
        options.tty = opts.tty == null ? process.stdout.isTTY : opts.tty;
        new TunnelCtl(opts.endpoint)
            .on('ready', function (ctl) {
                ctl.spawn(opts.COMMAND, options, function (err, tunnel) {
                    if (err) {
                        throw err;
                    } else {
                        process.stdin.pipe(tunnel.stdin);
                        tunnel.stdout.pipe(process.stdout);
                        tunnel.stderr && tunnel.stderr.pipe(process.stderr);
                        tunnel.on('close', function (code) {
                            process.exit(code);
                        });
                        process.stdin.on('end', function () {
                            // TODO need to close individual stream
                            process.exit(0);
                        });
                    }
                });
            });
    });

nomnom.parse();
