const express = require("express");
const morgan = require("morgan");

const app = express();
const host = "localhost";
const port = 3000;

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));

app.get("/", (req, res) => {
  res.render("lists");
});

app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}!`);
})