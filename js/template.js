// Modelo MBCR — jornada de 12 meses. Copiado para cada clínica ao iniciar a jornada
// (alterações futuras no modelo NÃO mudam jornadas já iniciadas).
'use strict';

const PILLARS = {
  M: { key: 'M', name: 'Marketing', color: 'var(--p-m)' },
  B: { key: 'B', name: 'Branding', color: 'var(--p-b)' },
  C: { key: 'C', name: 'Conversão', color: 'var(--p-c)' },
  R: { key: 'R', name: 'Retenção', color: 'var(--p-r)' },
};

// t = título, p = pilar, o = responsável padrão, d = dia do mês da jornada para o prazo, c = checklist
const MONTHS = [
  { n: 1, title: 'Fundação, captação e implantação', short: 'Fundação', pillars: ['M', 'B'],
    desc: 'Diagnóstico, acessos, posicionamento, campanhas iniciais e implantação da 24AGÁ.',
    outputs: ['Checklist de acessos', 'Baseline', 'Campanhas iniciais', 'Automação inicial', 'Primeiro relatório', 'Plano do mês 2'],
    items: [
      { t: 'Checklist de acessos (Instagram, Meta Business, contas de anúncio)', p: 'M', o: 'Micaela', d: 1, c: ['Instagram', 'Meta Business Manager', 'Conta de anúncios', 'Pixel / mensuração', 'WhatsApp da clínica'] },
      { t: 'Diagnóstico da clínica', p: 'M', o: 'Tiago', d: 2, c: ['Faturamento base', 'Serviços e tickets', 'Margens estimadas', 'Capacidade de atendimento', 'Histórico de marketing', 'Metas individuais'] },
      { t: 'Definir responsável humano pelos fechamentos', p: 'C', o: 'Tiago', d: 2 },
      { t: 'Procedimentos prioritários: análise de rentabilidade e decisão', p: 'M', o: 'Tiago', d: 4, c: ['Lista da clínica', 'Análise Roity', 'Recomendação registrada', 'Decisão da clínica registrada'] },
      { t: 'Orientações de gravação para a clínica', p: 'B', o: 'Micaela', d: 5 },
      { t: 'Planejamento de ofertas e calendário inicial', p: 'B', o: 'Tiago', d: 6 },
      { t: 'Organização do Instagram e posicionamento inicial', p: 'B', o: 'Micaela', d: 8 },
      { t: 'Mensuração e campanhas iniciais Meta Ads', p: 'M', o: 'Tiago', d: 10, c: ['Mensuração configurada', 'Teste de público', 'Teste de oferta', 'Teste de criativo'] },
      { t: 'Implantação inicial 24AGÁ', p: 'C', o: 'Tiago', d: 12, c: ['Procedimentos cadastrados', 'Fluxo de pré-atendimento', 'Encaminhamento para humano'] },
      { t: 'Primeiro relatório e plano do mês 2', p: 'M', o: 'Tiago', d: 28 },
    ] },
  { n: 2, title: 'Treinamento de vendas e organização de leads', short: 'Vendas e leads', pillars: ['C', 'R'],
    desc: 'Recepção treinada, todos os leads registrados com status e follow-up mensal iniciado.',
    outputs: ['Playbook comercial', 'Modelos de proposta e mensagens', 'CRM operacional', 'Relatório de aderência'],
    items: [
      { t: 'Treinamento comercial da recepção', p: 'C', o: 'Tiago', d: 10, c: ['Abordagem', 'Qualificação', 'Objeções', 'Proposta comercial', 'Envio de materiais', 'Fechamento'] },
      { t: 'Playbook comercial e modelos de proposta', p: 'C', o: 'Micaela', d: 12 },
      { t: 'CRM operacional: todo lead com status, responsável e resultado', p: 'C', o: 'Micaela', d: 15 },
      { t: 'Alinhar CRM e 24AGÁ', p: 'C', o: 'Tiago', d: 16 },
      { t: 'Iniciar campanhas mensais de follow-up e retenção (com consentimento)', p: 'R', o: 'Tiago', d: 18 },
      { t: 'Ajustar scripts, ofertas e criativos pelas métricas', p: 'M', o: 'Tiago', d: 22 },
    ] },
  { n: 3, title: 'Disciplina de atendimento e conversão', short: 'Atendimento', pillars: ['C'],
    desc: 'Tempo de resposta humano, confirmação ativa e auditoria de conversas.',
    outputs: ['Protocolo de atendimento', 'Dashboard de conversão', 'Relatório'],
    items: [
      { t: 'Treinar tempo de resposta humano (referência: até 10 min)', p: 'C', o: 'Tiago', d: 8 },
      { t: 'Protocolo de confirmação ativa por humano', p: 'C', o: 'Micaela', d: 10 },
      { t: 'Recuperação de contatos sem resposta', p: 'C', o: 'Micaela', d: 14 },
      { t: 'Auditoria amostral de conversas e gargalos', p: 'C', o: 'Tiago', d: 18 },
      { t: 'Dashboard de conversão e plano de correção', p: 'C', o: 'Tiago', d: 24 },
    ] },
  { n: 4, title: 'Otimização de campanhas e oferta', short: 'Otimização', pillars: ['M'],
    desc: 'Revisar e documentar público, criativos, oferta e orçamento. Diagnosticar antes de trocar.',
    outputs: ['Matriz de testes', 'Histórico de decisões', 'Plano de otimização'],
    items: [
      { t: 'Revisão documentada dos quatro eixos', p: 'M', o: 'Tiago', d: 10, c: ['Público-alvo', 'Criativos', 'Oferta', 'Orçamento'] },
      { t: 'Diagnóstico de causa antes de reorientar a oferta', p: 'M', o: 'Tiago', d: 12 },
      { t: 'Matriz de testes e histórico de decisões', p: 'M', o: 'Micaela', d: 16 },
      { t: 'Plano de otimização', p: 'M', o: 'Tiago', d: 22 },
    ] },
  { n: 5, title: 'Organização do funil e recuperação', short: 'Funil', pillars: ['C', 'R'],
    desc: 'Classificar o funil e criar segmentos e automações de recuperação sem excesso de mensagens.',
    outputs: ['Funil completo', 'Listas e segmentos', 'Campanhas ativas', 'Relatório de recuperação'],
    items: [
      { t: 'Classificar leads por situação', p: 'C', o: 'Micaela', d: 10, c: ['Fechou', 'Não fechou', 'Não respondeu', 'Não compareceu', 'Retornou', 'Em negociação'] },
      { t: 'Segmentos e automações 24AGÁ com cadência e limites', p: 'R', o: 'Tiago', d: 15 },
      { t: 'Campanhas personalizadas e ofertas de recuperação', p: 'R', o: 'Tiago', d: 20 },
      { t: 'Relatório de recuperação', p: 'R', o: 'Micaela', d: 27 },
    ] },
  { n: 6, title: 'Auditoria de resultados e primeiro ciclo', short: 'Auditoria', pillars: ['M', 'C'],
    desc: 'Auditoria do semestre, meta individual e relatório executivo. Garantia só com revisão humana/jurídica.',
    outputs: ['Relatório executivo semestral', 'Plano dos meses 7–12'],
    items: [
      { t: 'Auditoria de faturamento, leads e origem dos novos pacientes', p: 'M', o: 'Tiago', d: 10, c: ['Faturamento', 'Quantidade e qualidade dos leads', 'Origem técnica', 'Pergunta “como conheceu a clínica”'] },
      { t: 'Conferir investimento, pagantes, taxa de fechamento e adesão', p: 'C', o: 'Micaela', d: 14 },
      { t: 'Avaliar meta individual conforme contrato (revisão humana/jurídica)', p: 'M', o: 'Tiago', d: 20 },
      { t: 'Relatório executivo semestral e plano dos meses 7–12', p: 'M', o: 'Tiago', d: 27 },
    ] },
  { n: 7, title: 'Reativação e ofertas de retorno', short: 'Reativação', pillars: ['R'],
    desc: 'Reativar a base antiga com ofertas relevantes, consentimento e opt-out.',
    outputs: ['Segmentação', 'Campanha', 'Métricas de reativação', 'Relatório'],
    items: [
      { t: 'Segmentação da base antiga', p: 'R', o: 'Micaela', d: 8 },
      { t: 'Ofertas de retorno e manutenção (respeitando indicação clínica)', p: 'R', o: 'Tiago', d: 12 },
      { t: 'Mensagens aprovadas na 24AGÁ com consentimento e opt-out', p: 'R', o: 'Tiago', d: 15 },
      { t: 'Métricas de reativação', p: 'R', o: 'Micaela', d: 26 },
    ] },
  { n: 8, title: 'Programa de indicações', short: 'Indicações', pillars: ['B', 'R'],
    desc: 'Desenhar programa de indicação. Incentivo (ex.: 30%) só após revisão ética e legal.',
    outputs: ['Política aprovada', 'Materiais', 'Treinamento', 'Resultados'],
    items: [
      { t: 'Desenhar proposta de indicação (NÃO ativar incentivo sem revisão)', p: 'B', o: 'Tiago', d: 8 },
      { t: 'Verificar regras do conselho, legislação e viabilidade', p: 'R', o: 'Tiago', d: 12 },
      { t: 'Alternativa de indicação sem incentivo financeiro', p: 'B', o: 'Micaela', d: 14 },
      { t: 'Materiais, treinamento e controle manual pela clínica', p: 'R', o: 'Micaela', d: 20 },
    ] },
  { n: 9, title: 'Previsibilidade e taxa de fechamento', short: 'Previsibilidade', pillars: ['C'],
    desc: 'Taxa de fechamento como indicador principal, com definição documentada.',
    outputs: ['Painel de previsibilidade', 'Treinamento corretivo', 'Relatório'],
    items: [
      { t: 'Definir e documentar a fórmula da taxa de fechamento', p: 'C', o: 'Tiago', d: 6 },
      { t: 'Auditoria do registro de fechamentos pela clínica', p: 'C', o: 'Micaela', d: 12 },
      { t: 'Painel de previsibilidade', p: 'C', o: 'Micaela', d: 18 },
      { t: 'Treinamento corretivo', p: 'C', o: 'Tiago', d: 22 },
    ] },
  { n: 10, title: 'Experiência do paciente', short: 'Experiência', pillars: ['R', 'B'],
    desc: 'Pós-atendimento, lembrete de retorno e satisfação. Assuntos clínicos sempre com humano.',
    outputs: ['Jornadas configuradas', 'Relatórios', 'Plano de melhoria'],
    items: [
      { t: 'Mensagem de pós-atendimento (24AGÁ)', p: 'R', o: 'Tiago', d: 8 },
      { t: 'Lembrete de retorno', p: 'R', o: 'Tiago', d: 10 },
      { t: 'Pesquisa breve de satisfação', p: 'B', o: 'Micaela', d: 12 },
      { t: 'Fluxo humano para reclamações e assuntos clínicos', p: 'R', o: 'Tiago', d: 14 },
      { t: 'Medir envios, entregas, respostas e satisfação', p: 'R', o: 'Micaela', d: 26 },
    ] },
  { n: 11, title: 'Base ativa e eficiência', short: 'Base ativa', pillars: ['R'],
    desc: 'Padrão: pausar tráfego novo e trabalhar a base. Se a clínica quiser manter, registrar aprovação.',
    outputs: ['Plano aprovado de mídia/base', 'Relatório'],
    items: [
      { t: 'Decisão de mídia com a clínica (pausar ou manter) — registrar aprovação', p: 'M', o: 'Tiago', d: 3 },
      { t: 'Plano da base: follow-up, reativação e retenção', p: 'R', o: 'Tiago', d: 8 },
      { t: 'Medir desempenho da base e economia de mídia', p: 'R', o: 'Micaela', d: 26 },
    ] },
  { n: 12, title: 'Consolidação, auditoria anual e renovação', short: 'Renovação', pillars: ['M', 'B', 'C', 'R'],
    desc: 'Revisão do ano, relatório anual, plano do próximo ciclo e proposta de renovação.',
    outputs: ['Relatório anual executivo', 'Evolução do MBCR', 'Plano do próximo ano', 'Proposta de renovação'],
    items: [
      { t: 'Revisão do ano completo', p: 'M', o: 'Tiago', d: 10, c: ['Investimento', 'Campanhas', 'Leads e origem', 'Agendamentos', 'Pacientes pagantes', 'Faturamento atribuído', 'Custos e retorno'] },
      { t: 'Qualidade dos registros e processos implementados', p: 'C', o: 'Micaela', d: 12 },
      { t: 'Relatório anual executivo', p: 'B', o: 'Tiago', d: 20 },
      { t: 'Plano do próximo ano e proposta de renovação', p: 'R', o: 'Tiago', d: 25 },
    ] },
];

