# Fase 1 — Segurança: Credenciais e RLS

**Data:** 2026-03-27
**Projeto:** EcoBúzios - Financeiro Projetos
**Escopo:** Mover credenciais do Supabase para variáveis de ambiente e documentar/verificar RLS policies

---

## Contexto

A auditoria do projeto identificou dois problemas de segurança prioritários:

1. As credenciais do Supabase (`SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`) estão hardcoded em `src/integrations/supabase/client.ts` e commitadas no repositório git.
2. Não há arquivos de migration no repositório — as RLS policies (se existirem) vivem apenas no dashboard do Supabase, sem rastreabilidade no código.

**Nota:** A chave commitada é a `anon key`, que é intencionalmente pública no modelo de segurança do Supabase. A segurança real vem das RLS policies. Mesmo assim, mover para `.env` é boa prática e prepara o projeto para múltiplos ambientes.

---

## Seção 1 — Credenciais em variáveis de ambiente

### Mudanças

**1. Criar `.env` na raiz do projeto**
```
VITE_SUPABASE_URL=https://pttidjztgnqcyrsreygn.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**2. Criar `.env.example` (versionado no git)**
```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

**3. Adicionar `.env` ao `.gitignore`**
```
.env
.env.local
```

**4. Atualizar `src/integrations/supabase/client.ts`**

Substituir as constantes hardcoded por:
```ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

Adicionar validação em tempo de execução:
```ts
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias.");
}
```

**5. Atualizar `src/vite-env.d.ts`** para tipar as variáveis:
```ts
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### Observação sobre regeneração

O arquivo `client.ts` tem um comentário "automatically generated, do not edit". Se o Dyad regenerar o arquivo, as mudanças precisam ser reaplicadas manualmente. A solução de longo prazo é configurar o Dyad para usar variáveis de ambiente, mas isso está fora do escopo desta fase.

---

## Seção 2 — RLS policies

### Processo

1. **Inspecionar estado atual** via Supabase MCP: listar todas as tabelas e suas policies existentes
2. **Criar `supabase/migrations/`** com um arquivo de migration documentando o estado atual
3. **Verificar RLS habilitado** em todas as tabelas principais:
   - `projects`
   - `budgets`
   - `budget_lines` (ou equivalente)
   - `transactions`
   - `transaction_attachments`
4. **Para tabelas sem RLS**, criar policy de isolamento por usuário:
   ```sql
   ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "usuarios_acessam_proprios_dados" ON <tabela>
     FOR ALL USING (auth.uid() = user_id);
   ```

### O que não está no escopo

- Redesenhar o modelo de acesso (ex: acesso compartilhado por organização)
- Policies complexas de permissão por role
- Auditar o schema completo

---

## Critérios de aceite

- [ ] `.env` existe localmente com as credenciais reais
- [ ] `.env` está no `.gitignore` e não aparece em `git status`
- [ ] `.env.example` está commitado com valores placeholder
- [ ] `client.ts` lê de `import.meta.env` e lança erro se as vars estiverem ausentes
- [ ] `vite-env.d.ts` tipifica as variáveis de ambiente
- [ ] App continua funcionando após as mudanças
- [ ] RLS está habilitado em todas as tabelas principais
- [ ] Existe pelo menos um arquivo em `supabase/migrations/` documentando as policies

---

## Ordem de execução

1. Variáveis de ambiente (sem risco de quebrar)
2. Verificar RLS via MCP
3. Criar migrations documentando/corrigindo policies
