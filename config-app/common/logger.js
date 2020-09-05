const winston = require('winston');
const path = require('path');
const fs = require('fs');
const conf = require('./config');
const util = require('util')

require('winston-daily-rotate-file');


let logDir = conf.get("logdir");

if (!logDir) {
	const logFile = conf.get("logfile");	// logfile is obsolete
	if (!logFile) {
		// Note:if you're running your app with a launcher like pm2 or running mocha tests, this method will fail.
		const appDir = path.dirname(require.main.filename);
		logDir = path.join(appDir, 'logs');
	}
	else {
		logDir = path.dirname(logFile);
	}
}

let maxSize = conf.get('logmaxsize') || '20m'
let maxFiles = conf.get('logmaxfiles') || '14d'

// ensure log directory exists
fs.existsSync(logDir) || fs.mkdirSync(logDir)


///////////////////////////////////////////////
// Log levels:
//   0 - silly
//   1 - debug
//   2 - verbose
//   3 - info
//   4 - warn
//   5 - error
///////////////////////////////////////////////

const logger = winston.createLogger({
	transports: [
		new winston.transports.DailyRotateFile({
			level: 'info',

			format: winston.format.combine(
				winston.format.timestamp({
					format: 'YYYY-MM-DD HH:mm:ss'
				}),
				winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
			),

			filename: path.join(logDir, 'application-%DATE%.log'),
			datePattern: 'YYYY-MM-DD-HH',
			zippedArchive: true,
			maxSize: maxSize,
			maxFiles: maxFiles
		}),
		new winston.transports.Console({
			level: 'debug',

			format: winston.format.combine(
				winston.format.timestamp({
					format: 'YYYY-MM-DD HH:mm:ss'
				}),
				winston.format.colorize({ level: true }),
				winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
			)
		})
	],
	exitOnError: false
});

logger.emitErrs = true;

logger.on('error', function (err) {
	console.log(err);
});

logger.logDir = logDir;

const wrapLog = (args) => {
	let ret = "";
	let sep = ""
	let isDate = (arg) => {
		if (util.types) {
			return util.types.isDate(arg)
		}
		return util.isDate(arg)
	}
	for (let i in args) {
		let arg = args[i];
		let type = typeof arg;
		let addBreakLine = (type != "string" && type != "number" && !isDate(arg) && i > 0)
		if (addBreakLine && (sep == "" || sep == " ")) {
			sep = "\n"
		}
		ret += sep + util.format(arg)
		if (!addBreakLine) {
			sep = " "
		}
	}
	return ret;
}

const wrapper = {
	logDir: logger.logDir,

	log: (level, ...args) => { logger.log(level, wrapLog(args)) },
	silly: (...args) => { logger.silly(wrapLog(args)) },
	debug: (...args) => { logger.debug(wrapLog(args)) },
	verbose: (...args) => { logger.verbose(wrapLog(args)) },
	info: (...args) => { logger.info(wrapLog(args)) },
	warn: (...args) => { logger.warn(wrapLog(args)) },
	error: (...args) => { logger.error(wrapLog(args)) },

	on: (event, handler) => {logger.on(event,handler)},

	end: (fn) => {
		logger.end();
		logger.on('finish', function () {
			// Unfortunatelly the file transport does not complete the logging, so a minor delay is welcome
			setTimeout(fn.bind(this), 500);
		});
		logger.on('error', fn);
	}
}

module.exports = wrapper;
