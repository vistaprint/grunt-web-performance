'use strict';

var fs = require('fs');
var path = require('path');
var _ = require('lodash');

module.exports = function (grunt) {
    var tests = [];

    grunt.registerTask('web-performance', function () {
        var services = require('../lib/services/index')(grunt);
        var options = this.options({ tests: [] });
        var taskComplete = this.async();

        function runTest(testOptions, next) {
            if (!testOptions.service) {
                grunt.log.error('No test service provided for a test.');
                next();
                return;
            }

            var service = services[testOptions.service.toLowerCase()];

            if (!service) {
                grunt.log.error('Unsupported service requested:', testOptions.service);
                next();
                return;
            }

            var test = new service(testOptions);
            tests.push(test);

            grunt.log.writeln('Running test for:', test.toString());

            test.run(function (err) {
                grunt.log.ok('Test finished, saving results.');

                if (options.saveRawDataTo) {
                    test.getExtraData(options.saveRawDataTo, next);
                } else {
                    next();
                }
            });}
        }

        grunt.util.async.forEachSeries(options.tests, runTest);
    });

    // send out an email summary with highlights of recent results
    grunt.registerTask('web-performance-email-summary', function () {
        var nodemailer = require('nodemailer');
        var jade = require('jade');

        var options = this.options({
            nodemailer: {},
            mailOptions: {},
            sendAttachments: false
        });

        // create reusable transporter object using SMTP transport
        var transporter = nodemailer.createTransport(options.nodemailer);

        var mailOptions = options.mailOptions;

        if (!mailOptions.subject) {
            mailOptions.subject = 'grunt-web-performance summary report';
        }

        var results = '';
        var attachments = [];

        var getTestData = function (test, next) {
            if (options.sendAttachments) {
                attachments.push({
                    filename: test.getFileName(),
                    content: test.rawResults
                });
            }
        };

        var sendReport = function () {
            mailOptions.html = jade.renderFile('email-summary.jade', {
                tests: tests
            });

            if (options.sendAttachments) {
                mailOptions.attachments = attachments;
            }

            transporter.sendMail(mailOptions, function (err, info) {
                if (err) {
                    console.warn("Failed to send email");
                } else {
                    console.log("Sent email:", info.response);
                }
            });
        };

        grunt.util.async.forEachSeries(tests, saveTest, sendReport);
    });

    grunt.registerTask('web-performance-save-results', function () {
        var options = this.options({
            directory: null
        });

        var saveTest = function (test, next) {
            // save the results files
            if (_.isFunction(test.getSaveFiles)) {
                var files = test.getSaveFiles();

                files.forEach(function (fileName, contents) {
                    var saveAs = path.join(options.directory, fileName);
                    fs.writeFileSync(saveAs, contents, { encoding: 'utf8' });
                });
            }

            next();
        };

        grunt.util.async.forEachSeries(tests, saveTest);
    });
};