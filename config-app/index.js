const async = require('async');
const express = require('express');
const ipfilter = require('express-ipfilter').IpFilter
const Database = require('./lib/database');
const ovpninfo = require('./common/ovpninfo');
const conf = require('./common/config');
const logger = require('./common/logger');

const app = express();
const db = new Database(conf.get('database'));

const port = conf.get('port');
const ips = conf.get('ipfilter');

app.use(express.json());
app.use(ipfilter(ips, { log: false }));
app.use((req,res,next) => {
    let ipParts = req.connection.remoteAddress.split(':');
    let ipv4 = ipParts[ipParts.length - 1];
    ovpninfo.listConnectedClients((err, clients) => {
        if(!err){
            for(let client of clients){
                if(client['VirtualAddress'] === ipv4){
                    req.ovpnname = client['CommonName'];
                    break;
                }
            }
        }
        next();
    });
})

app.get('/', (req, res) => {
    if (req.ovpnname) {
        res.send('Hello, '+req.ovpnname+'!');    
    }
    else{
        res.send('Hello, Stranger!');
    }
})

app.use('/list-rules', (req, res) => {
    db.getForwardRulesForUser(req.ovpnname, (err,rules) => {
        if(err){
            res.status(500).json([]);
        }
        else{
            res.json(rules.map(
                (rule) => {
                    return {
                        serverPort: rule.local_port,
                        clientPort: rule.remote_port
                    }
                 }
            ));
        }
    });
})

app.use('/ports-in-use', (req, res) => {
    db.getLocalPortsInUse((err, ports) => {
        if (err) {
            res.status(500).json([]);
        }
        else {
            res.json(ports.map(
                (port) => {
                    return {
                        serverPort: port.local_port
                    }
                }
            ));
        }
    });
})

app.use('/add-rule', (req, res) => {
    if(req.body.serverPort && req.body.clientPort && req.ovpnname){
        db.addForwardRule(
            req.ovpnname,
            req.body.serverPort,
            req.body.clientPort,
            (err) => {
                if (err) {
                    res.status(500).json({success:false});
                }
                else {
                    res.json({success:true});
                }
            }
        );
    }
    else{
        res.status(400).json({success:false});
    }
})

app.use('/remove-rule', (req, res) => {
    if (req.body.serverPort && req.ovpnname) {
        db.removeForwardRule(
            req.ovpnname,
            req.body.serverPort,
            (err) => {
                if (err) {
                    res.status(500).json({ success: false });
                }
                else {
                    res.json({ success: true });
                }
            }
        );
    }
    else {
        res.status(400).json({ success: false });
    }
})

let server;
const init = (callback) => {
    async.series(
        [
            (callback) => { db.init(callback); },
            (callback) => {
                server = app.listen(port, (err) => {
                    if(!err){
                        logger.info(`Example app listening at http://localhost:${port}`);
                    }
                    callback(err);
                });
            }
        ],
        (err) => {
            callback(err);
        }
    )
}

const close = (callback) => {
    async.series(
        [
            (callback) => {
                if(server){
                    server.close((err) => {
                        if(err){
                            logger.error('Failed to close server', err);
                        }
                        callback();
                    });
                }
                else{
                    async.setImmediate(callback);
                }
            },
            (callback) => {
                db.close((err) => {
                    if (err) {
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
