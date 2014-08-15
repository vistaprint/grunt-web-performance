module.exports = function (grunt) {
	return {
		webpagetest: require('./webpagetest')(grunt)
	}
};
