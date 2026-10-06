# VotoAudit

Plataforma independente e apartidária de **auditoria cidadã** das Eleições 2026 (1º turno em 04/10, 2º turno em 25/10). Toda a interface é em português do Brasil (pt-BR).

Este documento explica **o que precisa ser preenchido e configurado para rodar o projeto localmente**: secrets do arquivo `.env`, banco de dados, integrações externas, modelos de dados e os comandos do dia a dia.

> ⚠️ **Nunca** faça commit do arquivo `.env` nem de qualquer credencial real. O `.gitignore` já ignora `.env`. Use sempre valores próprios de desenvolvimento.

---

## 1. Pré-requisitos

| Ferramenta | Versão recomendada | Observação |
|------------|--------------------|------------|
| Node.js | `>= 20.9.0` | Definido em `engines` do `package.json`. |
| Yarn | 1.x (classic) | **Use apenas Yarn** como gerenciador de pacotes (não use npm/npx). |
| PostgreSQL | 14+ | Banco relacional usado pelo projeto. |

---

## 2. Passo a passo para rodar localmente

```bash
# 1. Instalar dependências
yarn install

# 2. Criar o arquivo .env (veja a seção 3) e preencher as variáveis
cp .env.example .env   # se existir um exemplo; caso contrário, crie manualmente

# 3. Gerar o Prisma Client
yarn prisma generate

# 4. Criar/atualizar o schema no banco de dados
yarn prisma db push

# 5. (Opcional) Popular dados de demonstração
yarn prisma db seed

# 6. Iniciar o servidor de desenvolvimento
yarn dev
```

Após `yarn dev`, o app fica disponível em `http://localhost:3000`.

---

## 3. Variáveis de ambiente (`.env`)

Crie um arquivo `.env` na pasta `nextjs_space/` com as chaves abaixo. Os valores mostrados são **placeholders** — substitua por valores reais seus. **Nenhum valor real deve ser versionado.**

### 3.1. Banco de dados (obrigatório)

| Variável | Obrigatória | Para que serve | Exemplo / onde obter |
|----------|-------------|----------------|----------------------|
| `DATABASE_URL` | ✅ Sim | String de conexão do PostgreSQL. | `postgresql://usuario:senha@localhost:5432/votoaudit?schema=public` |

### 3.2. Autenticação (obrigatório)

| Variável | Obrigatória | Para que serve | Exemplo / onde obter |
|----------|-------------|----------------|----------------------|
| `NEXTAUTH_SECRET` | ✅ Sim | Segredo para assinar sessões/JWT. | Gere com `openssl rand -base64 32` |
| `AUTH_SECRET` | ✅ Sim | Mesmo propósito (compatibilidade). Use o mesmo valor de `NEXTAUTH_SECRET`. | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ⚠️ Local | URL base da aplicação. **Em produção é configurada automaticamente** — só defina localmente. | `http://localhost:3000` |
| `SUPER_ADMIN_EMAILS` | ✅ Sim | Lista (separada por vírgula) de e-mails que recebem o papel SUPER_ADMIN automaticamente. | `admin@seudominio.com.br` |

### 3.3. Login com Google (opcional)

O botão de login com Google **só aparece quando as duas credenciais são reais**. Deixe como placeholder para desabilitar o SSO em desenvolvimento.

| Variável | Obrigatória | Para que serve | Onde obter |
|----------|-------------|----------------|------------|
| `GOOGLE_CLIENT_ID` | ❌ Opcional | Client ID do OAuth do Google. | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Credenciais OAuth 2.0 |
| `GOOGLE_CLIENT_SECRET` | ❌ Opcional | Client Secret do OAuth do Google. | Mesmo local acima |

> Em "Authorized redirect URIs" do Google, adicione `http://localhost:3000/api/auth/callback/google` para desenvolvimento.

### 3.4. API Abacus.AI — LLM, PDF, FFmpeg e notificações (obrigatório para esses recursos)

