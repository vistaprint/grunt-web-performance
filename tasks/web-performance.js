'use strict';

var fs = require('fs');
var path = require('path');
var _ = require('lodash');

module.exports = function (grunt) {
    var TestModel = require('../lib/testmodel')(grunt);

    var testDefaults = {
        key: null, // api key, optional
        url: null, // required, url of page to test, must be publicly accessible
        label: null, // label for the test
        location: 'Dulles_IE9.DSL', // look at http://www.webpagetest.org/getLocations.php?f=json
        runs: 1, // number of tests to run (1-10)
        firstViewOnly: false, // if true runs first view only, will not run repeat view (will not test caching)
        Private: true,
        connections: 0, // override the number of concurrent connections IE uses (0 does not override)
        web10: false, // set to true to force the test to stop at Document Complete (onLoad)
        format: 'json', // do not change this
        video: false, // set to true to capture video
        medianVideoOnly: false, // set to true to only capture video for median run, see video above
        notify: null, // email address to notify with test results summary
        mobile: false, // set to true to have chrome emulate mobile browser
        noOptimizations: true, // set to true to disable optimization checks (tests run faster when true)
        noImages: false, // Set to true to disable screen shot capturing
        noHeaders: false, // Set to true to disable saving of http headers, browser status messages and CPU utilization
        noScript: false,
    };

    var defaults = {
        tests: [],
        mailto: null,
        smtpServer: null,
        emailSubject: null,
        saveResultsTo: null,
        saveRawDataTo: null,
    };

    grunt.registerTask('web-performance', function () {
        var options = this.options(defaults);

        var taskComplete = this.async();
        var tests = [];

        function runTest(testOpts, next) {
            var testOptions = _.extend({}, testDefaults, testOpts);

            var test = new TestModel(testOptions);
            tests.push(test);

            grunt.verbose.writeln('Queuing test for:', testOptions.url);

            test.queue(function (err) {
                if (err) {
                    grunt.log.error('Faile dto queue test for:', testOptions.url, err);
                    next();
                    return;
                }

                grunt.log.ok('Queued test for:', testOptions.url)
                grunt.verbose.writeln('Waiting for results. Test id:', test.id);

                test.onReady(function () {
                    grunt.log.ok('Test finished, saving results.');

                    // save data files
                    if (options.saveResultsTo) {
                        try {
                            var saveAs = path.join(options.saveResultsTo, test.name + '-' + test.date + '.json');
                            fs.writeFileSync(saveAs, test.testResultRawData, { encoding: 'utf8' });
                            grunt.verbose.writeln('Saved raw test results to:', saveAs);
                        } catch (ex) {
                            grunt.log.error('Failed to save raw test results file.', ex);
                        }
                    }

                    console.log('Completed Test');

                    // test.firstView.save(testOptions.label, true);
                    // test.repeatView.save(testOptions.label, false);
                    // console.log("Saved data to database");

                    if (options.saveRawDataTo) {
                        test.getExtraData(options.saveRawDataTo, next);
                    } else {
                        next();
                    }
                });
            });
        }

        function onTestsComplete() {
            var async = false;

            var helper = {
                async: function () {
                    async = true;

                    return taskComplete;
                }
            };

            options.onComplete.call(helper, tests);

            if (!async) {
                taskComplete();
            }
        }

        grunt.util.async.forEachSeries(options.tests, runTest, onTestsComplete);
    });
};