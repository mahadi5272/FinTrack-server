// ১. DNS সেটিংস (শুধুমাত্র লোকাল হোস্টে কাজ করবে)
if (process.env.NODE_ENV !== 'production') {
  const dns = require("node:dns");
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
// রেন্ডার অটোমেটিক পোর্ট সেট করবে, না থাকলে ৫০০৫ ব্যবহার হবে
const port = process.env.PORT || 5005; 

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = process.env.MONGO_URI;

// ইউআরএল চেক (সেফটি মেজার)
if (!uri) {
  console.error("Error: MONGO_URI is not defined in environment variables!");
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// --- JWT Middleware ---
const verifyToken = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    // ডাটাবেস এবং কালেকশন কানেকশন
    const DB = client.db("fintack");
    const usercoll = DB.collection("users");
    const transactionscoll = DB.collection("transactions");
    const categoriescoll = DB.collection("categories");
    const goalscoll = DB.collection("savingsgoals");
    const tipscoll = DB.collection("financialtips");

    // --- Admin Verification Middleware ---
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usercoll.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // --- Authentication (JWT Generation) ---
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // --- User Management ---
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usercoll.findOne(query);
      if (existingUser) return res.send({ message: "user already exists" });
      const result = await usercoll.insertOne(user);
      res.send(result);
    });

    app.get("/users-all", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await usercoll.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/users/:email", verifyToken, async (req, res) => {
      const user = await usercoll.findOne({ email: req.params.email });
      res.send(user);
    });

    app.patch("/users/role/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const filter = { _id: new ObjectId(id) };
      const result = await usercoll.updateOne(filter, { $set: { role: role } });
      res.send(result);
    });

    // --- Transaction Management ---
    app.post("/transactions", verifyToken, async (req, res) => {
      const transaction = req.body;
      if (transaction.userEmail !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await transactionscoll.insertOne(transaction);
      res.send(result);
    });

    app.get("/transactions/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await transactionscoll
        .find({ userEmail: email })
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    app.delete("/transactions/:id", verifyToken, async (req, res) => {
      const result = await transactionscoll.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // --- Financial Tips ---
    app.get("/financial-tips", async (req, res) => {
      const result = await tipscoll.find().toArray();
      res.send(result);
    });

    app.post("/financial-tips", verifyToken, verifyAdmin, async (req, res) => {
      const result = await tipscoll.insertOne(req.body);
      res.send(result);
    });

    // --- Category Management ---
    app.post("/categories", verifyToken, verifyAdmin, async (req, res) => {
      const result = await categoriescoll.insertOne(req.body);
      res.send(result);
    });

    app.get("/categories", async (req, res) => {
      const result = await categoriescoll.find().toArray();
      res.send(result);
    });

    // --- Financial Stats & Dashboard ---
    app.get("/user-stats/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const transactions = await transactionscoll
        .find({ userEmail: email })
        .toArray();
      let totalIncome = 0;
      let totalExpense = 0;
      transactions.forEach((t) => {
        const amount = parseFloat(t.amount || 0);
        t.type === "income"
          ? (totalIncome += amount)
          : (totalExpense += amount);
      });
      res.send({
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense,
      });
    });

    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const users = await usercoll.estimatedDocumentCount();
      const transactions = await transactionscoll.estimatedDocumentCount();
      res.send({ totalUsers: users, totalTransactions: transactions });
    });

    // --- Savings Goal ---
    app.post("/savings-goal", verifyToken, async (req, res) => {
      const goal = req.body;
      const query = { userEmail: goal.userEmail };
      const result = await goalscoll.updateOne(
        query,
        { $set: goal },
        { upsert: true },
      );
      res.send(result);
    });

    app.get("/savings-goal/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { userEmail: email };
      const result = await goalscoll.findOne(query);
      if (!result) return res.send({});
      res.send(result);
    });

    // MongoDB Ping
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");

  } catch (error) {
    console.error("Database connection error:", error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("FinTrack Server is Running!"));

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});