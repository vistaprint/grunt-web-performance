var url = require('url');
var _ = require('lodash');
var moment = require('moment');
var request = require('request');

const RUN_TEST_URL = "http://www.webpagetest.org/runtest.php";
const CHECK_FOR_TEST_READY_URL = "http://www.webpagetest.org/testStatus.php?f=json&test=";

module.exports = function (grunt) {

    var TestModel = function (properties) {
        this.id = null;
        this.statusCode = null;
        this.properties = properties || {};
        this.testResults = null;
        this.testResultRawData = null;

        // pull some data out of properties
        this.name = this.properties.label;

        this.date = moment().format('YYYY-MM-DD');

        this.runs = []; // array of runs
        this.average = {};
        this.median = {};
        this.standardDeviation = {};
    };

    // public
    TestModel.prototype.onReady = function (cb) {
        var isTestReady = false;

        var checkTestStatus = function () {
            this.request(CHECK_FOR_TEST_READY_URL + this.id, function (err, res) {
                if (err) {
                    return cb(err);
                }

                if (res.statusCode >= 100 && res.statusCode < 200) {
                    grunt.verbose.writeln('Results are not yet available. Will try again in 20 seconds.', res.data.statusText);
                    setTimeout(checkTestStatus, 20000);
                } else if (res.statusCode == 200) {
                    grunt.verbose.ok('Results are available');
                    this.getResults(cb);
                } else {
                    return cb(new Error('Unexpected response from testing service.'));
                }
            }.bind(this));
        }.bind(this);

        setTimeout(checkTestStatus, 20000);
    };

    // private
    TestModel.prototype.getResults = function (cb) {
        this.request(this.queueData.data.jsonUrl, function (err, res, raw) {
            if (err) {
                return cb(err);
            }

            if (res.statusCode != 200) {
                return cb(new Error('Unexpected response from testing service.'));
            }

            this.testResults = res;
            this.testResultRawData = raw;

            this.meta = {
                testId: res.data.id,
                url: res.data.url,
                summary: res.data.summary, // summary view on webpagetest.org
                from: res.data.from,
                bandwidthDown: res.data.bwDown,
                bandwidthUp: res.data.bwUp,
                latency: res.data.latency,
                completed: res.data.completed,
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
            this.runs = _.map(_.values(res.data.runs), parseRun);

            // use the average information provided
            this.average = parseRun(res.data.average);
            this.median = parseRun(res.data.median);
            this.standardDeviation = parseRun(res.data.standardDeviation);

            cb(null);
        }.bind(this));
    };

    // public
    TestModel.prototype.queue = function(cb) {
        // see https://sites.google.com/a/webpagetest.org/docs/advanced-features/webpagetest-restful-apis
        this.request(ToQueryString(this.properties), function (err, res) {
            if (err) {
                return cb(err);
            }

            if (!res || !res.data) {
                return cb(new Error('Unexpected response from testing service.'));
            }

            this.statusCode = res.statusCode;
            this.id = res.data.testId;
            this.queueData = res;

            /*
            {
                statusCode: 200,
                statusText: 'Ok',
                data: {
                    testId: '140814_P2_SWR',
                     ownerKey: 'f234361f2e20b06100a0cdb069f2a69b50568df9',
                     jsonUrl: 'http://www.webpagetest.org/jsonResult.php?test=140814_P2_SWR',
                     xmlUrl: 'http://www.webpagetest.org/xmlResult/140814_P2_SWR/',
                     userUrl: 'http://www.webpagetest.org/result/140814_P2_SWR/',
                     summaryCSV: 'http://www.webpagetest.org/result/140814_P2_SWR/page_data.csv',
                     detailCSV: 'http://www.webpagetest.org/result/140814_P2_SWR/requests.csv'
                }
            }
            */

            cb(null);
        }.bind(this));
    };

    TestModel.prototype.getExtraData = function (dir, onComplete, forceOverride) {
        forceOverride = forceOverride === true;

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
    }

    // private
    TestModel.prototype.request = function (url, cb) {
        grunt.verbose.writeln("-- requesting:", url);
        request(url, function (err, res, body) {
            if (err) {
                cb(err);
            } else {
                cb(null, JSON.parse(body), body);
            }
        });
    };


    function ToQueryString(o) {
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

    return TestModel;

};