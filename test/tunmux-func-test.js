var fs     = require('fs'),
    path   = require('path'),
    spawn  = require('child_process').spawn,
    exec   = require('child_process').exec,
    assert = require('assert');

describe('tunmux', function () {
    var sock = '/tmp/tunmux-test-' + process.pid + '.sock';
    var tunmuxd;

    before(function () {
        fs.existsSync(sock) && fs.unlinkSync(sock);
        tunmuxd = spawn(path.join(__dirname, '../bin/tunmux'), ['unix:' + sock]);
    });

    after(function () {
        tunmuxd && tunmuxd.kill();
        fs.existsSync(sock) && fs.unlinkSync(sock);
    });

    function asyncAssert(logic, done, more) {
        try {
            logic();
        } catch (e) {
            done(e);
            return;
        }
        more || done();
    }

    function sample(lines, options, callback) {
        if (typeof(options) == 'function') {
            callback = options;
            options = {};
        }
        var endpoint = options && options.endpoint || ('unix:' + sock);
        var args = options && options.args || '';
        var child = exec('echo "' + lines.join("\n") + '" | ' + path.join(__dirname, '../cli.js') +
                         ' tun "node ' + path.join(__dirname, 'sampler.js') + '"' +
                         ' -e ' + endpoint +
                         ' ' + args,
                         callback);
        return child;
    }

    it('create a single tunnel', function (done) {
        sample(['abcd', '1234', '!'], function (err, stdout, stderr) {
            asyncAssert(function () {
                assert.ok(err == null);
                assert.equal(stdout, "dcba\n4321\n");
            }, done);
        });
    });

    it('pass exit code back', function (done) {
        sample(['abcd', '1234', '!2'], function (err, stdout, stderr) {
            asyncAssert(function () {
                assert.ok(err);
                assert.equal(err.code, 2);
                assert.equal(stdout, "dcba\n4321\n");
            }, done);
        });
    });
});
