var path = require('path');
var nconf = require('nconf');

// Note:if you're running your app with a launcher like pm2 or running mocha tests, this method will fail.
var appDir = path.dirname(require.main.filename);

// Setup nconf to use (in-order):
//   1. Command-line arguments
//   2. Environment variables
//   3. A file located at '<appdir>/config.local.json'
//   4. A file located at '<appdir>/config.json'
nconf.argv();
nconf.env();
var localConfig = nconf.get('localConfig');
if (typeof localConfig === 'string') {
	nconf.file('localConfig', path.join(appDir, localConfig));
} else {
	nconf.file('localConfig', path.join(appDir, 'config.local.json'));
}
nconf.file(path.join(appDir, 'config.json'));

module.exports = nconf;
