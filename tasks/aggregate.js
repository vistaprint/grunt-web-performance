module.exports = function (grunt) {
    grunt.registerTask('web-performance-combine', '', function () {
        var done = this.async();

        function trim(str) {
            return str.replace(/^\s+|\s+$/g, '');
        }

        function combineFiles(target, header, sources, delim) {
            var rowCombined = 0;
            var fileNumberOriginal = 0;
            var rowOriginal;

            var writer = fs.createWriteStream(target, {
                flags: 'w',
                encoding: 'utf8',
                mode: '0666'
            });

            function writeln(data) {
                writer.write(data + '\n', 'utf8');
            }

            writer.on('open', function () {
                writeln(header);

                sources.forEach(function (source) {
                    fileNumberOriginal++;
                    rowOriginal = 0;
                    var reader = fs.readFileSync(source, 'utf8').toString().split(/\n/);

                    reader.forEach(function (line, i) {
                        // ignore the header
                        if (i === 0) {
                            return;
                        }

                        rowCombined++;
                        rowOriginal++;

                        writeln(
                            [rowCombined, source, fileNumberOriginal, rowOriginal, trim(line)].join(delim)
                        );
                    });
                });

                writer.end(callback);
            });

        }

        function run(sourceFiles, target) {
            var delim = '\t';

            // make files absolute paths
            sourceFiles = path.join(rootFolder, 'data', sourceFiles);
            target = path.join(rootFolder, target);

            // expand the source files to search for all files matching pattern
            sourceFiles = grunt.file.expand(sourceFiles);

            grunt.log.writeln('Found ' + sourceFiles.length + ' sources');

            // read the first file to get the header data
            var lines = fs.readFileSync(sourceFiles[0], lines).toString().split('\n');
            var header = 'RowCombined\tFileNameOriginal\tFileNumberOriginal\tRowOriginal\t' + trim(lines[0]);

            combineFiles(target, header, sourceFiles, delim);
        }

        var soFar = 0;
        var combinations = [
            {
                'sources': 'FirstVisitHomepage-firstView-requestsData-20*.txt',
                'target': 'FirstVisitHomepage-firstView-requestsData-combined.txt'
            }, {
                'sources': 'FirstVisitHomepage-repeatView-requestsData-20*.txt',
                'target': 'FirstVisitHomepage-repeatView-requestsData-combined.txt'
            }, {
                'sources': 'ReturningCustomerHomepage-firstView-requestsData-20*.txt',
                'target': 'ReturningCustomerHomepage-firstView-requestsData-combined.txt'
            }, {
                'sources': 'ReturningCustomerHomepage-repeatView-requestsData-20*.txt',
                'target': 'ReturningCustomerHomepage-repeatView-requestsData-combined.txt'
            }, {
                'sources': 'Gallery-firstView-requestsData-20*.txt',
                'target': 'Gallery-firstView-requestsData-combined.txt'
            }, {
                'sources': 'Gallery-repeatView-requestsData-20*.txt',
                'target': 'Gallery-repeatView-requestsData-combined.txt'
            }
        ];

        function callback() {
            if (soFar === combinations.length) {
                grunt.log.writeln('completed');
                done();
            } else {
                grunt.log.writeln('Combining: ', combinations[soFar].sources, ' = ', combinations[soFar].target);
                run(combinations[soFar].sources, combinations[soFar].target);
                soFar++;
            }
        }

        callback();
    });

    grunt.registerTask('web-performance-munge', '', function () {
        var done = this.async();
        var SantizedURL = 'SanitizedURL';
        var URL = 'URL';
        var Content_Type = 'Content Type';
        var Content_Group = 'Content Group';
        var Host = 'Host';
        var IsVistaprintHosted = 'IsVistaprintHosted';

        var TabDelimitedFile = require('../lib/TabDelimitedFile');

        var ContentTypeGroupMap = {
            'application/javascript': 'javascript',
            'application/x-javascript': 'javascript',
            'application/json': 'json',
            'image/gif': 'image',
            'image/jpeg': 'image',
            'image/png': 'image',
            'image/x-icon': 'image',
            'text/css': 'css',
            'text/html': 'html',
            'text/javascript': 'javascript',
            'text/plain': 'text',
            'font/eot': 'font',
            '': 'unknown'
        };

        function addContentGroupColumn(requestsData)
        {
            requestsData.addColumnAfter(Content_Type, Content_Group);
            requestsData.rows.forEach(function (row) {
                var contentType = (row.get(Content_Type) || '').toLowerCase();
                var semi = contentType.indexOf(';');
                if (semi !== -1)
                {
                    contentType = contentType.substring(0, semi);
                }

                row.set(Content_Group, ContentTypeGroupMap[contentType]);
            });
        }

        function run(sourceFilePath, targetFilePath) {
            var requestsData = new TabDelimitedFile(sourceFilePath);

            // remove summary rows (rows where "Host" column is empty)
            var removed = 0;
            requestsData.rows.forEach(function (row, i) {
                if (!row.get(Host)) {
                    removed++;
                    requestsData.removeRow(i);
                }
            });
            grunt.log.writeln(' - Removed', removed, 'summary rows');

            // add the content group (to general content types)
            addContentGroupColumn(requestsData);
            grunt.log.writeln(' - Generalized content types into content groups');

            // add "is vistaprinted hosted" column (to help filter third parties)
            requestsData.addColumnAfter(Host, IsVistaprintHosted);
            requestsData.rows.forEach(function (row) {
                var host = row.get(Host);
                var isVistaprintHosted = /(?:vistaprint.com)|(?:vphosted.com)/.test(host);
                row.set(IsVistaprintHosted, isVistaprintHosted ? '1' : '0');
            });
            grunt.log.writeln(' - Added "is vistaprint hosted" column');

            // add "sanitized URL" column (to help filter out our hash codes)
            requestsData.addColumnAfter(URL, SantizedURL);

            requestsData.rows.forEach(function (row) {
                var result = row.get(URL);

                if (row.get(IsVistaprintHosted) === '1') {
                    result = result.replace(/\bsv=\d{2}\.\d\b/, 'sv=XX.X');                 // sv=25.5
                    result = result.replace(/\bhash=-?\d+\b/, 'hash=XXX');                  // hash=1049016115
                    result = result.replace(/\bhc=-?\d+\b/, 'hc=XXX');                      // hc=1811645095
                    result = result.replace(/\/_sv-\d{2}\.\d\//, '/_sv-XX.X/');             // /_sv-25.5/
                    result = result.replace(/\/_hc--?\d+\//, '/_hc-XXX/');                  // /_hc-510823158/
                    result = result.replace(/\bGP=[\d%+af]+(?:AM|PM)\b/, 'GP=XXXX-XX-XX');  // GP=10%2f27%2f2012+10%3a03%3a28+PM
                    result = result.replace(/\bGPS=\d+\b/, 'GPS=XXX');                      // GPS=2605388866
                    result = result.replace(/\btimestamp=\d+\b/, 'timestamp=XXX');          // timestamp=2605388866
                    result = result.replace(/\bts=\d+\b/, 'timestamp=XXX');                 // ts=2605388866
                    result = result.replace(/\/\?_=\d+\//, '?_=XXX');                       // ?_=1368324013206
                }

                row.set(SantizedURL, result);
            });

            grunt.log.writeln(' - Added sanitized URL column');

            // write new merged data to the target path
            requestsData.write(targetFilePath, callback);
        }

        var soFar = 0;
        var combinations = [
            'FirstVisitHomepage-firstView-requestsData-combined.txt',
            'FirstVisitHomepage-repeatView-requestsData-combined.txt',
            'ReturningCustomerHomepage-firstView-requestsData-combined.txt',
            'ReturningCustomerHomepage-repeatView-requestsData-combined.txt',
            'Gallery-firstView-requestsData-combined.txt',
            'Gallery-repeatView-requestsData-combined.txt'
        ];

        function callback() {
            if (soFar === combinations.length) {
                grunt.log.writeln('Completed all munging');
                done();
            } else {
                grunt.log.writeln('Processing: ', combinations[soFar]);
                run(
                    path.join(rootFolder, combinations[soFar]),
                    path.join(rootFolder, combinations[soFar].replace('combined.txt', 'combined-alt.txt'))
                );
                soFar++;
            }
        }

        callback();
    });

    grunt.registerTask('web-performance-aggregate', ['web-performance-combine', 'web-performance-munge']);
};