// Rotinas que se repetem todo mês (ficam ativas mesmo com novidades novas)
// Rotinas mensais (ciclo de campanha e conteúdo + reuniões + relatório). Continuam ativas todo mês.
// skip: meses em que a rotina não entra; alt: título alternativo nos meses 11–12 (mídia pausada por padrão)
const ROUTINES = [
  { t: 'Planejar a campanha do mês (oferta, público e orçamento)', p: 'M', o: 'Tiago', d: 1, h: 1, skip: [1], alt: 'Planejar a campanha de base (ou mídia, se mantida)' },
  { t: 'Calendário editorial do mês', p: 'B', o: 'Micaela', d: 2, h: 1 },
  { t: 'Roteiros dos criativos e envio à clínica', p: 'B', o: 'Micaela', d: 2, h: 1.5 },
  { t: 'Cobrar e receber as gravações da clínica', p: 'B', o: 'Micaela', d: 5, h: 0.25 },
  { t: 'Reunião 1 — Estratégia e resultados (60 min)', p: 'M', o: 'Tiago', d: 7, meeting: true, h: 1 },
  { t: 'Editar vídeos e artes do mês', p: 'B', o: 'Micaela', d: 8, h: 1.5 },
  { t: 'Aprovar os criativos com a clínica', p: 'B', o: 'Micaela', d: 9, h: 0.5 },
  { t: 'Subir a campanha e os anúncios novos', p: 'M', o: 'Tiago', d: 10, h: 1, skip: [1], alt: 'Campanha de base: follow-up e reativação no ar' },
  { t: 'Manutenção dos fluxos 24AGÁ', p: 'C', o: 'Tiago', d: 10, h: 1 },
  { t: 'Trocar os criativos que cansaram', p: 'M', o: 'Tiago', d: 20, h: 0.5 },
  { t: 'Reunião 2 — Treinamento comercial e conversão (60 min)', p: 'C', o: 'Tiago', d: 21, meeting: true, h: 1 },
  { t: 'Analisar o mês e separar os números', p: 'M', o: 'Micaela', d: 25, h: 1 },
  { t: 'Relatório mensal (revisado por Tiago)', p: 'M', o: 'Tiago', d: 28, h: 1.5 },
];
// Rotinas semanais (toda segunda-feira do mês)
const WEEKLY = [
  { t: 'Otimização semanal dos anúncios', p: 'M', o: 'Tiago', h: 0.5, alt: 'Otimização semanal das campanhas de base' },
  { t: 'Agendar e conferir os posts da semana', p: 'B', o: 'Micaela', h: 0.25 },
];
// Rotina diária (seg–sex), em checklist único para todas as clínicas — minutos por clínica
const DAILY_CHECKS = [
  { k: 'mon', t: 'Monitorar anúncios', d: 'Gasto, custo por contato e anúncios reprovados', o: 'Micaela', min: 5 },
  { k: 'msg', t: 'Mensagens e pedidos da clínica', d: 'Responder dúvidas e pedidos do dia', o: 'Tiago', min: 5 },
];
const PROSPECT_MIN = 120;

// sempre em ordem de dia
MONTHS.forEach((m) => m.items.sort((a, b) => a.d - b.d));

const CREATIVES_PER_MONTH = 6;

const STAGES = [
  ['lead', 'Lead'], ['proposta', 'Proposta'], ['negociacao', 'Negociação'], ['onboarding', 'Onboarding'],
  ['ativo', 'Ativo'], ['pausado', 'Pausado'], ['encerrado', 'Encerrado'],
];
const TASK_STATUS = [['a_fazer', 'A fazer'], ['andamento', 'Em andamento'], ['bloqueado', 'Bloqueado'], ['concluido', 'Concluído']];
const CREATIVE_STATUS = [
  ['roteiro', 'Roteiro'], ['gravacao', 'Aguardando gravação'], ['edicao', 'Em edição'], ['aprovacao', 'Em aprovação'],
  ['aprovado', 'Aprovado'], ['em_uso', 'Em uso'], ['nao_necessario', 'Não necessário'],
];
const OWNERS = ['Tiago', 'Micaela', 'Clínica'];
