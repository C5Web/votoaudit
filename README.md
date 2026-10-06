# VotoAudit

> Plataforma independente e apartidária de **auditoria cidadã** das Eleições 2026.
> Permite que qualquer pessoa — do eleitor comum ao fiscal credenciado — colete, envie e cruze evidências públicas das urnas (Boletim de Urna, zerésima, testes de integridade) para dar transparência ao processo eleitoral.

Todo o sistema é em **português do Brasil** e foi desenhado para ser neutro: trabalha com *evidências* e *divergências*, nunca com acusações.

---

## Sumário

- [Visão geral](#visão-geral)
- [Principais funcionalidades](#principais-funcionalidades)
- [Arquitetura](#arquitetura)
- [Tecnologias](#tecnologias)
- [Requisitos mínimos](#requisitos-mínimos)
- [Rodando localmente](#rodando-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados e seed](#banco-de-dados-e-seed)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Papéis e níveis de verificação](#papéis-e-níveis-de-verificação)
- [Como navegar no sistema](#como-navegar-no-sistema)
- [Regras de negócio](#regras-de-negócio-principais)
- [Segurança e LGPD](#segurança-e-lgpd)
- [Para quem vai testar](#para-quem-vai-testar)
- [Para quem vai desenvolver](#para-quem-vai-desenvolver)
- [Roadmap](#roadmap)
- [Licença](#licença)

---

## Visão geral

O VotoAudit organiza a fiscalização descentralizada das eleições em quatro pilares:

1. **Coleta** — voluntários enviam fotos e leituras de QR Code do Boletim de Urna (BU), zerésima e demais documentos públicos afixados nas seções.
2. **Validação cruzada** — o sistema compara as evidências enviadas por diferentes fontes entre si e com os dados oficiais do TSE, calculando um nível de confiança.
3. **Incidentes** — quando há divergência (ex.: zerésima com votos, BUs que não batem), o sistema gera automaticamente um incidente classificado por severidade.
4. **Transparência** — painéis públicos mostram a cobertura por UF/zona/seção, a linha do tempo de eventos e os incidentes, sempre **sem expor dados pessoais** dos coletores.

---

## Principais funcionalidades

- **Assistente de coleta em 5 passos** (`/coletar`) com leitor de QR Code ao vivo (câmera), suporte a QR multipartes do BU, colagem de conteúdo e digitação manual.
- **Cálculo de hash SHA-256 no cliente** para cada arquivo, garantindo integridade da evidência.
- **Validação cruzada automática** entre evidências cidadãs, de fiscais e oficiais, com níveis de confiança (baixo/médio/alto).
- **Geração automática de incidentes** por regras de negócio (divergências, zerésima inconsistente, QR inválido etc.).
- **Calendário de eventos do TSE** (`/eventos`) importado da Resolução TSE 23.760/2026, com reimportação periódica.
- **Painéis públicos**: dashboard com estatísticas, mapa/cobertura por UF e zona, lista de seções e de incidentes.
- **Verificação de identidade e credencial** com fluxo de aprovação humana e expurgo de documentos (LGPD).
- **Convites de uso único** para a equipe, válidos por 48 h.
- **Trilha de auditoria administrativa** *append-only*, encadeada por hash e protegida por *triggers* no banco.
- **PWA + layout mobile-first** com barra de navegação inferior, pronto para empacotamento como aplicativo nas lojas.

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                         Cliente (Web / PWA)                   │
│  React + Next.js App Router · Tailwind/shadcn · leitor QR      │
│  Hash SHA-256 no navegador · upload direto ao storage (S3)     │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTPS (REST /app/api/*)
┌───────────────▼──────────────────────────────────────────────┐
│                     Camada de aplicação (Next.js)             │
│  Rotas de API REST  ·  Auth.js (NextAuth)  ·  guards de papel  │
│  Lógica de negócio isolada em /lib (reutilizável fora do app)  │
└───────────────┬───────────────────────────┬──────────────────┘
                │                           │
      ┌─────────▼─────────┐        ┌────────▼─────────┐
      │  PostgreSQL        │        │  Object Storage   │
      │  (Prisma ORM)      │        │  (S3 compatível)  │
      │  evidências,       │        │  documentos       │
      │  incidentes, logs  │        │  originais (priv) │
      └────────────────────┘        └───────────────────┘
                ▲
      ┌─────────┴─────────┐
      │  Fila de jobs      │  validação de BU, cruzamento de seção,
      │  (JobQueue na DB)  │  ingestão TSE, processamento de QR, notificações
      └────────────────────┘
```

**Decisões de projeto importantes:**

- A **lógica de negócio fica em `/lib`** e as rotas em `/app/api` são REST "limpas". Isso facilita a futura migração do backend para um serviço próprio (ex.: FastAPI) na VPS, usando o `schema.prisma` como referência do modelo de dados.
- O arquivo original da evidência é armazenado **privado** no storage; apenas o `cloud_storage_path` e o hash ficam no banco.
- A trilha de auditoria é **imutável**: além do encadeamento por hash na aplicação, há *triggers* no PostgreSQL que bloqueiam `UPDATE`/`DELETE`/`TRUNCATE` (ver `nextjs_space/prisma/sql/admin_audit_log_append_only.sql`).

---

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | React 18, Next.js (App Router), TypeScript |
| Estilo/UI | Tailwind CSS, shadcn/ui (Radix UI), lucide-react, framer-motion |
| Estado/dados | TanStack React Query, SWR, Zustand/Jotai |
| Formulários/validação | React Hook Form, Zod, Yup |
| Gráficos/mapas | Recharts, Chart.js, Plotly, Leaflet / Mapbox GL |
| Autenticação | Auth.js (NextAuth) + Prisma Adapter, bcryptjs, JWT |
| ORM/Banco | Prisma ORM + PostgreSQL |
| Armazenamento | AWS S3 (SDK v3) / storage compatível |
| QR / imagens | jsqr + BarcodeDetector API |
| Utilidades | date-fns, dayjs, lodash, csv |

---

## Requisitos mínimos

- **Node.js 20 LTS** (ou 18.18+)
- **Yarn** (clássico ou via corepack)
- **PostgreSQL 14+** acessível (local ou gerenciado)
- Um **bucket S3** (ou serviço compatível) para upload dos documentos — opcional para navegar, obrigatório para enviar evidências com arquivo
- Recomendado: 2 vCPU / 2 GB RAM para desenvolvimento

---

## Rodando localmente

```bash
# 1. Clonar o repositório
git clone https://github.com/C5Web/votoaudit.git
cd votoaudit/nextjs_space

# 2. Instalar dependências
yarn install

# 3. Configurar variáveis de ambiente
cp .env.example .env
#   edite .env e preencha DATABASE_URL, NEXTAUTH_SECRET etc.

# 4. Gerar o cliente Prisma e criar o schema no banco
yarn prisma generate
yarn prisma db push

# 5. (Opcional) Popular dados de demonstração
yarn prisma db seed

# 6. Subir o servidor de desenvolvimento
yarn dev
# aplicação em http://localhost:3000
```

Após aplicar o schema, rode também o SQL que protege a trilha de auditoria:

```bash
psql "$DATABASE_URL" -f prisma/sql/admin_audit_log_append_only.sql
```

### Build de produção

```bash
yarn build
yarn start
```

---

## Variáveis de ambiente

Todas ficam em `nextjs_space/.env`. Veja `nextjs_space/.env.example` para o modelo. **Nunca** faça commit do `.env` real.

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | String de conexão PostgreSQL |
| `NEXTAUTH_SECRET` / `AUTH_SECRET` | sim | Segredo de assinatura das sessões |
| `AWS_REGION` / `AWS_BUCKET_NAME` / `AWS_FOLDER_PREFIX` | para uploads | Configuração do bucket de storage |
| `AWS_PROFILE` ou credenciais AWS | para uploads | Credenciais de acesso ao storage |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | opcional | Habilita login com Google (o botão só aparece com credenciais reais) |
| `SUPER_ADMIN_EMAILS` | recomendada | Lista de e-mails que recebem o papel de administrador geral |
| `ABACUSAI_API_KEY` | opcional | Chave para serviços de LLM/notificação, se usados |

> `NEXTAUTH_URL` é definido automaticamente no ambiente de deploy; não precisa ser fixado manualmente.

---

## Banco de dados e seed

- O schema completo está em `nextjs_space/prisma/schema.prisma`.
- `yarn prisma db seed` executa `scripts/safe-seed.ts`, que popula dados de **demonstração** (eleições, seções, coletores de exemplo, eventos do calendário).
- Os dados de demonstração usam candidatos **fictícios** (A–E, números 91–95); a carga de dados reais do TSE é tratada separadamente.
- O seed usa `upsert` e **não apaga** registros — é seguro rodar mais de uma vez.

---

## Estrutura de pastas

```
votoaudit/
├── README.md
└── nextjs_space/
    ├── app/                 # rotas (App Router) e APIs REST
    │   ├── api/             # endpoints REST por domínio
    │   ├── admin/           # painel administrativo
    │   ├── coletar/         # assistente de coleta + leitor de QR
    │   ├── secoes/ eventos/ incidentes/ dashboard/ ...
    ├── components/          # componentes de UI reutilizáveis
    ├── lib/                 # regras de negócio, queries, auth, utilidades
    ├── prisma/              # schema + SQL de triggers
    ├── scripts/             # seed e utilitários
    ├── public/              # imagens e ícones (locais, versionados)
    └── types/               # tipos compartilhados
```

---

## Papéis e níveis de verificação

**Papéis** (enum `CollectorRole`): Cidadão, Fiscal de partido, Representante de partido, Advogado (OAB), Ministério Público, Defensoria, Auditor, Representante de entidade, Observador de integridade, Imprensa, Moderador, Admin e Admin geral (*SUPER_ADMIN*).

**Hierarquia administrativa:** `SUPER_ADMIN > ADMIN > MODERATOR > demais`. Cada um só age sobre quem está abaixo. O `SUPER_ADMIN` nunca é atribuído pela interface — é restaurado a partir de `SUPER_ADMIN_EMAILS`.

**Níveis de verificação** (enum `VerificationLevel`):
`ANONYMOUS` → `EMAIL_VERIFIED` (ao confirmar o e-mail) → `IDENTITY_VERIFIED` / `CREDENTIAL_VERIFIED` (por aprovação humana).

Nas páginas públicas, só aparece o **tipo de fonte** (ex.: "fiscal de partido com credencial verificada"), nunca o nome ou e-mail.

---

## Como navegar no sistema

| Rota | O que é |
|---|---|
| `/` | Página inicial, visão geral da plataforma |
| `/dashboard` | Indicadores e gráficos de cobertura |
| `/secoes` e `/secoes/[id]` | Lista e detalhe das seções eleitorais |
| `/eventos` | Calendário de eventos auditáveis do TSE |
| `/incidentes` e `/incidentes/[id]` | Divergências detectadas |
| `/coletar` | Assistente de envio de evidências (5 passos) |
| `/login` e `/signup` | Autenticação |
| `/meu-perfil` | Perfil e solicitações de verificação |
| `/admin` | Painel administrativo (abas conforme o papel) |
| `/convite/[token]` | Aceite de convite de equipe |

No celular, a navegação principal fica na **barra inferior fixa** (Painel, Seções, Coletar, Eventos, Incidentes).

---

## Regras de negócio principais

- Zerésima com total de votos **> 0** gera incidente **CRÍTICO**.
- BUs cidadãos divergentes entre si geram incidente **ALTO**; BU cidadão diferente do oficial, com **≥ 2 fontes**, também gera **ALTO**.
- Evidência anônima **sozinha** não gera incidente.
- Confiança: **baixa** = 1 fonte; **média** = 2 fontes (ou 1 + oficial); **alta** = 3+ fontes concordantes com o oficial.
- Vocabulário sempre neutro: o sistema trata de *evidências* e *divergências*.

---

## Segurança e LGPD

- Documentos de verificação de identidade/credencial são **apagados 30 dias** após a decisão; ficam apenas o resultado, o motivo e quem decidiu.
- Ninguém analisa a própria solicitação de verificação.
- Contas são **suspensas** (com motivo obrigatório), nunca excluídas.
- Trilha de auditoria **imutável** (append-only encadeada por hash + triggers no banco).
- Dados pessoais de coletores nunca aparecem em páginas públicas.

---

## Para quem vai testar

1. Suba o projeto com os passos de [Rodando localmente](#rodando-localmente) e rode o seed de demonstração.
2. Crie uma conta em `/signup` (entra como **Cidadão**).
3. Explore `/dashboard`, `/secoes`, `/eventos` e `/incidentes` — são públicos.
4. Teste o envio de evidências em `/coletar` (precisa de storage configurado para anexar arquivos).
5. Para recursos administrativos, use um e-mail listado em `SUPER_ADMIN_EMAILS` e acesse `/admin`.

---

## Para quem vai desenvolver

- **Toda a lógica de negócio vive em `/lib`** — comece por aí para entender o domínio.
- As rotas em `/app/api` são finas: validam entrada, chamam `/lib` e devolvem JSON.
- Guards de autorização: `lib/authz.ts` (`requireStaff`), `lib/roles.ts` (hierarquia) e `lib/admin-guard.ts`.
- Para depurar o fluxo de auth, veja `auth.ts` e `app/login`.
- Ao mudar o schema, rode `yarn prisma generate` + `yarn prisma db push` e **reaplique** o SQL de triggers da auditoria.
- Lint: `yarn lint`.

---

## Roadmap

- Carga completa da geografia eleitoral real do TSE (UF/município/zona/seção).
- Ingestão de arquivos públicos de urna: BU oficial, RDV e Log de Urna.
- Notificações mobile de eventos do TSE + integração com o calendário do dispositivo.
- Fila de envio offline com reenvio automático e indicador de status (pendente/enviado).
- Publicação do app mobile nas lojas Google e Apple.

---

## Licença

Definir pelo mantenedor do repositório (sugestão: MIT ou AGPL-3.0, por ser um projeto de transparência pública).
