const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const nodemailer = require('nodemailer');
const twilio = require('twilio');  // Importing Twilio

dotenv.config();
console.log("Twilio Account SID:", process.env.TWILIO_ACCOUNT_SID);
console.log("Twilio Auth Token:", process.env.TWILIO_AUTH_TOKEN);
console.log("Twilio Phone Number:", process.env.TWILIO_PHONE_NUMBER);
 
const app = express();
const PORT = 9000;

// Twilio Client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Middleware - Ensure 'public/images' folder exists and serves static files
const imagesPath = path.join(__dirname, 'public/images');
if (!fs.existsSync(imagesPath)) {
  fs.mkdirSync(imagesPath, { recursive: true });
}
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/medikart', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Schema and Model
const recordSchema = new mongoose.Schema({
  sno: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  mrp: { type: Number, required: true },
  category: { type: String, required: true },
  mfg: { type: String, required: true },
  exp: { type: String, required: true },
  description: { type: String, default: "No description available." },
  imageUrl: { type: String, default: "/images/default-medicine.jpg" } // Ensure full path
});

const Record = mongoose.model('Record', recordSchema);

 // Auto-increment S.No and add new record
app.post('/api/records', async (req, res) => {
  console.log("Incoming new record:", req.body);  // 👈 Add this here!

  try {
    const lastRecord = await Record.findOne().sort({ sno: -1 });
    const nextSno = lastRecord ? lastRecord.sno + 1 : 1;

    req.body.sno = nextSno;

    // Fix imageUrl to absolute path if needed
    if (req.body.imageUrl && !req.body.imageUrl.startsWith('http')) {
      req.body.imageUrl = `http://localhost:${PORT}${req.body.imageUrl.startsWith('/') ? '' : '/'}${req.body.imageUrl}`;
    }

    delete req.body.image_url; // Clean up if needed

    const newRecord = new Record(req.body);
    await newRecord.save();

    console.log("✅ Record saved:", newRecord);  // Optional extra log
    res.status(201).json(newRecord);
  } catch (err) {
    console.error("❌ Error while saving:", err);
    res.status(500).json({ message: err.message });
  }
});

// Fetch all records
app.get('/api/records', async (req, res) => {
  try {
    const records = await Record.find().sort({ sno: 1 });
    res.status(200).json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Fetch a single record by ID
app.get('/api/records/:id', async (req, res) => {
  try {
    const record = await Record.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Medicine not found" });

    res.status(200).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete a record
app.delete('/api/records/:id', async (req, res) => {
  try {
    const deletedRecord = await Record.findByIdAndDelete(req.params.id);
    if (!deletedRecord) return res.status(404).json({ message: "Medicine not found" });

    res.status(200).json({ message: "Medicine deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Enquiry Form Handler
app.post('/se', async (req, res) => {
    const { name, phone, query } = req.body;
    if (!name || !phone || !query) {
        return res.status(400).json({ error: "All fields are required." });
    }
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: "shiifaa.mulla@gmail.com",
            subject: "New Enquiry Received",
            text: `Name: ${name}\nPhone: ${phone}\nQuery: ${query}`
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: "Enquiry received! We'll get back to you soon." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to send enquiry. Try again later." });
    }
});

// Debugging route to check available images
app.get('/debug/images', (req, res) => {
  const imagePath = path.join(__dirname, 'public/images');

  fs.readdir(imagePath, (err, files) => {
    if (err) {
      return res.status(500).json({ message: "Error reading image directory", error: err });
    }
    res.status(200).json({ images: files });
  });
});

app.post('/place-order', async (req, res) => {
  const { phoneNumber } = req.body;  // Make sure this matches your request body

  console.log("Phone number received:", phoneNumber);  // Log the phone number correctly

  console.log("Twilio Account SID:", process.env.TWILIO_ACCOUNT_SID);
  console.log("Twilio Auth Token:", process.env.TWILIO_AUTH_TOKEN);
  console.log("Twilio Phone Number:", process.env.TWILIO_PHONE_NUMBER);

  try {
    // Format the phone number to include the +91 prefix if not already present
    const formattedPhoneNumber = phoneNumber.startsWith('+91') ? phoneNumber : `+91${phoneNumber}`;

    const message = await client.messages.create({
      body: 'Order successfully placed! Thank you for shopping with Medikart. Your order is being processed.',
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhoneNumber,  // Use the formatted phone number here
    });

    console.log('Message SID:', message.sid);  // Log the message SID if successful
    res.status(200).json({ message: 'Order placed successfully! SMS sent.' });
  } catch (error) {
    console.error('Error sending SMS:', error.message);          // Brief error message
    console.error('Full Error Object:', error);                   // Complete error object for detailed info
    res.status(500).json({ message: `Order placed but failed to send SMS. Error: ${error.message}` });
  }
});


// Start Server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
