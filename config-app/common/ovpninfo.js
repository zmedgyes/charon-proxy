const { exec } = require("child_process");

function listConnectedClients(callback){
    const list_ovpn_clients_command = 'cat /etc/openvpn/server/openvpn-status.log | grep "CLIENT_LIST"';

    exec(list_ovpn_clients_command, (error, stdout, stderr) => {
        if (error) {
            callback(error);
            return;
        }
        if (stderr) {
            callback(stderr);
            return;
        }
        const lines = stdout.split('\n');
        let clients = [];
        if (lines.length > 1) {
            const header = lines[0].split(',');
            for (let i in header) {
                header[i] = header[i].replace(/ /g, '');
            }
            for (let i = 1; i < lines.length; i++) {
                let clientInfo = lines[i].split(',');
                if (clientInfo.length === header.length - 1) {
                    let client = {};
                    for (let j = 1; j < clientInfo.length; j++) {
                        client[header[j + 1]] = clientInfo[j];
                    }
                    clients.push(client);
                }
            }
        }
        callback(null,clients);
    });
}

module.exports = {
    listConnectedClients
};
