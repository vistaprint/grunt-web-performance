'use strict';

function FileHeader(line) {
    var _columnList = [];
    var _columnDictionary = {};

    _columnList = line.split('\t');

    function updateDict() {
        _columnDictionary = {};

        _columnList.forEach(function (column, i) {
            _columnDictionary[column] = i;
        });
    }

    updateDict();

    this.getColumnIndex = function (column) {
        return _columnDictionary[column];
    };

    this.getColumn = function (index) {
        return _columnList[index];
    };

    this.containsColumn = function (column) {
        return _columnDictionary[column] !== undefined;
    };

    this.addColumnAfter = function (after, column) {
        if (_columnDictionary[column] !== undefined) {
            throw new Error('Duplicate column:' + column);
        }

        var iAfter = _columnDictionary[after];
        var iColumn = iAfter + 1;
        _columnList.splice(iColumn, 0, column);
        updateDict();
    };

    this.getColumnCount = function () {
        return _columnList.length;
    };

    this.toString = function () {
        return _columnList.join('\t');
    };
}

module.exports = FileHeader;