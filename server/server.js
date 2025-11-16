require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// In-memory store (demo only)
const users = {}; // email -> { name, hash, salt, verified, code }

// Configure transporter: use SMTP env vars if present, otherwise fallback to console
async function createTransporter(){
  if(process.env.SMTP_HOST && process.env.SMTP_USER){
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  // fallback: ethereal account
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({ host: testAccount.smtp.host, port: testAccount.smtp.port, secure: testAccount.smtp.secure, auth: { user: testAccount.user, pass: testAccount.pass } });
}

// Helper to send code
async function sendVerification(email, code){
  const transporter = await createTransporter();
  const info = await transporter.sendMail({
    from: process.env.FROM_EMAIL || 'no-reply@example.com',
    to: email,
    subject: 'Seu código de verificação - PET-Saúde Equidade (demo)',
    text: `Seu código de verificação: ${code}`,
    html: `<p>Seu código de verificação: <b>${code}</b></p>`
  });
  // if using ethereal, log preview URL
  if(nodemailer.getTestMessageUrl(info)){
    console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
  }
  return info;
}

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if(!name || !email || !password) return res.status(400).json({ error: 'missing' });
  const key = email.toLowerCase();
  if(users[key]) return res.status(400).json({ error: 'exists' });
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password + salt, 10);
  const code = Math.floor(100000 + Math.random()*899999).toString();
  users[key] = { name, hash, salt, verified:false, code };
  try{ await sendVerification(email, code); }catch(e){ console.error(e); }
  return res.json({ ok: true, msg: 'created', demoCode: code });
});

app.post('/verify', (req, res) => {
  const { email, code } = req.body;
  if(!email || !code) return res.status(400).json({ error:'missing' });
  const u = users[email.toLowerCase()];
  if(!u) return res.status(404).json({ error:'user-not-found' });
  if(u.code === code){ u.verified = true; u.code = null; return res.json({ ok: true }); }
  return res.status(400).json({ error:'invalid-code' });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if(!email || !password) return res.status(400).json({ error:'missing' });
  const u = users[email.toLowerCase()];
  if(!u) return res.status(404).json({ error:'user-not-found' });
  if(!u.verified) return res.status(403).json({ error:'not-verified' });
  const ok = bcrypt.compareSync(password + u.salt, u.hash);
  if(!ok) return res.status(401).json({ error:'invalid-creds' });
  return res.json({ ok:true, user: { name: u.name, email } });
});

const port = process.env.PORT || 3001;
app.listen(port, ()=> console.log('Auth demo server running on port', port));
