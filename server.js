require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { initializeDatabase } = require('./config/initDb');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Heroku's reverse proxy so secure cookies work over HTTPS
app.set('trust proxy', 1);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'unit6017secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8  // 8 hours
  }
}));

// Make session available in all views
app.use((req, res, next) => {
  res.locals.isAdminLoggedIn = req.session.isAdmin === true;
  next();
});

// Routes
const indexRouter = require('./routes/index');
const adminRouter = require('./routes/admin');
const apiRouter = require('./routes/api');

app.use('/', indexRouter);
app.use('/admin', adminRouter);
app.use('/api', apiRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'דף לא נמצא',
    message: 'הדף שחיפשת לא קיים.',
    code: 404
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'שגיאת שרת',
    message: 'אירעה שגיאה פנימית. אנא נסה שוב.',
    code: 500
  });
});

// Start server after DB init
async function startServer() {
  try {
    console.log('🔌 Connecting to database...');
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📋 Unit 6017 Scheduler ready at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();
