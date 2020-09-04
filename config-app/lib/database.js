const async = require('async');
const sqlite3 = require('sqlite3');

class Database {
    constructor(config){
        this.config = config;
    }

    init(callback){
        this.db = new sqlite3.Database(this.config.path, (err) => {
           callback(err);
        });
    }

    close(callback){
        if(this.db){
            this.db.close((err) => {
                callback(err);
            });
        }
        else {
            async.setImmediate(callback);
        }
    }

    getForwardRulesForUser(user, callback){
        const sql = 'SELECT * FROM forward_rules WHERE remote_user = ?';
        this.db.all(sql, [user], (err, rows) => {
            callback(err, rows);
        });
    }

    getLocalPortsInUse(callback){
        const sql = 'SELECT local_port FROM forward_rules';
        this.db.all(sql, [], (err, rows) => {
            callback(err, rows);
        });
    }

    addForwardRule(user, localPort, remotePort, callback){
        const sql = 'INSERT INTO forward_rules (local_port,remote_user,remote_port) VALUES (?,?,?)';
        this.db.run(sql, [localPort, user, remotePort], (err) => {
            callback(err)
        });
    }

    removeForwardRule(user, localPort, callback){
        const sql = 'DELETE FROM forward_rules WHERE local_port = ? AND remote_user = ?';
        this.db.run(sql, [localPort, user], (err) => {
            callback(err)
        });
    }
};
module.exports = Database;