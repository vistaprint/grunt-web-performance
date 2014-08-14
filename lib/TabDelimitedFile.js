'use strict';

var fs = require('fs');
var FileHeader = require('./FileHeader');
var FileRow = require('./FileRow');

function trim(str) {
    return str.replace(/^\s+|\s+$/g, '');
}

function TabDelimitedFile(filePath) {
    var contents = trim(fs.readFileSync(filePath, 'utf8'));
    var lines = contents.split('\n');

    this.header = new FileHeader(lines.shift());
    this.rows = [];

    lines.forEach(function (line) {
        this.rows.push(new FileRow(this.header, line));
    }, this);
}

TabDelimitedFile.prototype.write = function (filePath, cb) {
    var writer = fs.createWriteStream(filePath, {
        flags: 'w',
        encoding: 'utf8',
        mode: '0666'
    });

    var self = this;

    writer.on('open', function () {
        writer.write(self.header.toString() + '\n');

        self.rows.forEach(function (row) {
            writer.write(row.toString() + '\n');
        });

        writer.end(cb);
    });
};

TabDelimitedFile.prototype.removeRow = function (i) {
    this.rows.splice(i, 1);
};

TabDelimitedFile.prototype.addColumnAfter = function (after, column) {
    this.header.addColumnAfter(after, column);
};

module.exports = TabDelimitedFile;