| Variável | Obrigatória | Para que serve | Onde obter |
|----------|-------------|----------------|------------|
| `ABACUSAI_API_KEY` | ✅ Para recursos de IA/PDF/FFmpeg/e-mail | Chave única usada por geração de texto/imagem, HTML→PDF, processamento FFmpeg e envio de e-mails de notificação. | Painel Abacus.AI → API Keys |
| `WEB_APP_ID` | ✅ Sim | Identificador do app na plataforma. | Painel Abacus.AI |
| `NOTIF_ID_CONVITE_PARA_O_VOTOAUDIT` | ✅ Para envio de convites | ID do tipo de notificação de convite de equipe. | Gerado ao registrar a notificação na plataforma |
| `NOTIF_ID_ALERTAS_DE_AUDITORIA` | ✅ Para alertas | ID do tipo de notificação de alertas de auditoria. | Gerado ao registrar a notificação na plataforma |

### 3.5. Armazenamento de arquivos (S3) — uploads (obrigatório para upload de evidências)

Os arquivos enviados (fotos de BU, zerésima, documentos de verificação) ficam em um bucket S3 privado, na pasta `uploads/`. Documentos de verificação de identidade são apagados automaticamente 30 dias após a decisão (LGPD).

| Variável | Obrigatória | Para que serve | Exemplo |
|----------|-------------|----------------|---------|
| `AWS_REGION` | ✅ Para uploads | Região do bucket. | `us-east-1` |
| `AWS_BUCKET_NAME` | ✅ Para uploads | Nome do bucket S3. | `meu-bucket-votoaudit` |
| `AWS_FOLDER_PREFIX` | ✅ Para uploads | Prefixo de pasta dentro do bucket. | `votoaudit/` |
| `AWS_PROFILE` | ⚠️ Conforme auth | Perfil de credenciais AWS (alternativa a chaves de acesso). | `default` |

> Em vez de `AWS_PROFILE`, você pode usar `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY` conforme sua configuração de credenciais da AWS. Garanta também que o bucket tenha a política de CORS apropriada para uploads via navegador.

### 3.6. Notificações push (Web Push / VAPID) (opcional)

