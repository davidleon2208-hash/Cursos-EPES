Auth demo server (PET-Saúde Equidade)
====================================

Este é um exemplo de servidor Node.js que implementa endpoints de registro, verificação e login.

Dependências
- Node.js (>=14)

Instalação

1. Abra um terminal na pasta `server`:

```powershell
cd "c:\Users\david.leoncio\Documents\Arquivos\novo exemplo\server"
npm install
```

2. Configurar variáveis de ambiente (opcional): crie um `.env` com:

```
PORT=3001
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=seu_usuario
SMTP_PASS=sua_senha
FROM_EMAIL=no-reply@example.com
```

Sem configuração SMTP, o servidor usará uma conta Ethereal (apenas para desenvolvimento) e exibirá a URL de visualização do email no console.

Executar

```powershell
npm start
```

Endpoints (JSON)
- POST /register { name, email, password } => { ok, demoCode }
- POST /verify { email, code } => { ok }
- POST /login { email, password } => { ok, user }

Aviso
- Uso apenas para demonstração. Não usar em produção sem alterações sérias de segurança e persistência.
