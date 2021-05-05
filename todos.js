const express = require("express"); //includes express library to manage requests
const morgan = require("morgan"); //includes the morgan library that logs messeges to the console when request are made
const flash = require("express-flash"); // includes the flash library that allows flash messages to be added through middleware
const session = require("express-session"); // includes the expression session library that allows a sesssionst to be created
const { body, validationResult } = require("express-validator"); // includes the validator objects
const TodoList = require("./lib/todolist");
const store = require("connect-loki");
const SessionPersistence = require("./lib/session-persistence");

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
app.use((req, res, next) => { // any requests that have flash messages in them will be transfered over. The they're deleted so they don't repeat
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

app.use((req, res, next) => {
  res.locals.store = new SessionPersistence(req.session);
  next();
});

app.get("/", (req, res) => {
  res.redirect("lists");
});

app.get("/lists/new", (req, res) => {
  res.render("new-list");
});

app.get("/lists", (req, res) => {
  let store = res.locals.store;
  let todoLists = store.sortedTodoLists();

  let todosInfo = todoLists.map(todoList => ({
    countAllTodos: todoList.todos.length,
    countDoneTodos: todoList.todos.filter(todo => todo.done).length,
    isDone: store.isDoneTodoList(todoList),
  }));

  res.render("lists", {
    todoLists,
    todosInfo,
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
  let { todoListId, todoId } = req.params;
  let toggled = res.locals.store.toggleDoneTodo(+todoListId, +todoId);
  if (!toggled) {
    next(new Error("Not found."));
  } else {
    let todo = res.locals.store.loadTodo(+todoListId, +todoId);
    if (todo.done) {
      req.flash("success", `"${todo.title}" marked done.`);
    } else {
      req.flash("success", `"${todo.title}" marked as NOT done!`);
    }

    res.redirect(`/lists/${todoListId}`);
  }
});

app.post("/lists/:todoListId/todos/:todoId/destroy", (req, res, next) => {
  let { todoListId, todoId } = req.params;
  let deleted = res.locals.store.deleteTodo(+todoListId, +todoId);
  if (!deleted) {
    next(new Error("Not found."));
  } else {
    req.flash("success", "The todo has been deleted.");
    res.redirect(`/lists/${listId}`);
  }
});

app.post("/lists/:todoListId/complete_all", (req, res, next) => {
  let { todoListId } = req.params;
  let completed = res.locals.store.completeAllTodos(+todoListId);

  if (!completed) {
    next(new Error("Not found."));
  } else {
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
  let { todoListId } = req.params;
  let todoList = res.locals.store.loadTodoList(+todoListId);
  let todoListTitle = req.body.todoTitle;

  if (!todoList) {
    next(new Error("Not found."));
  } else {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      
      res.render("list", {
        todoList,
        isDoneTodoList: res.locals.store.isDoneTodoList(todoList),
        hasUndoneTodos: res.locals.store.hasUndoneTodos(todoList),
        todoTitle,
        flash: req.flash(),
      });
    } else {
      let created = res.locals.store.createTodo(+todoListId, todoTitle);
      if (!created) {
        next(new Error("Not found"));
      } else {
        req.flash("success", "New item added to the list.");
        res.redirect(`/lists/${todoListId}`);
      }
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
  let todoList = res.locals.store.loadTodoList(+listId);

  if (todoList === undefined) {
    next(new Error("Not found."));
  } else {
    todoList.todos = res.locals.store.sortedTodos(todoList);

    res.render("list", {
      todoList,
      isDoneTodoList: res.locals.store.isDoneTodoList(todoList),
      hasUndoneTodos: res.locals.store.hasUndoneTodos(todoList),
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