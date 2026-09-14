# Finance App API

Backend ASP.NET Core para transações, orçamentos, anexos do WhatsApp e integrações Open Banking.

## Configuração do Supabase

1. Crie um projeto Supabase e obtenha a ligação PostgreSQL direta (ou pooler compatível com migrations).
2. Defina-a fora do código fonte:

```powershell
$env:ConnectionStrings__Supabase = 'Host=...;Port=5432;Database=postgres;Username=postgres;Password=...;SSL Mode=Require;Trust Server Certificate=true'
```

3. Inicie a API:

```powershell
dotnet run --project .\FinanceApp.Api
```

A API cria o esquema de desenvolvimento e alguns dados de demonstração no primeiro arranque. Em produção, substitua `EnsureCreated` por migrations EF Core e configure autenticação JWT/Supabase Auth antes de expor qualquer endpoint.

## Endpoints do MVP

- `GET /api/health`
- `GET, POST /api/transactions`
- `GET, POST /api/categories`
- `GET, POST /api/planning` e `/api/budgets`
- `GET, POST, DELETE /api/bank-connections`
- `POST /api/webhooks/whatsapp/attachments`

Enquanto a autenticação não estiver ligada, o cabeçalho opcional `X-User-Id` seleciona o utilizador de desenvolvimento. Não é um mecanismo de autenticação e será removido ao integrar Supabase Auth/JWT.
