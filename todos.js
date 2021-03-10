const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const TodoList = require("./lib/todolist");
const Todo = require("./lib/todo");
const { sortTodoLists, sortTodos } = require("./lib/sort");
const store = require("connect-loki");

const app = express();
const host = "localhost";
const port = 3000;
const LokiStore = store(session);

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false })); //tells express abou the format used by the form data. it is URL-encoded for this app
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000,
    path: "/",
    secure: false,
  },
  name: "launch-school-todos-session-id",
  resave: false,
  saveUninitialized: true,
  secret: "this is not very secure",
  store: new LokiStore({}),
}));

app.use(flash());
app.use((req, res, next) => {
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

app.use((req, res, next) => {
  let todoLists = [];
  if ("todoLists" in req.session) {
    req.session.todoLists.forEach(todoList => {
      todoLists.push(TodoList.makeTodoList(todoList));
    });
  }

  req.session.todoLists = todoLists;
  next();
});

app.get("/", (req, res) => {
  res.redirect("lists");
});

app.get("/lists/new", (req, res) => {
  res.render("new-list");
});

app.get("/lists", (req, res) => {
  res.render("lists", {
    todoLists: sortTodoLists(req.session.todoLists),
  });
});

app.post("/lists",
  [
    body("todoListTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The list title is required.")
      .isLength({ max: 100 })
      .withMessage("List title must be between 1 and 100 characters.")
      .custom((title, { req }) => {
        let todoLists = req.session.todoLists;
        let duplicate = todoLists.find(list => list.title === title);
        return duplicate === undefined;
      })
      .withMessage("List title must be unique."),
  ], 
  (req, res) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("new-list", {
        flash: req.flash(), 
        todoListTitle: req.body.todoListTitle,
      });
    } else {
      req.session.todoLists.push(new TodoList(req.body.todoListTitle));
      req.flash("success", "The todo list has been created");
      res.redirect("/lists");
    }
  }
);

app.post("/lists/:todoListId/todos/:todoId/toggle", (req, res, next) => {
  let listId = req.params.todoListId;
  let list = req.session.todoLists.filter(list => list.id === Number(listId))[0];
  let todoId = Number(req.params.todoId);
  let todo = list.findById(todoId);

  if (!todo || Object.entries(todo).length === 0) {
    next(new Error("Not found."));
  } else {
    if (todo.isDone()) {
      todo.markUndone();
      req.flash("Success", "Item Marked as incomplete.");
    } else {
      todo.markDone();
      req.flash("Success", "Item marked as complete");
    }
  } 
  
  res.redirect(`/lists/${listId}`);
});

app.post("/lists/:todoListId/todos/:todoId/destroy", (req, res, next) => {
  let listId = req.params.todoListId;
  let list = req.session.todoLists.filter(list => list.id === Number(listId))[0];
  let todoId = Number(req.params.todoId);
  let todo = list.findById(todoId);

  if (!todo) {
    next(new Error("Not found."));
  } else {
    let index = list.findIndexOf(todo);
    list.removeAt(index);
  }

  req.flash("Success", "Item removed from list.");
  res.redirect(`/lists/${listId}`);
});

app.post("/lists/:todoListId/complete_all", (req, res, next) => {
  let listId = req.params.todoListId;
  let list = req.session.todoLists.filter(list => list.id === Number(listId))[0];

  if (!list) {
    next(new Error("Not found."));
  } else {
    list.markAllDone();
    req.flash("Success", "All items marked as complete.");
    res.redirect(`/lists/${listId}`);
  }
});

app.post("/lists/:todoListId/todos", 
[
  body("todoTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("The todo title is required.")
    .isLength({ max: 100 })
    .withMessage("List todo title must be between 1 and 100 characters."),
],
(req, res, next) => {
  let errors = validationResult(req);
  let listId = req.params.todoListId;
  let list = req.session.todoLists.filter(list => list.id === Number(listId))[0];

  if (!list) {
    next(new Error("Not found."));
  } else {
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      
      res.render("list", {
        todoList: list,
        todos: sortTodos(list),
        flash: req.flash(),
      });
    } else {
      list.add(new Todo(req.body.todoTitle));
      req.flash("success", "New item added to the list.");
      res.redirect(`/lists/${listId}`);
    }
  }
});

app.get("/lists/:todoListId/edit", (req, res, next) => {
  let listId = req.params.todoListId;
  let list = req.session.todoLists.filter(list => list.id === Number(listId))[0];

  if (list === undefined) {
    next(new Error("Not found"));
  } else {
    res.render("edit-list", {
      todoList: list,
    });
  }
});

app.get("/lists/:todoListId", (req, res, next) => {
  let listId = req.params.todoListId;
  let list = req.session.todoLists.filter(list => list.id === Number(listId))[0];

  if (list === undefined) {
    next(new Error("Not found."));
  } else {
    res.render("list", {
      todoList: list,
      todos: sortTodos(list),
    });
  }
});

app.post("/lists/:todoListId/destroy", (req, res, next) => {
  let listId = req.params.todoListId;
  let list = req.session.todoLists.filter(list => list.id === Number(listId))[0];

  if (list === undefined) {
    next(new Error("Not found"));
  } else {
    let listIndex = req.session.todoLists.indexOf(list);
    req.session.todoLists.splice(listIndex, 1);
    req.flash("Success", "List deleted");
    res.redirect('/lists');
  }
});

app.post("/lists/:todoListId/edit", 
  [
    body("todoListTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The list title is required.")
      .isLength({ max: 100 })
      .withMessage("List title must be between 1 and 100 characters.")
      .custom((title, { req }) => {
        let todoLists = req.session.todoLists;
        let duplicate = todoLists.find(list => list.title === title);
        return duplicate === undefined;
      })
      .withMessage("List title must be unique."),
  ],
  (req, res, next) => {
    let errors = validationResult(req);
    let listId = req.params.todoListId;
    let list = req.session.todoLists.filter(list => list.id === Number(listId))[0];

    if (!list) {
      next(new Error("Not found"));
    } else {
      if (!errors.isEmpty()) {
        errors.array().forEach(message => req.flash("error", message.msg));
      
        res.render("edit-list", {
          todoList: list,
          todoListTitle: req.body.todoListTitle,
          flash: req.flash(),
        });
      } else {
        list.setTitle(req.body.todoListTitle);
        req.flash("success", "The lists name was changed.");
        res.redirect(`/lists/${listId}`);
      }
    }
  }
);

app.use((err, req, res, _next) => {
  console.log(err);
  res.status(404).send(err.message);
});

app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}!`);
})