require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// In-memory store (demo only - use database in production)
const users = {}; // email -> { name, hash, salt, verified, code }

// Logger simples
const log = {
    info: (msg, data = '') => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, data),
    error: (msg, error = '') => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, error),
    warn: (msg, data = '') => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, data)
};

// Validação de email
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Validação de senha (mínimo 6 caracteres)
function isValidPassword(password) {
    return password && password.length >= 6;
}

// Configure transporter: use SMTP env vars if present, otherwise fallback to ethereal
async function createTransporter(){
    if(process.env.SMTP_HOST && process.env.SMTP_USER){
        log.info('Usando SMTP configurado');
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === 'true',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
    }
    // fallback: ethereal account para testes
    log.info('Usando Ethereal (teste)');
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({ 
        host: testAccount.smtp.host, 
        port: testAccount.smtp.port, 
        secure: testAccount.smtp.secure, 
        auth: { user: testAccount.user, pass: testAccount.pass } 
    });
}

// Helper to send verification code
async function sendVerification(email, code){
    try {
        const transporter = await createTransporter();
        const fromEmail = process.env.FROM_EMAIL || 'noreply@pet-saude.br';
        const info = await transporter.sendMail({
            from: fromEmail,
            to: email,
            subject: 'Seu código de verificação - PET-Saúde Equidade',
            text: `Seu código de verificação: ${code}\n\nEste código expira em 24 horas.`,
            html: `<p>Seu código de verificação: <b>${code}</b></p><p><em>Este código expira em 24 horas.</em></p>`
        });
        
        // Se usando ethereal, log o link de preview
        if(nodemailer.getTestMessageUrl(info)){
            log.info('Preview URL (Ethereal):', nodemailer.getTestMessageUrl(info));
        }
        log.info(`Email de verificação enviado para ${email}`);
        return info;
    } catch(error) {
        log.error('Erro ao enviar email', error.message);
        throw error;
    }
}

// POST /register - Registrar novo usuário
app.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // Validação
        if(!name || !name.trim()) {
            return res.status(400).json({ error: 'name_required', message: 'Nome é obrigatório' });
        }
        if(!email || !isValidEmail(email)) {
            return res.status(400).json({ error: 'invalid_email', message: 'Email inválido' });
        }
        if(!isValidPassword(password)) {
            return res.status(400).json({ error: 'weak_password', message: 'Senha deve ter no mínimo 6 caracteres' });
        }
        
        const key = email.toLowerCase();
        if(users[key]) {
            log.warn(`Tentativa de registro com email existente: ${email}`);
            return res.status(400).json({ error: 'email_exists', message: 'Este email já está registrado' });
        }
        
        // Gerar salt e hash
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password + salt, 10);
        const code = Math.floor(100000 + Math.random()*899999).toString();
        
        // Armazenar usuário
        users[key] = { name, hash, salt, verified: false, code, createdAt: new Date() };
        
        // Enviar email (com fallback para demo)
        try {
            await sendVerification(email, code);
        } catch(e) {
            log.error('Falha ao enviar email, continuando com demo', e.message);
        }
        
        log.info(`Novo usuário registrado: ${email}`);
        return res.json({ 
            ok: true, 
            message: 'Usuário registrado. Verifique seu email para o código.',
            demoCode: code // Apenas para demo - REMOVER em produção
        });
    } catch(error) {
        log.error('Erro em /register', error.message);
        return res.status(500).json({ error: 'server_error', message: 'Erro ao registrar' });
    }
});

// POST /verify - Verificar código
app.post('/verify', (req, res) => {
    try {
        const { email, code } = req.body;
        
        if(!email || !code) {
            return res.status(400).json({ error: 'missing_fields', message: 'Email e código são obrigatórios' });
        }
        
        const key = email.toLowerCase();
        const user = users[key];
        
        if(!user) {
            return res.status(404).json({ error: 'user_not_found', message: 'Usuário não encontrado' });
        }
        
        if(user.code === code) {
            user.verified = true;
            user.code = null;
            log.info(`Usuário verificado: ${email}`);
            return res.json({ ok: true, message: 'Email verificado com sucesso' });
        }
        
        log.warn(`Tentativa de verificação com código inválido: ${email}`);
        return res.status(400).json({ error: 'invalid_code', message: 'Código inválido' });
    } catch(error) {
        log.error('Erro em /verify', error.message);
        return res.status(500).json({ error: 'server_error', message: 'Erro ao verificar' });
    }
});

// POST /login - Login
app.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        if(!email || !password) {
            return res.status(400).json({ error: 'missing_fields', message: 'Email e senha são obrigatórios' });
        }
        
        const key = email.toLowerCase();
        const user = users[key];
        
        if(!user) {
            log.warn(`Tentativa de login com email inexistente: ${email}`);
            return res.status(404).json({ error: 'user_not_found', message: 'Credenciais inválidas' });
        }
        
        if(!user.verified) {
            log.warn(`Tentativa de login com usuário não verificado: ${email}`);
            return res.status(403).json({ error: 'not_verified', message: 'Email ainda não foi verificado' });
        }
        
        const isValidPassword = bcrypt.compareSync(password + user.salt, user.hash);
        if(!isValidPassword) {
            log.warn(`Tentativa de login com senha inválida: ${email}`);
            return res.status(401).json({ error: 'invalid_password', message: 'Credenciais inválidas' });
        }
        
        log.info(`Login bem-sucedido: ${email}`);
        return res.json({ 
            ok: true, 
            user: { name: user.name, email },
            message: 'Login realizado com sucesso'
        });
    } catch(error) {
        log.error('Erro em /login', error.message);
        return res.status(500).json({ error: 'server_error', message: 'Erro ao realizar login' });
    }
});

// GET /health - Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Middleware para rotas não encontradas
app.use((req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Rota não encontrada' });
});

// Middleware de tratamento de erro global
app.use((error, req, res, next) => {
    log.error('Erro não tratado', error.message);
    res.status(500).json({ error: 'server_error', message: 'Erro interno do servidor' });
});

const port = process.env.PORT || 3001;
app.listen(port, ()=> {
    log.info(`Servidor de autenticação iniciado na porta ${port}`);
    log.info('Modo: ' + (process.env.NODE_ENV === 'production' ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'));
});
