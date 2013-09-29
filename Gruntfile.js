var _ = require('underscore');

module.exports = function (grunt) {
    grunt.initConfig({
        shell: {
            build: {
                command: 'go install all',
                options: {
                    stdout: true,
                    stderr: true,
                    failOnError: true,
                    execOptions: {
                        env: _.extend(_.clone(process.env), { GOPATH: __dirname })
                    }
                }
            }
        }
    });
    grunt.loadNpmTasks('grunt-shell');
    grunt.registerTask('build', ['shell:build']);
    grunt.registerTask('default', ['build']);
};