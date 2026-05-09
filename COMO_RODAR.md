# Como rodar o projeto

## Backend (FastAPI)

```bash
cd backend
venv/bin/uvicorn main:app --reload
```

Acessa: http://localhost:8000
Docs: http://localhost:8000/docs

**Login padrão (personal):** personal@app.com / 123456

## Frontend (React + Vite)

```bash
# Na raiz do projeto (personal-trainer-app/)
npm run dev
```

Acessa: http://localhost:5173

## Ambos juntos (em terminais separados)

Terminal 1:
```bash
cd backend && venv/bin/uvicorn main:app --reload
```

Terminal 2:
```bash
npm run dev
```
