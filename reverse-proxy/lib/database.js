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

    getForwardRules(callback){
        const sql = 'SELECT * FROM forward_rules';
        this.db.all(sql, [], (err, rows) => {
            callback(err, rows);
        });
    }
};
module.exports = Database;