const express = require("express");
var db = require("./database.js");
const app = express();

const server = app.listen(3000, () => {
  console.log("Server started on port 3000");
});

const io = require("socket.io")(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

let connectedClients = {};

io.on("connection", (socket) => {
  socket.on("restaurant", (data) => {
    connectedClients[socket.id] = data;
    setInterval(() => {
      const fullDate = new Date();
      const today =
        fullDate.getFullYear() +
        "-" +
        (fullDate.getMonth() + 1 >= 10
          ? fullDate.getMonth() + 1
          : "0" + (fullDate.getMonth() + 1)) +
        "-" +
        (fullDate.getDate() >= 10
        ? fullDate.getDate()
        : "0" + (fullDate.getDate()));
      db.query(
        'SELECT a.id, a.deadline, b.quantity, c.name, b.id as "order_item_id" FROM orders a\
        INNER JOIN order_items b ON b.order_id = a.id\
        INNER JOIN menu_item c ON c.id = b.menu_item_id\
        WHERE a.closed = 0 AND a.isCancelled = 0 AND a.restaurant_id = ' +
          connectedClients[socket.id] +
          " AND DATE(a.deadline) <= '" +
          today +
          "%' ORDER BY a.deadline",
        function (err, rows) {
          if (err) {
            io.emit("error", err);
          } else {
            // Put the orders into an easier to work with array
            var orders = new Object();
            rows.forEach((val) => {
              var temp = new Object();
              temp[val.order_item_id] = {
                id: val.order_item_id,
                name: val.name,
                quantity: val.quantity,
                deadline: val.deadline,
              };
              orders[val.id] = orders[val.id] || {};
              orders[val.id] = Object.assign(orders[val.id], temp);
            });
            // Put side items in the array
            db.query(
              "select c.id, a.side_id, b.ingredient, a.quantity, c.order_id from order_items_sides a\
                inner join menu_item_ingredients b on a.side_id = b.id\
                inner join order_items c on c.id = a.order_item_id\
                inner join orders e on e.id = c.order_id WHERE e.closed = 0 AND e.isCancelled = 0 AND e.restaurant_id = " +
                connectedClients[socket.id] +
                " AND DATE(e.deadline) <= '" +
                today +
                "%'",
              function (err2, rows2) {
                if(err2) {
                  console.log(err2);
                  io.emit("err", err2);
                }

                if (!rows2) {
                  io.emit("orders", orders);
                } else {
                  rows2.forEach((s) => {
                    var aux = new Object();
                    aux[s.side_id] = {
                      id: s.id,
                      name: s.ingredient,
                      quantity: s.quantity,
                    };
                    orders[s.order_id][s.id] = Object.assign(
                      orders[s.order_id][s.id],
                      aux
                    );
                  });
                  io.emit("orders", orders);
                }
              }
            );
          }
        }
      );
    }, 1000);
  });
  // remove the mapping when the client disconnects
  socket.on("disconnect", () => {
    delete connectedClients[socket.id];
  });
});
