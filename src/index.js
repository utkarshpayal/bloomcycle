import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";
import { commonQuestions, dailyTasks, educationArticles } from "./content.js";
import { connectMongo } from "./mongo.js";
import User from "./models/User.js";

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "https://deft-jelly-68facf.netlify.app" || "http://localhost:5173" || "https://bloomcycle-bdy9-git-main-utkarshs-projects-74516499.vercel.app" || "https://*.netlify.app" || "https://*.vercel.app";

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.options("*", cors());

app.use(express.json({ limit: "400kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

const authRateBucket = new Map();

function rankFromTrees(treeCount) {
  if (treeCount >= 100) return "Rainforest Guardian";
  if (treeCount >= 60) return "Forest Keeper";
  if (treeCount >= 30) return "Tree Builder";
  if (treeCount >= 12) return "Sapling Nurturer";
  return "Seedling";
}

function applyAuthRateLimit(email, res) {
  const key = (email || "unknown").toLowerCase();
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const maxAttempts = 12;
  const entry = authRateBucket.get(key) || { count: 0, resetAt: now + windowMs };

  if (now > entry.resetAt) {
    authRateBucket.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  entry.count += 1;
  authRateBucket.set(key, entry);

  if (entry.count > maxAttempts) {
    res.status(429).json({ message: "Too many attempts. Please try again later." });
    return true;
  }

  return false;
}

function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function cleanText(value, max = 100) {
  return String(value || "").trim().slice(0, max);
}

function normalizeEmail(email) {
  return cleanText(email, 120).toLowerCase();
}

function isValidDate(value) {
  return dayjs(value, "YYYY-MM-DD", true).isValid();
}

function mapToObject(mapValue) {
  if (!mapValue) return {};
  if (mapValue instanceof Map) return Object.fromEntries(mapValue.entries());
  if (typeof mapValue.toObject === "function") return mapValue.toObject();
  return mapValue;
}

function getCycleSummary(cycleLogs) {
  const starts = cycleLogs
    .filter((x) => x.isPeriodStart)
    .map((x) => dayjs(x.date))
    .sort((a, b) => a.valueOf() - b.valueOf());

  if (starts.length < 2) {
    return {
      averageCycleLength: null,
      nextExpectedPeriod: null
    };
  }

  const deltas = [];
  for (let i = 1; i < starts.length; i += 1) {
    deltas.push(starts[i].diff(starts[i - 1], "day"));
  }

  const averageCycleLength = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
  const nextExpectedPeriod = starts[starts.length - 1].add(averageCycleLength, "day").format("YYYY-MM-DD");

  return { averageCycleLength, nextExpectedPeriod };
}

function computeStreak(completedTasksByDate) {
  const byDate = mapToObject(completedTasksByDate);
  let streak = 0;
  let cursor = dayjs().startOf("day");

  while (true) {
    const key = cursor.format("YYYY-MM-DD");
    const tasks = byDate[key] || [];
    if (!tasks.length) break;
    streak += 1;
    cursor = cursor.subtract(1, "day");
  }

  return streak;
}

function getPublicUser(userDoc) {
  const completedTasksByDate = mapToObject(userDoc.completedTasksByDate);
  const taskDays = Object.keys(completedTasksByDate);
  const totalCompletedTasks = taskDays.reduce((acc, date) => acc + (completedTasksByDate[date]?.length || 0), 0);

  return {
    id: userDoc.id,
    name: userDoc.name,
    email: userDoc.email,
    trees: userDoc.trees,
    rank: rankFromTrees(userDoc.trees),
    completedTasksByDate,
    totalCompletedTasks,
    currentStreakDays: computeStreak(completedTasksByDate)
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "BloomCycle API" });
});

app.post("/api/auth/signup", async (req, res) => {
  const name = cleanText(req.body.name, 70);
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!name || !email || !password) {
    return res.status(400).json({ message: "name, email, and password are required" });
  }

  if (!email.includes("@") || email.length < 6) {
    return res.status(400).json({ message: "Please provide a valid email address" });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }

  if (applyAuthRateLimit(email, res)) return undefined;

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({ message: "Email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = await User.create({
    id: uuidv4(),
    name,
    email,
    passwordHash,
    cycleLogs: [],
    completedTasksByDate: {},
    trees: 0,
    createdAt: new Date().toISOString()
  });

  const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: "7d" });
  return res.status(201).json({ token, user: getPublicUser(newUser) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!email || !password) {
    return res.status(400).json({ message: "email and password are required" });
  }

  if (applyAuthRateLimit(email, res)) return undefined;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  return res.json({ token, user: getPublicUser(user) });
});

