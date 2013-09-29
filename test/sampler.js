require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
}).on('line', function (line) {
    if (line[0] == '!') {
        var code = parseInt(line.substr(1));
        process.exit(isNaN(code) ? 0 : code);
    } else {
        var output = process.stdout;
        if (line[0] == '&') {
            output = process.stderr;
            line = line.substr(1);
        }
        output.write(line.split('').reverse().join('') + "\n");
    }
}).resume();
