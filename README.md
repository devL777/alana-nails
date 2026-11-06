# Alana Nails

Site mobile-first para apresentar os serviços e receber solicitações de agendamento. Feito com Next.js 16, React 19, TypeScript e Supabase.

## Rodar localmente no Windows

1. Abra o CMD nesta pasta (a que contém `package.json`).
2. Instale as dependências e inicie o servidor:

```bat
npm install
npm run dev
```

3. Duplique `.env.example` como `.env.local` e preencha a URL do projeto Supabase e sua chave publicável.
4. Abra `http://localhost:3000`. O painel fica em `http://localhost:3000/admin`.

## Como funciona o agendamento

- A cliente não cria conta nem senha. Em cada solicitação, informa nome, e-mail e telefone.
- O agendamento é salvo no Supabase. A reserva em conflito é recusada pelo banco, mesmo se duas clientes escolherem o mesmo horário ao mesmo tempo.
- A página consulta somente horários ocupados; nome, e-mail, telefone e observações não são públicos.
- A Alana acessa o painel com uma conta do Supabase Auth. Só usuários autorizados em `public.studio_admins` podem ver clientes e administrar a agenda.
- Serviços e valores iniciais estão em `supabase/migrations/20261106000000_booking_core.sql`. As durações e horas de atendimento começam sem configuração real; a Alana deve defini-las no painel antes de abrir os horários.

## Primeiro acesso administrativo

Crie a conta da Alana em **Supabase → Authentication → Users**. Ela deve definir e guardar a própria senha. Depois, autorize o UUID dessa conta no SQL Editor:

```sql
insert into public.studio_admins (user_id)
values ('UUID-DA-CONTA-DA-ALANA');
```

Não compartilhe a senha no chat. O projeto usa RLS nas tabelas; nunca coloque uma chave `service_role` ou chave secreta em `NEXT_PUBLIC_*`.

## Itens ainda não conectados

- Aviso automático por e-mail ou WhatsApp após o pedido;
- Pagamento ou sinal via Pix e confirmação por webhook;
- Fluxo de cancelamento para as clientes e política de privacidade/termos.