app.get("/api/content/education", (_req, res) => {
  res.json({ articles: educationArticles });
});

app.get("/api/content/questions", (_req, res) => {
  res.json({ questions: commonQuestions });
});

app.get("/api/leaderboard", async (_req, res) => {
  const users = await User.find({}).sort({ trees: -1 }).limit(10);
  const leaderboard = users.map((user) => ({
    name: user.name,
    trees: user.trees,
    rank: rankFromTrees(user.trees)
  }));

  res.json({ leaderboard });
});

app.get("/api/tasks/daily", auth, async (req, res) => {
  const today = dayjs().format("YYYY-MM-DD");
  const user = await User.findOne({ id: req.userId });

  if (!user) return res.status(404).json({ message: "User not found" });

  const completed = user.completedTasksByDate.get(today) || [];
  return res.json({
    date: today,
    tasks: dailyTasks.map((task) => ({ ...task, completed: completed.includes(task.id) }))
  });
});

app.post("/api/tasks/complete", auth, async (req, res) => {
  const taskId = cleanText(req.body.taskId, 50);
  const maybeDate = cleanText(req.body.date, 20);
  const normalizedDate = isValidDate(maybeDate) ? maybeDate : dayjs().format("YYYY-MM-DD");

  if (!taskId) {
    return res.status(400).json({ message: "taskId is required" });
  }

  const taskExists = dailyTasks.some((task) => task.id === taskId);
  if (!taskExists) {
    return res.status(404).json({ message: "Task not found" });
  }

  const user = await User.findOne({ id: req.userId });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const todayTasks = user.completedTasksByDate.get(normalizedDate) || [];
  if (!todayTasks.includes(taskId)) {
    user.completedTasksByDate.set(normalizedDate, [...todayTasks, taskId]);
    user.trees += 1;
    await user.save();
  }

  return res.json(getPublicUser(user));
});

app.post("/api/cycle/log", auth, async (req, res) => {
  const maybeDate = cleanText(req.body.date, 20);
  const normalizedDate = isValidDate(maybeDate) ? maybeDate : dayjs().format("YYYY-MM-DD");
  const flow = cleanText(req.body.flow, 20) || "unknown";
  const mood = cleanText(req.body.mood, 30) || "neutral";
  const isPeriodStart = Boolean(req.body.isPeriodStart);
  const symptoms = Array.isArray(req.body.symptoms)
    ? req.body.symptoms.map((value) => cleanText(value, 20)).filter(Boolean).slice(0, 8)
    : [];

  const user = await User.findOne({ id: req.userId });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const existingIdx = user.cycleLogs.findIndex((l) => l.date === normalizedDate);
  const entry = { date: normalizedDate, flow, symptoms, mood, isPeriodStart };

  if (existingIdx === -1) {
    user.cycleLogs.push(entry);
  } else {
    user.cycleLogs[existingIdx] = entry;
  }

  await user.save();

  const summary = getCycleSummary(user.cycleLogs);
  return res.status(201).json({ logs: user.cycleLogs, summary });
});

app.get("/api/cycle/logs", auth, async (req, res) => {
  const user = await User.findOne({ id: req.userId });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const summary = getCycleSummary(user.cycleLogs);
  return res.json({ logs: user.cycleLogs, summary });
});

app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findOne({ id: req.userId });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const summary = getCycleSummary(user.cycleLogs);
  return res.json({
    profile: {
      ...getPublicUser(user),
      cycleSummary: summary
    }
  });
});

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
});

connectMongo()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to connect MongoDB", error);
    process.exit(1);
  });