| Variável | Obrigatória | Para que serve | Onde obter |
|----------|-------------|----------------|------------|
| `VAPID_PUBLIC_KEY` | ❌ Opcional | Chave pública VAPID para push no navegador. | Gere com `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | ❌ Opcional | Chave privada VAPID. | Mesmo comando acima |
| `VAPID_SUBJECT` | ❌ Opcional | Identificação do remetente (URL ou `mailto:`). | `mailto:contato@seudominio.com.br` |

### 3.7. Ingestão de dados geográficos do TSE (opcional — só para carga em massa)

| Variável | Obrigatória | Para que serve | Observação |
|----------|-------------|----------------|------------|
| `TSE_GEO_DIR` | ❌ Opcional | Pasta local com os CSVs de seções do TSE para ingestão em massa. | Usada por `scripts/ingest-geography.ts`. Esses CSVs são grandes (~1GB) e **não devem ser versionados**. |

---

## 4. Banco de dados

- **SGBD:** PostgreSQL (`provider = "postgresql"` em `prisma/schema.prisma`).
- **ORM:** Prisma. O schema é a fonte de verdade dos modelos e enums.
- **Criar/atualizar o schema:** `yarn prisma db push`.
- **Semear dados de demonstração:** `yarn prisma db seed` (executa `scripts/safe-seed.ts`).

### 4.1. Trigger de auditoria (append-only)

A tabela `AdminAuditLog` é **somente-inclusão** (append-only), encadeada por hash SHA-256. Há triggers no banco que bloqueiam `UPDATE`/`DELETE`/`TRUNCATE`.

Após rodar `yarn prisma db push` em um banco novo (por exemplo, na sua VPS), **reaplique o SQL**:

```bash
psql "$DATABASE_URL" -f prisma/sql/admin_audit_log_append_only.sql
```

### 4.2. Principais modelos e enums (classes/propriedades)

Os modelos ficam em `prisma/schema.prisma`. Visão geral:

| Área | Modelos |
|------|---------|
| Autenticação / usuários | `User`, `Account`, `Session`, `VerificationToken` |
| Equipe e papéis | `Collector` (enum `CollectorRole`), `Invite`, `AdminAuditLog` |
| Verificação de identidade | `VerificationRequest` (enums `VerificationKind`, `VerificationRequestStatus`, `VerificationLevel`, `CredentialStatus`) |
| Eleições e seções | `Election` (enum `ElectionStatus`), `ElectionSection` (enum `SectionStatus`) |
| Evidências e urnas | `Evidence`, `BallotBoxBulletin`, `Zeresima`, `AVPARTReport`, `OfficialArtifact` (enums de validação, `BUSource`, `ArtifactType`, etc.) |
| Auditoria / incidentes | `AuditEvent`, `Incident`, `CrossValidationResult` (enums de severidade, categoria, status, confiança) |
| Processamento | `JobQueue` (enums `JobType`, `JobStatus`) |
| Notificações | `PushSubscription`, `NotificationPreference`, `Notification` (enums `NotificationType`, `NotificationChannel`, `NotificationStatus`) |

> Convenção importante: **municípios são sempre armazenados em CAIXA ALTA** (forma oficial do TSE, ex.: `SÃO PAULO`). As ingestões (`lib/tse-ingestor.ts`, `lib/geography.ts`, `lib/tse-calendar.ts`) normalizam automaticamente para maiúsculas.

---

## 5. Scripts úteis (`scripts/`)

| Arquivo | O que faz | Como rodar |
|---------|-----------|------------|
| `safe-seed.ts` | Semeia dados de demonstração de forma idempotente (via `yarn prisma db seed`). | `yarn prisma db seed` |
| `seed.ts` | Rotina de seed base. | `yarn tsx --require dotenv/config scripts/seed.ts` |
| `ingest-geography.ts` | Ingestão em massa de seções do TSE a partir de CSVs. | `yarn tsx --require dotenv/config scripts/ingest-geography.ts --dir /caminho/dos/csvs` |
| `auth-smoke.mjs` | Teste rápido do fluxo de autenticação. | `node scripts/auth-smoke.mjs` |

> Scripts ad-hoc com Prisma precisam carregar o `.env`. Use:
> `set -a && . ./.env && set +a && yarn tsx --require dotenv/config scripts/<arquivo>.ts`

---

## 6. Comandos do dia a dia

```bash
yarn dev              # servidor de desenvolvimento (http://localhost:3000)
yarn build            # build de produção
yarn start            # roda o build de produção
yarn lint             # ESLint
yarn prisma generate  # regenera o Prisma Client
yarn prisma db push   # aplica o schema ao banco
yarn prisma db seed   # popula dados de demonstração
```

---

## 7. Contas de demonstração

As contas administrativas e de coletores são criadas pelo seed. Após `yarn prisma db seed`, consulte/edite `scripts/safe-seed.ts` para ver as credenciais de demonstração. Para o seu ambiente, defina o seu próprio e-mail em `SUPER_ADMIN_EMAILS` para receber o papel SUPER_ADMIN.

---

## 8. Checklist rápido

- [ ] `.env` criado e preenchido (ao menos `DATABASE_URL`, `NEXTAUTH_SECRET`, `AUTH_SECRET`, `SUPER_ADMIN_EMAILS`).
- [ ] `yarn install` executado.
- [ ] `yarn prisma generate` executado.
- [ ] `yarn prisma db push` executado (schema no banco).
- [ ] (VPS) `admin_audit_log_append_only.sql` reaplicado.
- [ ] (Opcional) `yarn prisma db seed` para dados de demonstração.
- [ ] `yarn dev` rodando em `http://localhost:3000`.
