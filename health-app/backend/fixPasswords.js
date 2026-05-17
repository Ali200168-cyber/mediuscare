require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User"); // adjust path if needed

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { dbName: "Medius" })
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

async function fixPasswords() {
  try {
    const users = await User.find({});
    console.log(`Found ${users.length} users`);

    for (let user of users) {
      // Check if password is already hashed (bcrypt hash starts with $2)
      if (!user.password.startsWith("$2")) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(user.password, salt);
        user.password = hashedPassword;
        await user.save();
        console.log(`Updated password for ${user.email}`);
      } else {
        console.log(`Password already hashed for ${user.email}`);
      }
    }

    console.log("All passwords fixed!");
    process.exit(0);
  } catch (err) {
    console.error("Error fixing passwords:", err);
    process.exit(1);
  }
}

fixPasswords();
