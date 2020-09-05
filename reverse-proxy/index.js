const async = require('async');
const httpProxy = require('http-proxy');
const Database = require('./lib/database');
const ovpninfo = require('./common/ovpninfo');
const conf = require('./common/config');
const logger = require('./common/logger');

const forwardRules = {};
const db = new Database(conf.get('database'));
let updateIntervalMS = conf.get('proxyUpdateInterval');
let updateTask;

const init = (callback) =>{
    async.series(
        [
            (callback) => { db.init(callback); }
        ],
        (err) => {
            if(err) {
                callback(err);
            }
            else {
                updateTask = setInterval(updateForwardProxies, updateIntervalMS);
                callback();
            }
        }
    )
}

const close = (callback) => {
    clearInterval(updateTask);
    async.series(
        [
            (callback) => {
                async.each(
                    Object.keys(forwardRules),
                    (local_port, callback) => {
                        removeProxy(local_port, (err)=> {
                            if(err){
                                logger.error('Failed to close proxy:'+local_port, err);
                            }
                            callback();
                        });
                    },
                    () => { 
                        callback();
                    }
                )
            },
            (callback) => { 
                db.close((err) => {
                    if(err){
                        logger.error('Failed to close database', err);
                    }
                    callback();
                }); 
            }
        ],
        () => {
            callback();
        }
    )
}

const addProxy = (localPort, target, callback) => {
    logger.info('Adding proxy: '+localPort+'->'+target.host+':'+target.port+' ...');
    forwardRules[localPort] = Object.assign(target, {
        proxy: httpProxy.createProxyServer({ target: target })
    });

    forwardRules[localPort].proxy.on('error', function (err, req, res) {
        res.writeHead(500, {
            'Content-Type': 'text/plain'
        });
        res.end('Service currently unavailable.');
    });
    forwardRules[localPort].proxy.listen(localPort);
    async.setImmediate(callback);
}

const removeProxy = (localPort, callback) => {
    if (forwardRules[localPort]){
        logger.info('Removingng proxy: ' + localPort + '->' + forwardRules[localPort].host + ':' + forwardRules[localPort].port + ' ...');
        forwardRules[localPort].proxy.close((err)=>{
            delete forwardRules[localPort];
            callback(err);
        });
    }
    else{
        async.setImmediate(callback);
    }
}

const getCurrentForwardRules = (callback) => {
    const listConnectedClients = (callback) => {
        ovpninfo.listConnectedClients(callback);
    }
    const getForwardRules = (callback) => {
        db.getForwardRules(callback);
    }
    async.parallel(
        [
            listConnectedClients,
            getForwardRules
        ],
        (err, results) => {
            if(err){
                callback(err);
            }
            else{
                let connectedClients = {};
                let rules = {};
                for(let clientInfo of results[0]){
                    connectedClients[clientInfo['CommonName']] = clientInfo['VirtualAddress']; 
                }
                for(let rule of results[1]){
                    if(connectedClients[rule['remote_user']]){
                        rules[rule['local_port']] = {
                            host: connectedClients[rule['remote_user']],
                            port: rule['remote_port']
                        };
                    }
                }
                callback(null, rules);
            }
        }
    )
};

const updateForwardProxies = () => {
    let toRemove = [];
    let toAdd = {};

    const getForwardRuleDifferences = (newRules) => {
        for(let local_port in newRules){
            if(!forwardRules[local_port]){
                toAdd[local_port] = newRules[local_port];
            }
            else if (forwardRules[local_port].host !== newRules[local_port].host 
                || forwardRules[local_port].port !== newRules[local_port].port
            ){
                toRemove.push(local_port);
                toAdd[local_port] = newRules[local_port];
            }
        }
        for(let local_port in forwardRules){
            if (!newRules[local_port]) {
                toRemove.push(local_port);
            }
        }
    }

    const calculateForwardRuleDifferences = (callback) => {
        getCurrentForwardRules((err, newRules) => {
            if (err) { callback(err); }
            else {
                getForwardRuleDifferences(newRules);
                callback();
            }
        });
    }

    const addDiffProxys = (callback) => {
        async.eachOfSeries(
            toAdd,
            (target,local_port,callback)=>{
                addProxy(local_port, target, callback);
            },
            (err) => { callback(err); }
        );
    }

    const removeDiffProxys = (callback) => {
        async.eachSeries(
            toRemove,
            (local_port, callback) => {
                removeProxy(local_port, callback);
            },
            (err) => { callback(err); }
        );
    }

    async.series(
        [
            calculateForwardRuleDifferences,
            removeDiffProxys,
            addDiffProxys
        ],
        (err) => {
            if(err) {
                logger.error('Proxy update failed', err);
            }
            else {
                logger.debug('Proxy update succeeded');
            }
        }
    );
};

let gracefulExitInProgress = false;

const gracefulExit = (code) => {
    if (!gracefulExitInProgress) {
        gracefulExitInProgress = true;
        close((err) => {
            if (err) {
                console.error("Failed to close application: ", err);
            }
            else {
                console.log("Application closed successfully!");
            }
            process.exit(code);
        });

        setTimeout(function () {
            console.error("Could not close application in time, forcefully shutting down");
            process.exit(code);
        }, 5000);
    }
}

// happens when you press Ctrl+C
process.on('SIGINT', function () {
    logger.info('Gracefully shutting down from  SIGINT (Crtl-C)');
    gracefulExit(0);
});

// usually called with kill
process.on('SIGTERM', function () {
    logger.info('Parent SIGTERM detected (kill)');
    gracefulExit(0);    // exit cleanly
});

process.on('uncaughtException', function (err) {
    logger.error('Uncaught Exception', err);
    gracefulExit(0);
});

init((err) => {
    if (err) {
        logger.error("Application failed to initialize");
        gracefulExit(0);
    }
    else {
        logger.info("Application initialized");
    }
});