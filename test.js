const WebSocket = require("ws");
const port = 8100;
const host = "127.0.0.1";
// 定义两个变量， 一个用来计数，一个用来保存客户端
let clients = {};
let clientName = 0;

// 创建服务器
const server = new WebSocket.Server({ host: host, port: port });
console.log(`服务器运行在：ws://${host}:${port}`);

server.on("connection", client => {
  client.name = ++clientName; // 给每一个client起个名
  clients[client.name] = client; // 将client保存在clients
  client.isAlive = true; //监听链接是否存在
  client.on("pong", heartbeat);

  client.on("message", function(msg) {
    if (msg && JSON.parse(msg)) {
      const data = JSON.parse(msg);
      if (data && data.type == "heartbeat") {
        client.send("收到heartbeat");
      }
    }

    //接收client发来的信息
    console.log(`客户端${client.name}发来一个信息：${msg}`);
  });
  client.on("error", function(e) {
    //监听客户端异常
    console.log("client error" + e);
    client.end();
  });

  client.on("close", function() {
    delete clients[client.name];
    console.log(`客户端${client.name}下线了`);
  });
});

const interval = setInterval(function ping() {
  for (let key in clients) {
    const ws = clients[key];
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(noop);
  }
}, 3000);
function heartbeat(data) {
  this.isAlive = true;
}

function noop() {}
