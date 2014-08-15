var fs = require('fs');
var url = require('url');
var _ = require('lodash');
var moment = require('moment');
var request = require('request');

const RUN_TEST_URL = "http://www.webpagetest.org/runtest.php";
const CHECK_FOR_TEST_READY_URL = "http://www.webpagetest.org/testStatus.php?f=json&test=";

var defaults = {
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

var failEarly = false;

module.exports = function (grunt) {
    var runner = function webpagetest(options) {
        this.options = _.extend({}, defaults, options);
    };

    // provide a name for console messages
    runner.prototype.toString = function () {
        if (this.options.label) {
            return this.options.label;
        } else {
            return this.options.url;
        }
    }

    // run the test
    runner.prototype.run = function (cb) {
        queue.call(this, function (err) {
            if (err) {
                grunt.log.error('Failed to queue test for:', this.options.url, err);
                cb(err);
                return;
            }

            grunt.log.ok('Queued test for:', testOptions.url)

            // start waiting for results
            ready(this.id, function (err) {
                if (err) {
                    cb(err);
                    return;
                }

                grunt.verbose.ok('Results are available');
                results.call(this, cb);
            }.bind(this));
        }.bind(this));
    };

    // return a list of files and their data to be saved
    runner.prototype.getSaveFiles = function () {
        var files = {};

        // generic results
        files[this.options.label + '-' + moment().format('YYYY-MM-DD') + '.json'] = this.results;

        // extended results file
        return files;
    };

    // queue the test on webpagetest
    var queue = function (cb) {
        grunt.verbose.writeln("-- requesting:", url);

        var url = buildQueueUrl(this.options);

        // see https://sites.google.com/a/webpagetest.org/docs/advanced-features/webpagetest-restful-apis
        request(url function (err, res, body) {
            if (err) {
                return cb(err);
            }

            /**
             * Response looks similar to:
             * { statusCode: 200, statusText: 'Ok', data: {
                testId: '140814_P2_SWR',
                ownerKey: 'f234361f2e20b06100a0cdb069f2a69b50568df9',
                jsonUrl: 'http://www.webpagetest.org/jsonResult.php?test=140814_P2_SWR',
                xmlUrl: 'http://www.webpagetest.org/xmlResult/140814_P2_SWR/',
                userUrl: 'http://www.webpagetest.org/result/140814_P2_SWR/',
                summaryCSV: 'http://www.webpagetest.org/result/140814_P2_SWR/page_data.csv',
                detailCSV: 'http://www.webpagetest.org/result/140814_P2_SWR/requests.csv'
             * }
            }*/

            var data = JSON.parse(body);

            if (!data) {
                return cb(new Error('Unexpected response from testing service.'));
            }

            this.statusCode = res.statusCode;
            this.id = res.data.testId;
            this.queueData = res;

            cb(null);
        }.bind(this));
    };

    // check if the test results are ready
    var ready = function (testId, cb) {
        var checkTestStatus = function () {
            request(CHECK_FOR_TEST_READY_URL + testId, function (err, res, body) {
                if (err) {
                    grunt.log.error('Request to check on test status failed.');
                    cb(err);
                    return;
                }

                var data = JSON.parse(body);

                if (data && data.statusCode == 200) {
                    cb(null); // test is complete (status 200)
                } else {
                    // if we either don't want to fail early or the test is running (status 100-200)
                    if (!failEarly || (data.statusCode >= 100 && data.statusCode < 200)) {
                        grunt.verbose.writeln('Results are not yet available. Will try again in 20 seconds.', data.data.statusText);
                        setTimeout(checkTestStatus, 20000);
                    } else {
                        // we want to fail early, so spit out an error
                        return cb(new Error('Unexpected response from testing service.'));
                    }
                }
            });
        });

        grunt.verbose.writeln('Waiting for results. Test id:', testId);
        setTimeout(checkTestStatus, 20000);
    };

    // get results from webpagetest
    var results = function (cb) {
        request(this.queueData.data.jsonUrl, function (err, res, body) {
            if (err) {
                return cb(err);
            }

            this.rawResults = body;
            this.results = JSON.parse(body);

            if (!this.results || this.results.statusCode != 200) {
                return cb(new Error('Unexpected response from testing service.'));
            }

            this.meta = {
                testId: this.results.data.id, // should be identical to this.id
                url: this.results.data.url, // should be identical to this.options.url
                summary: this.results.data.summary, // summary view link on webpagetest.org
                from: this.results.data.from,
                bandwidthDown: this.results.data.bwDown, // bandwidth used in bytes (downstream)
                bandwidthUp: this.results.data.bwUp, // bandwidth used in bytes (upstream)
                latency: this.results.data.latency, // dns latency in ms
                completed: this.results.data.completed, // datetime test completed
            };

            var parseRun = function (run) {
                return {
                    firstView: run.firstView,
                    repeatView: run.repeatView,

                    // save: function (testName) {
                    //     var data = _.extend({}, this.data, {
                    //         TestDate: Date.getTime(),
                    //         TestName: testName,
                    //         IsFirstView: isFirstView
                    //     });
                    //     // TODO: Insert into a database
                    // }
                };
            };

            // parse out each run
            this.runs = _.map(_.values(this.results.data.runs), parseRun);

            // use the average information provided
            this.average = parseRun(this.results.data.average);
            this.median = parseRun(this.results.data.median);
            this.standardDeviation = parseRun(this.results.data.standardDeviation);

            cb(null);
        }.bind(this));
    };

    // get extra raw data from webpagetest
    var extra = function (dir, cb) {
        var onComplete = cb;
        var forceOverride = false;

        // contains an array of HTTP requests to download
        var requests = [];

        var self = this;

        this.runs.forEach(function (run, runNumber) {
            _.each(run, function (view, viewData) {
                // view will be 'firstView' or 'repeatView'
                _.each(viewData.rawData, function (dataFile, dataFileUrl) {
                    // dataFile will be headers, pageData, requestsData, utilization
                    var filename = [self.name, view, dataFile, self.date].join('-') + path.extname(dataFileUrl);
                    var saveAs = path.join(dir, filename);

                    requests.push({
                        file: saveAs,
                        url: dataFileUrl
                    });
                });
            });
        });

        // starting downloading the extra files, one at a time
        downloadOne();

        function download(url, saveAs) {
            grunt.log.writeln('Getting raw data for', path.basename(saveAs));

            if (!forceOverride && fs.existsSync(saveAs) && fs.statSync(saveAs).size > 0) {
                grunt.verbose.writeln(' Raw data file exists, not downloading. forceOverride is false.');
                return downloadOne();
            }

            grunt.verbose.ok('Getting raw data file:', url);

            request(url, function (err, res, data) {
                if (err) {
                    grunt.log.error(' Request for raw data file failed:' + url, err);
                    return downloadOne();
                }

                grunt.verbose.writeln(' Downloaded ' + data.length + ' characters.\n');

                // only save the file if it's not empty
                if (data.length > 0) {
                    fs.writeFile(saveAs, data, { encoding: 'utf8' }, function (err) {
                        if (err) {
                            grunt.log.error(' Failed to save raw data file to:', saveAs);
                        }

                        downloadOne();
                    });
                } else {
                    downloadOne();
                }
            });
        }

        function downloadOne() {
            if (requests.length > 0) {
                var req = requests.shift();
                download(req.url, req.file);
            } else {
                onComplete();
            }
        }
    };

    var buildQueueUrl = function (o) {
        var urlObj = url.parse(RUN_TEST_URL);

        urlObj.search = null;
        
        var params = {
            'url': o.url
        };

        if (o.label) {
            params.label = o.label;
        }

        if (o.location) {
            params.location = o.location;
        }

        params.k = o.key;
        params.f = 'json';
        params.runs = o.runs;
        params.fvonly = o.firstViewOnly ? 1 : 0;
        params['private'] = o['private'] ? 1 : 0;
        params.connections = o.connections;
        params.web10 = o.web10 ? 1 : 0;
        params.noopt = o.noOptimizations ? 1 : 0;
        params.noimages = o.noImages ? 1 : 0;
        params.noheaders = o.noHeaders ? 1 : 0;
        params.noscript = o.noScript ? 1 : 0;
        params.mobile = o.mobile ? 1 : 0;
        params.notify = o.notify;
        
        if (o.video) {
            params.video = 1;
            params.mv = o.medianVideoOnly ? 1 : 0;
        }

        urlObj.query = params;

        return url.format(urlObj);
    };

    return runner;
};