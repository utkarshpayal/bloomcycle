import mongoose from "mongoose";

const { Schema } = mongoose;

const cycleLogSchema = new Schema(
  {
    date: { type: String, required: true },
    flow: { type: String, default: "unknown" },
    symptoms: { type: [String], default: [] },
    mood: { type: String, default: "neutral" },
    isPeriodStart: { type: Boolean, default: false }
  },
  { _id: false }
);

const userSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  cycleLogs: { type: [cycleLogSchema], default: [] },
  completedTasksByDate: { type: Map, of: [String], default: {} },
  trees: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
