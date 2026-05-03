const http = require('http');
const server = http.createServer((req, res) => { res.end('Hello'); });
server.listen(8080, '127.0.0.1', () => { console.log('Listening on 8080'); });
