# Roity MBCR Control

App pessoal para gerir a assessoria Roity e a jornada MBCR (Marketing, Branding, Conversão, Retenção) de 12 meses de cada clínica.

## O que já funciona

- **Mapa mental** de verdade: centro MBCR, 4 pilares, 12 meses em trilha, relações pilar → mês, e ao tocar num mês ele abre em *Nova implantação / Rotinas contínuas / Saídas*. Tem zoom, arrastar, pinça no celular, busca, minimapa, legenda e teclado.
- Alternar entre **Mapa mental, Linha do tempo, Kanban e Lista**.
- **Clínicas**: pipeline (lead → encerrado), ficha completa, contrato, exclusividade com aviso de conflito (mesmo segmento e cidade), meta e garantia (sempre com decisão manual).
- **Começar jornada MBCR**: gera as tarefas novas de cada mês, as rotinas mensais (2 reuniões, calendário, Meta Ads, 24AGÁ, métricas, relatório) e 6 slots de criativos por mês, com prazos calculados pela data de início. É uma cópia do modelo, então mudanças futuras no modelo não alteram jornadas já iniciadas.
- **Tarefas**: Hoje, Esta semana, Atrasadas, por clínica e por responsável, checklist, evidência, ata de reunião, histórico de quem mudou o quê, ações em lote.
- **Calendário**, **Criativos** (contador de 6/mês com limite de revisões), registro de **campanhas**.
- **Apresentar ao cliente**: modo de venda em tela cheia com os 4 pilares, o mapa, cada mês ("o que fazemos" / "o que você recebe"), as entregas mensais e como funciona a parceria. Pode ser personalizado com o nome da clínica.
- **Relatório mensal** imprimível / salvar em PDF, com aprovação do Tiago.
- **Financeiro**: MRR, meta de 20 clínicas, implantações. A verba de mídia não entra na receita.
- **Backup** em .json, restauração, exportação CSV, tema claro/escuro, funciona offline.

## Onde ficam os dados

No próprio aparelho (armazenamento do navegador / do app instalado). **Não há servidor nem login.** Por isso:
- celular e computador têm dados separados. Use *Configurações → Baixar backup* e *Restaurar backup* para passar de um para o outro;
- faça backup de vez em quando;
- "Quem está usando" (Tiago/Micaela) serve só para o histórico, não é senha.

Para sincronizar entre aparelhos e ter login de verdade, o próximo passo é ligar um banco (ex.: Supabase). Veja Fase 2.

## Instalar no celular

1. Abra o link do app no **Safari** (iPhone) ou **Chrome** (Android).
2. iPhone: botão Compartilhar → **Adicionar à Tela de Início**. Android: menu ⋮ → **Instalar app**.
3. Abra sempre pelo ícone. Ele abre em tela cheia e funciona sem internet.

## Rodar no computador

```bash
python3 -m http.server 8000
```
Depois abra http://localhost:8000

## Publicar uma atualização

Altere os arquivos, mude `VERSION` em `sw.js` (por exemplo `mbcr-v1.0.1`) e faça commit e push. O GitHub Pages atualiza em cerca de 1 minuto.

## Ainda não está pronto (sem fingir)

- O app não acompanha métricas do cliente nem a 24AGÁ (isso é monitorado fora dele). A 24AGÁ aparece só como entrega do plano.
- **Login multiusuário e permissões por clínica**: precisam de backend (Fase 2).
- **Garantia, exclusividade e indicações (30%)**: o app só registra. Toda decisão é humana/jurídica.

### Fase 2 (sugestão)
Supabase (Postgres + Auth + RLS) para login de Tiago e Micaela e sincronização; contas a receber; relatórios semestral e anual; capacidade com horas reais.

### Fase 3
Webhook 24AGÁ (quando houver documentação), importação Meta Ads, Google Agenda, portal restrito da clínica.
