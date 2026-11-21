// "O que fazer" de cada entrega do método MBCR (chave = título da tarefa).
'use strict';

const HOWTO = {
  // ---- Mês 1
  'Checklist de acessos (Instagram, Meta Business, contas de anúncio)': 'Pedir à clínica e testar cada acesso: Instagram, Meta Business Manager, conta de anúncios, pixel/mensuração e WhatsApp. Registrar o que falta e quem vai liberar. Sem acesso, nada do mês começa.',
  'Diagnóstico da clínica': 'Reunião de diagnóstico com a dona/dono: faturamento base dos últimos meses, serviços e tickets, margem estimada, capacidade de agenda, o que já fizeram de marketing e as metas. Esse número vira o baseline para comparar todo o resto.',
  'Definir responsável humano pelos fechamentos': 'Definir quem da clínica (recepcionista ou profissional) recebe os leads, confirma agendamentos e fecha vendas. Anotar nome, horário e canal. A 24AGÁ encaminha para essa pessoa.',
  'Procedimentos prioritários: análise de rentabilidade e decisão': 'A clínica lista os procedimentos que quer vender; a Roity analisa ticket, margem e demanda e recomenda os melhores. Registrar a recomendação e a decisão final da clínica (mesmo se ela escolher diferente).',
  'Orientações de gravação para a clínica': 'Enviar guia simples de gravação: luz, enquadramento vertical, áudio, duração e exemplos. Combinar quem grava e quando envia os vídeos.',
  'Planejamento de ofertas e calendário inicial': 'Montar as primeiras ofertas para os procedimentos escolhidos e o calendário editorial do mês (temas, datas, formatos).',
  'Organização do Instagram e posicionamento inicial': 'Ajustar bio, foto, destaques, link e fixados. Deixar claro o que a clínica faz, para quem e como agendar.',
  'Mensuração e campanhas iniciais Meta Ads': 'Configurar pixel/conversões e subir as primeiras campanhas com testes de público, oferta e criativo. Definir orçamento diário coerente com o mensal da clínica.',
  'Implantação inicial 24AGÁ': 'Cadastrar procedimentos, valores e perguntas frequentes na 24AGÁ; ativar pré-atendimento e qualificação; testar o encaminhamento para o humano responsável.',
  'Primeiro relatório e plano do mês 2': 'Juntar ações feitas, investimento, leads, custo por lead e problemas encontrados. Apresentar na 2ª reunião junto com o plano do mês 2.',
  // ---- Mês 2
  'Treinamento comercial da recepção': 'Treinar quem atende: abordagem, perguntas de qualificação, respostas às objeções mais comuns, como apresentar proposta e como pedir o fechamento.',
  'Playbook comercial e modelos de proposta': 'Entregar documento com roteiros de conversa, mensagens prontas e modelo de proposta por procedimento.',
  'CRM operacional: todo lead com status, responsável e resultado': 'Garantir que a clínica registra todo lead: origem, status, quem atendeu e resultado. Sem esse registro não dá para medir fechamento.',
  'Alinhar CRM e 24AGÁ': 'Conferir se os status da 24AGÁ batem com o CRM/planilha da clínica e corrigir os nomes de etapa.',
  'Iniciar campanhas mensais de follow-up e retenção (com consentimento)': 'Criar a campanha do mês para quem não fechou (follow-up) e para pacientes atuais (retenção), só para contatos com consentimento e com opção de sair.',
  'Ajustar scripts, ofertas e criativos pelas métricas': 'Olhar os números do mês 1 e ajustar o que está fraco: mensagem, oferta ou criativo.',
  // ---- Mês 3
  'Treinar tempo de resposta humano (referência: até 10 min)': 'Combinar com a clínica a meta de responder lead encaminhado em até 10 minutos no horário de atendimento e medir.',
  'Protocolo de confirmação ativa por humano': 'Definir quando e como o humano confirma cada agendamento (ex.: véspera e no dia) e registrar a confirmação.',
  'Recuperação de contatos sem resposta': 'Criar rotina para quem parou de responder: 2–3 tentativas espaçadas, sem excesso.',
  'Auditoria amostral de conversas e gargalos': 'Ler uma amostra de conversas e apontar onde os leads se perdem (demora, preço, falta de proposta, etc.).',
  'Dashboard de conversão e plano de correção': 'Mostrar leads → agendados → compareceram → fecharam e listar as correções combinadas.',
  // ---- Mês 4
  'Revisão documentada dos quatro eixos': 'Revisar e anotar o que muda em público, criativos, oferta e orçamento, com o motivo de cada decisão.',
  'Diagnóstico de causa antes de reorientar a oferta': 'Antes de trocar a oferta, descobrir se o problema é anúncio, atendimento, preço ou agenda. Trocar só depois de saber a causa.',
  'Matriz de testes e histórico de decisões': 'Planilha com cada teste: hipótese, o que mudou, período, resultado e decisão.',
  'Plano de otimização': 'Plano do próximo mês com os testes priorizados e o orçamento.',
  // ---- Mês 5
  'Classificar leads por situação': 'Separar a base em: fechou, não fechou, não respondeu, não compareceu, retornou e em negociação.',
  'Segmentos e automações 24AGÁ com cadência e limites': 'Criar um fluxo na 24AGÁ para cada grupo, com intervalo entre mensagens e limite de envios.',
  'Campanhas personalizadas e ofertas de recuperação': 'Mensagens e ofertas específicas para cada grupo (ex.: quem não compareceu ganha reagendamento facilitado).',
  'Relatório de recuperação': 'Quantos foram contatados, responderam, reagendaram e fecharam.',
  // ---- Mês 6
  'Auditoria de faturamento, leads e origem dos novos pacientes': 'Comparar faturamento com o baseline, qualidade dos leads e origem dos novos pacientes (incluir a pergunta “como conheceu a clínica?”).',
  'Conferir investimento, pagantes, taxa de fechamento e adesão': 'Conferir os números dos 6 meses e se a clínica seguiu o processo (registros, tempo de resposta, confirmações).',
  'Avaliar meta individual conforme contrato (revisão humana/jurídica)': 'Comparar resultado com a meta assinada, juntar evidências e levar para análise humana/jurídica. O app não decide garantia.',
  'Relatório executivo semestral e plano dos meses 7–12': 'Relatório do semestre e plano do segundo ciclo, apresentado em reunião.',
  // ---- Mês 7
  'Segmentação da base antiga': 'Separar pacientes antigos por procedimento feito, tempo desde a última visita e consentimento.',
  'Ofertas de retorno e manutenção (respeitando indicação clínica)': 'Criar ofertas de manutenção/retorno e de procedimentos complementares, sempre com indicação clínica.',
  'Mensagens aprovadas na 24AGÁ com consentimento e opt-out': 'Clínica aprova os textos; a 24AGÁ envia só para quem consentiu, com opção de sair.',
  'Métricas de reativação': 'Medir enviados, respostas, agendamentos e fechamentos da reativação.',
  // ---- Mês 8
  'Desenhar proposta de indicação (NÃO ativar incentivo sem revisão)': 'Desenhar como o paciente indica alguém. Ideia de 30% fica só no papel até a revisão ética e legal.',
  'Verificar regras do conselho, legislação e viabilidade': 'Checar regras do conselho da especialidade e a conta financeira antes de qualquer incentivo.',
  'Alternativa de indicação sem incentivo financeiro': 'Opção sem desconto (ex.: agradecimento, conteúdo exclusivo) caso o incentivo não seja permitido.',
  'Materiais, treinamento e controle manual pela clínica': 'Entregar materiais, treinar a equipe e criar o controle manual de quem indicou e de quem recebeu benefício.',
  // ---- Mês 9
  'Definir e documentar a fórmula da taxa de fechamento': 'Combinar por escrito: pacientes pagantes ÷ oportunidades (quais contam como oportunidade).',
  'Auditoria do registro de fechamentos pela clínica': 'Conferir se a clínica está registrando todos os fechamentos. Se faltar dado, avisar e orientar.',
  'Painel de previsibilidade': 'Painel com a taxa de fechamento mês a mês e a projeção de pacientes.',
  'Treinamento corretivo': 'Treino focado nos pontos fracos que a auditoria mostrou.',
  // ---- Mês 10
  'Mensagem de pós-atendimento (24AGÁ)': 'Configurar mensagem de cuidado/agradecimento após o atendimento.',
  'Lembrete de retorno': 'Configurar lembrete automático para o retorno/manutenção no prazo certo de cada procedimento.',
  'Pesquisa breve de satisfação': 'Pesquisa curta (1–3 perguntas) após o atendimento.',
  'Fluxo humano para reclamações e assuntos clínicos': 'Reclamação ou dúvida clínica vai direto para um humano da clínica. Nunca responder assunto médico automaticamente.',
  'Medir envios, entregas, respostas e satisfação': 'Medir quantos receberam, responderam e a nota média.',
  // ---- Mês 11
  'Decisão de mídia com a clínica (pausar ou manter) — registrar aprovação': 'Padrão: pausar tráfego novo e trabalhar a base. Se a clínica quiser manter, registrar a aprovação e o orçamento.',
  'Plano da base: follow-up, reativação e retenção': 'Plano do mês só com a base: follow-up, reativação e retenção.',
  'Medir desempenho da base e economia de mídia': 'Quanto a base gerou e quanto foi economizado em mídia.',
  // ---- Mês 12
  'Revisão do ano completo': 'Revisar o ano: investimento, campanhas, leads e origem, agendamentos, pagantes, faturamento atribuído, custos e retorno.',
  'Qualidade dos registros e processos implementados': 'Avaliar o que ficou implantado e a qualidade dos dados.',
  'Relatório anual executivo': 'Relatório do ano para apresentar à clínica (revisado por Tiago).',
  'Plano do próximo ano e proposta de renovação': 'Plano do próximo ciclo e proposta de renovação com escopo e condições.',
  // ---- Rotinas
  'Calendário editorial do mês': 'Definir os temas e datas de conteúdo do mês e enviar à clínica.',
  'Roteiros e orientações de gravação': 'Escrever os roteiros dos vídeos do mês (até 6 criativos) e enviar à clínica para gravar.',
  'Reunião 1 — Estratégia e resultados (60 min)': '60 min: resultados até agora, campanhas, ofertas e decisões. Fazer pauta antes e ata depois.',
  'Manutenção dos fluxos 24AGÁ': 'Revisar fluxos, respostas e encaminhamentos da 24AGÁ; corrigir o que falhou.',
  'Gestão e otimização Meta Ads': 'Revisar campanhas, pausar o que não funciona, subir criativos novos e ajustar orçamento.',
  'Meta Ads — conforme decisão de mídia (pausar/manter)': 'Seguir a decisão registrada: campanhas pausadas ou mantidas com o orçamento aprovado.',
  'Reunião 2 — Treinamento comercial e conversão (60 min)': '60 min: treino de atendimento e vendas com a equipe, revisando conversas reais. Fazer pauta e ata.',
  'Revisão de métricas e alimentar resultados': 'Coletar números de Ads, 24AGÁ e clínica e lançar em Resultados.',
  'Relatório mensal (revisado por Tiago)': 'Montar o relatório do mês (ações, indicadores, pendências e próximos passos), Tiago revisa antes de enviar.',
};
const howTo = (title) => HOWTO[title] || '';
