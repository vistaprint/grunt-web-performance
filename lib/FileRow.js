'use strict';

function FileRow(header, line) {
    this.header = header;
    this.cells = {};

    var values = line.split('\t');
    var c = Math.min(values.length, this.header.getColumnCount());
    for (var i = 0; i < c; i++)
    {
        var column = this.header.getColumn(i);
        this.cells[column] = values[i];
    }
}

FileRow.prototype.has = function (column) {
    if (this.validColumn(column) && this.cells[column] !== undefined) {
        return true;
    } else {
        return false;
    }
};

FileRow.prototype.get = function (column) {
    if (this.validColumn(column)) {
        return this.cells[column];
    } else {
        return undefined;
    }
};

FileRow.prototype.set = function (column, value) {
    if (this.validColumn(column)) {
        this.cells[column] = value;
    }
};

FileRow.prototype.validColumn = function (column) {
    if (!this.header.containsColumn(column)) {
        throw new Error('Unknown column: ' + column);
    }
    return true;
};

FileRow.prototype.toString = function () {
    var builder = '';
    var c = this.header.getColumnCount();
    for (var i = 0; i < c; i++)
    {
        if (i > 0)
        {
            builder += '\t';
        }

        // lookup what column should be in this position
        var column = this.header.getColumn(i);
        builder += this.cells[column] || '';
    }

    return builder;
};

module.exports = FileRow;