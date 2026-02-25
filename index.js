require("dotenv").config();
const dns = require("node:dns");
// Google DNS সার্ভার সেট করা হচ্ছে
dns.setServers(["8.8.8.8", "8.8.4.4"]);
const express = require("express");
const cors = require("cors");
const app = express();
const port = 3000;
// mongo
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.mongoUri;

// MiddeleWear
app.use(cors());
app.use(express.json());

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Hello World for mahadi!");
});

async function run() {
  try {
    const DB = client.db("fintack");
    const usercoll = DB.collection("users"); // Stores user information and roles (Admin/User)
    const transactionscoll = DB.collection("transactions"); // Stores both income and expense records
    const categoriescoll = DB.collection("categories"); // Stores financial categories managed by Admin
    const goalscoll = DB.collection("savingsgoals"); // Stores users' savings goals and progress
    const tipscoll = DB.collection("financialtips"); // Stores financial tips and insights managed by Admin
    app.get("/admin-stats", async (req, res) => {
      const users = await usercoll.estimatedDocumentCount();
      const transactions = await transactionscoll.estimatedDocumentCount();

      // সব ইউজারের মোট আয় এবং ব্যয় বের করা
      const allTransactions = await transactionscoll.find().toArray();
      const totalRevenue = allTransactions
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      res.send({
        totalUsers: users,
        totalTransactions: transactions,
        totalRevenue,
      });
    });
    // Admin Moderation: Delete any transaction
    app.delete("/admin/transactions/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await transactionscoll.deleteOne(query);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Moderation failed" });
      }
    });

    // Admin Moderation: Get all transactions for review
    app.get("/admin/all-transactions", async (req, res) => {
      const result = await transactionscoll.find().sort({ date: -1 }).toArray();
      res.send(result);
    });

    // // user
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const result = await usercoll.insertOne(user);
        res.send(result);
      } catch (err) {
        console.log(err);
        res.status(500).send({ massage: "intarnal server error" });
      }
    });
    app.get("/users", async (req, res) => {
      try {
        const cursor = usercoll.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });
    // ইউজারের রোল পরিবর্তন করার এপিআই (Admin/User toggle)
    app.patch("/users/role/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body; // ফ্রন্টএন্ড থেকে নতুন রোল পাঠানো হবে
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { role: role },
        };
        const result = await usercoll.updateOne(filter, updateDoc);
        res.send(result);
      } catch (err) {
        console.log(err);
        res.status(500).send({ message: "Role update failed" });
      }
    });
    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email: email };
        const user = await usercoll.findOne(query);
        res.send(user);
      } catch (err) {
        console.log(err);
      }
    });
    app.delete("/users/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await usercoll.deleteOne(query);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // // goal
    // // গোল সেভ করার এপিআই
    app.post("/savings-goal", async (req, res) => {
      const goal = req.body;
      const query = { userEmail: goal.userEmail };
      const updateDoc = { $set: goal };
      const result = await goalscoll.updateOne(query, updateDoc, {
        upsert: true,
      });
      res.send(result);
    });

    // // গোল রিড করার এপিআই
    app.get("/savings-goal/:email", async (req, res) => {
      const result = await goalscoll.findOne({
        userEmail: req.params.email,
      });
      res.send(result);
    });

    // // tips
    // // অ্যাডমিন টিপস সেভ করার এপিআই
    // app.post("/financial-tips", async (req, res) => {
    //   const tip = req.body;
    //   const result = await tipscoll.insertOne(tip); // আপনার ডিফাইন করা tipscoll
    //   res.send(result);
    // });

    // // সব টিপস গেট করার এপিআই
    // app.get("/financial-tips", async (req, res) => {
    //   const result = await tipscoll.find().toArray();
    //   res.send(result);
    // });

    // // categories
    // // --- Category Management (Admin - 7.2) ---

    // // নতুন ক্যাটাগরি সেভ করা
    // app.post("/categories", async (req, res) => {
    //   const category = req.body;
    //   const result = await categoriescoll.insertOne(category);
    //   res.send(result);
    // });

    // // সব ক্যাটাগরি গেট করা (ড্রপডাউনের জন্য)
    // app.get("/categories", async (req, res) => {
    //   const result = await categoriescoll.find().toArray();
    //   res.send(result);
    // });
    // // ২. ক্যাটাগরি ডিলিট করা (Delete)
    // app.delete("/categories/:id", async (req, res) => {
    //   try {
    //     const id = req.params.id;
    //     const query = { _id: new ObjectId(id) };
    //     const result = await categoriescoll.deleteOne(query);
    //     res.send(result);
    //   } catch (err) {
    //     res.status(500).send({ message: "Delete failed" });
    //   }
    // });
    // // ৩. ক্যাটাগরি এডিট/আপডেট করা (Update)
    // app.patch("/categories/:id", async (req, res) => {
    //   try {
    //     const id = req.params.id;
    //     const { name } = req.body;
    //     const filter = { _id: new ObjectId(id) };
    //     const updateDoc = {
    //       $set: { name: name },
    //     };
    //     const result = await categoriescoll.updateOne(filter, updateDoc);
    //     res.send(result);
    //   } catch (err) {
    //     res.status(500).send({ message: "Update failed" });
    //   }
    // });

    // // --- Transaction Management (User - 7.1) ---

    // // নতুন লেনদেন সেভ করা
    // app.post("/transactions", async (req, res) => {
    //   const transaction = req.body;
    //   const result = await transactionscoll.insertOne(transaction);
    //   res.send(result);
    // });

    // // নির্দিষ্ট ইউজারের সব লেনদেন দেখা (সেকশন ৭.৪ ফিল্টারিংয়ের ভিত্তি)
    // app.get("/transactions/:email", async (req, res) => {
    //   const email = req.params.email;
    //   const query = { userEmail: email };
    //   const result = await transactionscoll
    //     .find(query)
    //     .sort({ date: -1 })
    //     .toArray();
    //   res.send(result);
    // });
    // // ট্রানজ্যাকশন এডিট/আপডেট করার এপিআই
    // app.patch("/transactions/:id", async (req, res) => {
    //   try {
    //     const id = req.params.id;
    //     const updatedData = req.body;
    //     const filter = { _id: new ObjectId(id) };
    //     const updateDoc = {
    //       $set: {
    //         amount: parseFloat(updatedData.amount),
    //         type: updatedData.type,
    //         category: updatedData.category,
    //         date: updatedData.date,
    //         note: updatedData.note,
    //       },
    //     };
    //     const result = await transactionscoll.updateOne(filter, updateDoc);
    //     res.send(result);
    //   } catch (err) {
    //     res.status(500).send({ message: "Update failed" });
    //   }
    // });
    // // ইউজারের আর্থিক পরিসংখ্যান (Total Income, Expense, Balance)
    // app.get("/user-stats/:email", async (req, res) => {
    //   try {
    //     const email = req.params.email;
    //     const query = { userEmail: email };

    //     // ইউজারের সব ট্রানজ্যাকশন নিয়ে আসা
    //     const transactions = await transactionscoll.find(query).toArray();

    //     let totalIncome = 0;
    //     let totalExpense = 0;

    //     // লুপ চালিয়ে ইনকাম এবং এক্সপেন্স আলাদা করা
    //     transactions.forEach((t) => {
    //       if (t.type === "income") {
    //         totalIncome += parseFloat(t.amount);
    //       } else if (t.type === "expense") {
    //         totalExpense += parseFloat(t.amount);
    //       }
    //     });

    //     // ফ্রন্টএন্ডে পাঠানোর জন্য অবজেক্ট তৈরি
    //     res.send({
    //       totalIncome,
    //       totalExpense,
    //       balance: totalIncome - totalExpense,
    //       totalTransactions: transactions.length,
    //     });
    //   } catch (err) {
    //     console.log(err);
    //     res.status(500).send({ message: "Error calculating stats" });
    //   }
    // });
    // // ট্রানজ্যাকশন ডিলিট করার এপিআই
    // app.delete("/transactions/:id", async (req, res) => {
    //   try {
    //     const id = req.params.id;
    //     const query = { _id: new ObjectId(id) };

    //     // অবশ্যই 'transactionscoll' ব্যবহার করবেন
    //     const result = await transactionscoll.deleteOne(query);

    //     res.send(result);
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).send({ message: "Delete failed" });
    //   }
    // });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
