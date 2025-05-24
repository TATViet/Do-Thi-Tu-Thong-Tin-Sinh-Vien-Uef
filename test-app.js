const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = 3001; // Sử dụng port khác để tránh xung đột

// Kết nối MongoDB
mongoose.connect('mongodb://0.0.0.0:27017/dbconect', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Tạo routes đơn giản
app.get('/', (req, res) => {
  res.render('index', {
    title: 'Test App',
    namHocKyList: [],
    showSearchSection: true
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
});