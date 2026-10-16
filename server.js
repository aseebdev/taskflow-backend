require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStoreModule = require("connect-mongo");
// Support CommonJS and default-export package builds.
const MongoStore = MongoStoreModule.default || MongoStoreModule;
const bcrypt = require("bcryptjs");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.PORT) || 5001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5174";
// Configure one or more stable frontend origins in Vercel's backend environment.
// CLIENT_URL is the primary origin; CLIENT_URLS optionally accepts comma-separated extras.
const allowedOrigins = new Set([
  ...[CLIENT_URL, ...(process.env.CLIENT_URLS || "").split(",")]
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
  "https://todo-dmgo.vercel.app",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
]);

if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(cors({
  origin(origin, callback) {
    // Requests without Origin can be health checks or server-to-server calls.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));
app.use(express.json({ limit: "20kb" }));

if (!process.env.MONGO_URI) {
  throw new Error("Missing MONGO_URI environment variable");
}
if (!process.env.SESSION_SECRET) {
  throw new Error("Missing SESSION_SECRET environment variable");
}

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
}, { timestamps: true });

const taskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User", index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  completed: { type: Boolean, default: false },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Task = mongoose.models.Task || mongoose.model("Task", taskSchema);

// Reuse the Mongo connection across serverless invocations.
let connectionPromise;
async function ensureDatabase(req, res, next) {
  try {
    if (mongoose.connection.readyState !== 1) {
      if (!connectionPromise) {
        connectionPromise = mongoose.connect(process.env.MONGO_URI)
          .catch((err) => {
            connectionPromise = null;
            throw err;
          });
      }
      await connectionPromise;
    }
    next();
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    res.status(503).json({ message: "Database unavailable. Check backend environment variables and MongoDB Atlas access." });
  }
}
app.use(ensureDatabase);

app.use(session({
  name: "todo.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI, collectionName: "sessions" }),
  cookie: {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: "Please log in" });
  next();
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

app.post("/api/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (typeof name !== "string" || !name.trim() ||
        typeof email !== "string" || !email.trim() ||
        typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ message: "Enter your name and email, and use a password of at least 8 characters." });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ message: "Email already registered. Please log in." });
    }
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 12),
    });
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user._id.toString();
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.status(201).json({ name: user.name, email: user.email });
      });
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Email already registered. Please log in." });
    next(err);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user._id.toString();
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.json({ name: user.name, email: user.email });
      });
    });
  } catch (err) { next(err); }
});

app.get("/api/me", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId).select("name email");
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Please log in" });
    }
    res.json({ name: user.name, email: user.email });
  } catch (err) { next(err); }
});

app.post("/api/logout", auth, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("todo.sid", {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
    });
    res.json({ message: "Logged out" });
  });
});

app.get("/api/tasks", auth, async (req, res, next) => {
  try {
    res.json(await Task.find({ userId: req.session.userId }).sort({ createdAt: -1 }));
  } catch (err) { next(err); }
});

app.post("/api/tasks", auth, async (req, res, next) => {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title || title.length > 200) return res.status(400).json({ message: "Enter a task between 1 and 200 characters." });
    res.status(201).json(await Task.create({ userId: req.session.userId, title }));
  } catch (err) { next(err); }
});

app.patch("/api/tasks/:id", auth, async (req, res, next) => {
  try {
    if (typeof req.body?.completed !== "boolean") return res.status(400).json({ message: "Invalid completion status." });
    const task = await Task.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!task) return res.status(404).json({ message: "Task not found." });
    task.completed = req.body.completed;
    await task.save();
    res.json(task);
  } catch (err) {
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid task ID." });
    next(err);
  }
});

app.delete("/api/tasks/:id", auth, async (req, res, next) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });
    if (!task) return res.status(404).json({ message: "Task not found." });
    res.json({ message: "Task deleted." });
  } catch (err) {
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid task ID." });
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: "Server error. Check backend deployment logs." });
});

// Vercel's Express runtime uses the exported app; local development starts a listener.
if (require.main === module) {
  app.listen(PORT, () => console.log(`TaskFlow API listening on port ${PORT}`));
}
module.exports = app;
