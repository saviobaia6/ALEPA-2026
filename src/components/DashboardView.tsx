import React, { useState } from 'react';
import {
  Bell,
  BookOpen,
  CalendarCheck,
  Check,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  Headphones,
  Layers,
  Lightbulb,
  Play,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  MEDIO_CARGOS,
  MEDIO_CONCURSO_PROFILE,
  getMedioDisciplines,
  isMedioDisciplineId,
} from '../data/alepaMedioSyllabus';
import { MEDIO_QUESTIONS } from '../data/alepaMedioLibrary';
import {
  ALEPA_DISCIPLINES,
  CONCURSO_PROFILE,
  formatDateKey,
  generateDailyPlanForDate,
  getDaysUntilExam,
} from '../data/alepaSyllabus';
import { StudyAlertSettings } from '../hooks/useStudyAlert';
import { CampusLevel, MedioCargoGroup, NavSection } from '../types';

interface DashboardViewProps {
  campus: CampusLevel;
  onChangeCampus: (campus: CampusLevel) => void;
  medioCargoGroup: MedioCargoGroup;
  onChangeMedioCargoGroup: (group: MedioCargoGroup) => void;
  onNavigate: (section: NavSection) => void;
  onStartFocusTimer: (disciplineId: string, topicTitle: string) => void;
  alertSettings: StudyAlertSettings;
}

function getCurrentWeekRange() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = today.getDay(); // 0 = Sunday, 1 = Monday...
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmtBr = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

  return {
    startKey: formatDateKey(monday),
    endKey: formatDateKey(sunday),
    label: `${fmtBr(monday)} – ${fmtBr(sunday)}`,
  };
}

export function DashboardView({
  campus,
  onChangeCampus,
  medioCargoGroup,
  onChangeMedioCargoGroup,
  onNavigate,
  onStartFocusTimer,
  alertSettings,
}: DashboardViewProps) {
  const {
    profile,
    topicProgressMap,
    disciplineGoalsMap,
    saveDisciplineWeeklyGoal,
    studySessions,
    simuladoAttempts,
    errorNotebook,
    materials,
    questions,
  } = useAuth();

  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);
  const [savedGoalIds, setSavedGoalIds] = useState<Record<string, boolean>>({});
  const [goalFeedbackError, setGoalFeedbackError] = useState<string | null>(null);

  const isMedio = campus === 'medio';
  const todayKey = formatDateKey(new Date());
  const currentWeek = getCurrentWeekRange();
  const dailyGoal = profile?.dailyGoalMinutes || CONCURSO_PROFILE.dailyGoalMinutes;
  const minutesToday = studySessions
    .filter((s) => s.dateKey === todayKey)
    .reduce((acc, s) => acc + s.durationMinutes, 0);

  const dailyPct = Math.min(100, Math.round((minutesToday / dailyGoal) * 100));
  const daysUntilExam = getDaysUntilExam(profile?.examDate || CONCURSO_PROFILE.examDate);

  const activeDisciplines = isMedio ? getMedioDisciplines(medioCargoGroup) : ALEPA_DISCIPLINES;

  // Campus-independent metrics (conteúdos, progresso, simulados e revisões separados)
  const campusSessions = studySessions.filter((s) =>
    isMedio ? isMedioDisciplineId(s.disciplineId) : !isMedioDisciplineId(s.disciplineId)
  );
  const campusAttempts = simuladoAttempts.filter((a) =>
    isMedio ? isMedioDisciplineId(a.primaryDisciplineId) : !isMedioDisciplineId(a.primaryDisciplineId)
  );
  const campusErrors = errorNotebook.filter((e) =>
    isMedio ? isMedioDisciplineId(e.disciplineId) : !isMedioDisciplineId(e.disciplineId)
  );
  const campusMaterials = materials.filter((m) =>
    isMedio
      ? isMedioDisciplineId(m.disciplineId) || Boolean(m.libraryCategoryId?.startsWith('nm_cat_'))
      : !isMedioDisciplineId(m.disciplineId) && !m.libraryCategoryId?.startsWith('nm_cat_')
  );
  const campusPodcastCount = campusMaterials.filter((m) => m.resourceType === 'podcast').length;
  const campusQuestionCount = questions.filter((q) =>
    isMedio ? isMedioDisciplineId(q.disciplineId) : !isMedioDisciplineId(q.disciplineId)
  ).length;

  const totalTopics = activeDisciplines.reduce((acc, d) => acc + d.topics.length, 0);
  const completedTopics = activeDisciplines.reduce(
    (acc, d) =>
      acc +
      d.topics.filter((t) => topicProgressMap[t.id]?.theoryDone && topicProgressMap[t.id]?.questionsDone).length,
    0
  );
  const syllabusPct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  const pendingErrors = campusErrors.filter((e) => e.status === 'pending').length;
  const latestAttempt = campusAttempts[0];

  const dayIndex = Math.max(0, new Date().getDate() - 1);
  const todayPlan = generateDailyPlanForDate(new Date(), dayIndex);
  const currentBlock = isMedio
    ? {
        disciplineId: activeDisciplines[0]?.id || 'nm_portugues',
        disciplineName: activeDisciplines[0]?.shortName || 'Língua Portuguesa',
        topicTitle: activeDisciplines[0]?.topics[0]?.title || 'Conteúdo Programático Nível Médio',
      }
    : todayPlan.blocks[0];

  const disciplineStats = activeDisciplines.map((disc) => {
    const topicIds = disc.topics.map((t) => t.id);
    const total = topicIds.length;
    const masterySum = topicIds.reduce((sum, id) => sum + (topicProgressMap[id]?.masteryLevel || 0), 0);
    const completed = topicIds.filter(
      (id) => topicProgressMap[id]?.theoryDone && topicProgressMap[id]?.questionsDone
    ).length;
    const avgPct = total > 0 ? Math.round(masterySum / total) : 0;
    const minutesLogged = campusSessions
      .filter((s) => s.disciplineId === disc.id)
      .reduce((sum, s) => sum + s.durationMinutes, 0);
    const weeklyMinutesLogged = campusSessions
      .filter(
        (s) =>
          s.disciplineId === disc.id &&
          s.dateKey >= currentWeek.startKey &&
          s.dateKey <= currentWeek.endKey
      )
      .reduce((sum, s) => sum + s.durationMinutes, 0);
    const savedGoal = disciplineGoalsMap[disc.id];
    const suggestedWeeklyGoal = Math.max(30, disc.recommendedMinutesPerCycle * 2);
    const weeklyGoalMinutes = savedGoal?.weeklyGoalMinutes ?? suggestedWeeklyGoal;
    const hasCustomGoal = Boolean(savedGoal);
    const weeklyGoalRawPct =
      weeklyGoalMinutes > 0 ? Math.round((weeklyMinutesLogged / weeklyGoalMinutes) * 100) : 0;
    const weeklyGoalBarPct = Math.min(100, weeklyGoalRawPct);

    return {
      id: disc.id,
      rank: disc.priorityRank,
      shortName: disc.shortName,
      firstTopicTitle: disc.topics[0]?.title || disc.shortName,
      editalBlock: disc.editalBlock,
      examQuestions: disc.examQuestions,
      examPoints: disc.examPoints,
      totalTopics: total,
      completedTopics: completed,
      avgPct,
      minutesLogged,
      weeklyMinutesLogged,
      weeklyGoalMinutes,
      hasCustomGoal,
      weeklyGoalRawPct,
      weeklyGoalBarPct,
    };
  });

  const handleSaveDisciplineGoal = async (discId: string, fallbackMinutes: number) => {
    const rawStr = goalDrafts[discId];
    const parsed = rawStr !== undefined ? Number(rawStr) : fallbackMinutes;
    if (!Number.isFinite(parsed) || parsed < 15) {
      setGoalFeedbackError('Informe uma meta semanal entre 15 e 2520 minutos.');
      return;
    }

    setGoalFeedbackError(null);
    setSavingGoalId(discId);
    try {
      const clamped = Math.max(15, Math.min(2520, Math.round(parsed)));
      await saveDisciplineWeeklyGoal(discId, clamped);
      setGoalDrafts((prev) => {
        const copy = { ...prev };
        delete copy[discId];
        return copy;
      });
      setSavedGoalIds((prev) => ({ ...prev, [discId]: true }));
      window.setTimeout(() => {
        setSavedGoalIds((prev) => ({ ...prev, [discId]: false }));
      }, 2200);
    } catch (err) {
      setGoalFeedbackError(err instanceof Error ? err.message : 'Não foi possível salvar a meta.');
    } finally {
      setSavingGoalId(null);
    }
  };

  const totalWeeklyStudiedMinutes = disciplineStats.reduce((sum, d) => sum + d.weeklyMinutesLogged, 0);
  const totalWeeklyTargetMinutes = disciplineStats.reduce((sum, d) => sum + d.weeklyGoalMinutes, 0);
  const overallWeeklyGoalPct =
    totalWeeklyTargetMinutes > 0
      ? Math.round((totalWeeklyStudiedMinutes / totalWeeklyTargetMinutes) * 100)
      : 0;

  const overallMasteryPct =
    disciplineStats.length > 0
      ? Math.round(disciplineStats.reduce((sum, d) => sum + d.avgPct, 0) / disciplineStats.length)
      : 0;
  const totalLoggedMinutesCampus = campusSessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  const activeMedioCargoLabel =
    medioCargoGroup === 'cargo_02'
      ? 'Cargo 02 – Central Telefônica (PL.AL.065)'
      : medioCargoGroup === 'cargo_03'
        ? 'Cargo 03 – Manutenção de Patrimônio (PL.AL.062)'
        : 'Cargo 04 – Auxiliar Técnico Legislativo – Assistência Administrativa (PL.AL.060)';

  const navigationCards: Array<{
    id: NavSection;
    title: string;
    subtitle: string;
    metric: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'disciplines',
      title: isMedio ? 'Conteúdo Programático (11 Disciplinas)' : 'Conteúdo Programático (Nível Superior)',
      subtitle: isMedio
        ? 'Anexo II oficial – Cargo 04 (PL.AL.060) e demais cargos de Nível Médio.'
        : 'Anexo II oficial – Cargo 03 (Técnico Legislativo · PL.AL.102).',
      metric: `${completedTopics}/${totalTopics} tópicos · ${syllabusPct}%`,
      icon: BookOpen,
    },
    {
      id: 'materials',
      title: 'Biblioteca Geral + Específicas & Drive',
      subtitle: isMedio
        ? 'Biblioteca Geral (comuns aos 2 níveis) + Acervo específico do Nível Médio (Cargo 04), Drive, Planilhas e Slides.'
        : 'Biblioteca Geral (comuns aos 2 níveis) + Acervo específico do Nível Superior (Cargo 03), Drive, Planilhas e Slides.',
      metric: `${campusMaterials.length} recursos · 8 tipos`,
      icon: FileText,
    },
    {
      id: 'podcasts',
      title: 'Podcasts por Disciplina',
      subtitle: isMedio
        ? 'Links de áudio independentes para as 11 matérias do Cargo 04 (PL.AL.060).'
        : 'Links de áudio independentes para o Cargo 03 (PL.AL.102).',
      metric: `${campusPodcastCount} ${campusPodcastCount === 1 ? 'podcast' : 'podcasts'}`,
      icon: Headphones,
    },
    {
      id: 'simulados',
      title: 'Questões e Simulados CETAP',
      subtitle: isMedio
        ? 'Banco independente de questões e simulados para Nível Médio (Cargo 04).'
        : 'Banco independente de questões e simulados para Nível Superior (Cargo 03).',
      metric: latestAttempt
        ? `Último: ${latestAttempt.score.toFixed(1)}/10`
        : `${isMedio ? Math.max(campusQuestionCount, MEDIO_QUESTIONS.length) : campusQuestionCount} questões`,
      icon: ClipboardList,
    },
    {
      id: 'schedule',
      title: 'Cronograma Diário até 13/12/2026',
      subtitle: 'Plano 2h/dia, Anexo III oficial (Edital 001/2026) e alertas WhatsApp/E-mail.',
      metric: `${minutesToday}/${dailyGoal} min hoje`,
      icon: CalendarCheck,
    },
    {
      id: 'performance',
      title: 'Desempenho & Caderno de Erros',
      subtitle: isMedio
        ? 'Métricas, horas e revisão espaçada isoladas do Nível Médio.'
        : 'Métricas, horas e revisão espaçada isoladas do Nível Superior.',
      metric: `${pendingErrors} revisões · ${campusAttempts.length} simulados`,
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Dois Caminhos Independentes: Meu Campus ALEPA */}
      <section className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-[#146C43]">Meu Campus ALEPA · Bibliotecas Independentes</p>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
              Selecione seu concurso para acessar a biblioteca
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Biblioteca Geral para matérias comuns aos dois níveis; bibliotecas específicas (Cargo 03 e Cargo 04), progresso e simulados separados por edital.
            </p>
          </div>
          <a
            href={MEDIO_CONCURSO_PROFILE.editalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-[#0B3321] hover:underline inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>Página oficial do concurso – CETAP</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* 2 Independent Campus Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card Nível Superior */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onChangeCampus('superior')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChangeCampus('superior');
              }
            }}
            className={`cursor-pointer rounded-2xl border p-5 transition-colors flex flex-col justify-between gap-3 ${
              campus === 'superior'
                ? 'border-[#0B3321] bg-[#0B3321] text-white'
                : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <GraduationCap
                  className={`w-6 h-6 shrink-0 mt-0.5 ${
                    campus === 'superior' ? 'text-emerald-300' : 'text-[#146C43]'
                  }`}
                />
                <div>
                  <p className={`text-xs font-mono font-semibold ${campus === 'superior' ? 'text-emerald-300' : 'text-[#146C43]'}`}>
                    Concurso ALEPA – Nível Superior · Edital nº 002/2026
                  </p>
                  <h2 className="font-display text-lg font-bold mt-0.5">
                    Cargo 03 – Assessoramento Legislativo
                  </h2>
                  <p className={`text-xs font-mono mt-0.5 ${campus === 'superior' ? 'text-emerald-100' : 'text-slate-700'}`}>
                    Técnico Legislativo – PL.AL.102
                  </p>
                </div>
              </div>
              <span
                className={`text-[11px] font-semibold shrink-0 ${
                  campus === 'superior' ? 'text-emerald-300' : 'text-slate-500'
                }`}
              >
                {campus === 'superior' ? 'Campus ativo' : 'Selecionar'}
              </span>
            </div>

            <p className={`text-xs leading-relaxed ${campus === 'superior' ? 'text-emerald-100/90' : 'text-slate-600'}`}>
              Biblioteca, legislação, videoaulas, questões e simulados.
            </p>
          </div>

          {/* Card Nível Médio - Cargo 04 PL.AL.060 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              onChangeCampus('medio');
              onChangeMedioCargoGroup('cargo_01_04');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChangeCampus('medio');
                onChangeMedioCargoGroup('cargo_01_04');
              }
            }}
            className={`cursor-pointer rounded-2xl border p-5 transition-colors flex flex-col justify-between gap-3 ${
              campus === 'medio'
                ? 'border-[#0B3321] bg-[#0B3321] text-white'
                : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Layers
                  className={`w-6 h-6 shrink-0 mt-0.5 ${
                    campus === 'medio' ? 'text-emerald-300' : 'text-[#146C43]'
                  }`}
                />
                <div>
                  <p className={`text-xs font-mono font-semibold ${campus === 'medio' ? 'text-emerald-300' : 'text-[#146C43]'}`}>
                    Concurso ALEPA – Nível Médio · Edital nº 001/2026
                  </p>
                  <h2 className="font-display text-lg font-bold mt-0.5">
                    Cargo 04 – Assistência Administrativa
                  </h2>
                  <p className={`text-xs font-mono mt-0.5 ${campus === 'medio' ? 'text-emerald-100' : 'text-slate-700'}`}>
                    Auxiliar Técnico Legislativo – PL.AL.060
                  </p>
                </div>
              </div>
              <span
                className={`text-[11px] font-semibold shrink-0 ${
                  campus === 'medio' ? 'text-emerald-300' : 'text-slate-500'
                }`}
              >
                {campus === 'medio' ? 'Campus ativo' : 'Selecionar'}
              </span>
            </div>

            <div className="space-y-1.5">
              <p className={`text-xs ${campus === 'medio' ? 'text-emerald-100/95' : 'text-slate-700'}`}>
                Escolaridade: <strong>Ensino Médio Completo</strong> · Remuneração: <strong>R$ 2.295,22</strong> · Banca:{' '}
                <strong>Fundação CETAP</strong>
              </p>
              <p className={`text-[11px] font-mono ${campus === 'medio' ? 'text-emerald-200' : 'text-slate-600'}`}>
                50 questões objetivas: 20 Específicas · 10 Português · 10 Legislação · 5 Raciocínio · 5 Informática
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className={campus === 'medio' ? 'text-emerald-100/85' : 'text-slate-600'}>
                  Biblioteca, legislação, videoaulas, questões e simulados.
                </span>
                <a
                  href={MEDIO_CONCURSO_PROFILE.editalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`font-semibold inline-flex items-center gap-1 hover:underline ${
                    campus === 'medio' ? 'text-emerald-300' : 'text-[#0B3321]'
                  }`}
                >
                  <span>fundacaocetap.selecao.net.br</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Active Campus Deep Forest Green Hero Banner */}
        <section className="bg-[#0B3321] text-white rounded-2xl p-6 sm:p-7 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-emerald-300 tracking-wide">
                {isMedio
                  ? `${MEDIO_CONCURSO_PROFILE.editalNumber} · Campus Nível Médio`
                  : `${CONCURSO_PROFILE.editalNumber} · Campus Nível Superior`}{' '}
                · {profile?.role === 'teacher' ? 'Área do Professor' : 'Área do Estudante'}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                {isMedio ? 'ALEPA 2026 – Nível Médio (PL.AL.060)' : 'ALEPA 2026 – Nível Superior (PL.AL.102)'}
              </h2>
              <p className="text-sm text-emerald-100/90">
                {isMedio
                  ? `${activeMedioCargoLabel} · Remuneração: R$ 2.295,22 · Fundação CETAP`
                  : `Cargo 03 – Assessoramento Legislativo – Técnico Legislativo (${CONCURSO_PROFILE.code}) · Fundação CETAP`}
              </p>
            </div>
            {isMedio ? (
              <Layers className="w-7 h-7 text-emerald-200/90 shrink-0" />
            ) : (
              <GraduationCap className="w-7 h-7 text-emerald-200/90 shrink-0" />
            )}
          </div>

          <div className="mt-6 pt-5 border-t border-white/15 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-display text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">
                13/12/2026
              </p>
              <p className="text-xs text-emerald-100/80 mt-1">Realização da Prova Objetiva (Anexo III)</p>
            </div>

            <div className="flex flex-wrap items-end gap-6 sm:gap-8">
              <div className="text-right">
                <p className="font-display text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">
                  50
                </p>
                <p className="text-xs text-emerald-100/80 mt-1">Questões na prova (10 pts)</p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">
                  {syllabusPct}%
                </p>
                <p className="text-xs text-emerald-100/80 mt-1">Edital concluído ({campus === 'medio' ? 'Médio' : 'Superior'})</p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">
                  {daysUntilExam}
                </p>
                <p className="text-xs text-emerald-100/80 mt-1">Dias até a prova</p>
              </div>
            </div>
          </div>
        </section>

        {/* Sub-selector de cargos Nível Médio (destacando Cargo 04 - PL.AL.060) */}
        {isMedio && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {MEDIO_CARGOS.map((cargo) => {
              const selected = medioCargoGroup === cargo.group && (cargo.code === 'PL.AL.060' || medioCargoGroup !== 'cargo_01_04');
              return (
                <button
                  key={cargo.code}
                  type="button"
                  onClick={() => onChangeMedioCargoGroup(cargo.group)}
                  className={`text-left p-3 rounded-xl border text-xs transition-colors ${
                    selected
                      ? 'border-[#146C43] bg-emerald-50/70 text-slate-900'
                      : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <p className="font-mono font-bold text-[#0B3321]">
                    {cargo.cargoNumber} · {cargo.code}
                  </p>
                  <p className="font-semibold truncate mt-0.5">{cargo.shortTitle.replace(/^Cargo \d+ · /, '')}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{cargo.vacanciesSummary}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* 2-Column Module Cards Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {navigationCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onNavigate(card.id)}
                className="text-left bg-white border border-slate-200 hover:border-emerald-700/50 rounded-2xl p-5 transition-colors flex flex-col justify-between gap-3 min-h-[118px]"
              >
                <div className="flex items-center justify-between gap-3">
                  <Icon className="w-5 h-5 text-[#146C43]" />
                  <span className="font-mono text-xs text-slate-500 tabular-nums">{card.metric}</span>
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900">{card.title}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{card.subtitle}</p>
                </div>
              </button>
            );
          })}
        </section>
      </section>

      {/* Gráfico de Progressão por Disciplina (independente por Campus) */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold text-[#146C43]">
              Acompanhamento Independente ·{' '}
              {isMedio
                ? 'Nível Médio · Cargo 04 (PL.AL.060) – 11 Disciplinas'
                : 'Nível Superior · Cargo 03 (PL.AL.102)'}
            </p>
            <h2 className="font-display text-xl font-bold text-slate-900 mt-0.5">
              Gráfico de Progressão por Disciplina
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 font-mono tabular-nums">
            <span>
              Domínio médio: <strong className="text-[#0B3321]">{overallMasteryPct}%</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Tópicos concluídos: <strong className="text-[#0B3321]">{completedTopics}/{totalTopics}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Horas no campus: <strong className="text-[#0B3321]">{(totalLoggedMinutesCampus / 60).toFixed(1)}h</strong>
            </span>
          </div>
        </div>

        {/* Quantidade de Questões por Bloco da Prova Objetiva (Nível Médio e Superior) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            { label: 'Conhec. Específicos', q: '20 questões', pts: '4,0 pts · 1º desemp.' },
            { label: 'Legislação e Ética', q: '10 questões', pts: '2,0 pts · 2º desemp.' },
            { label: 'Língua Portuguesa', q: '10 questões', pts: '2,0 pts · 3º desemp.' },
            { label: 'Raciocínio Lógico', q: '05 questões', pts: '1,0 pt · 4º desemp.' },
            { label: 'Informática', q: '05 questões', pts: '1,0 pt · 5º desemp.' },
          ].map((blk) => (
            <div key={blk.label} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-600 truncate">{blk.label}</p>
              <p className="font-display text-sm font-bold text-[#0B3321] font-mono tabular-nums mt-0.5">{blk.q}</p>
              <p className="text-[10px] font-mono text-slate-500 mt-0.5">{blk.pts}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3.5" role="region" aria-label="Gráfico de barras de progressão por disciplina">
          {disciplineStats.map((stat) => (
            <div key={stat.id} className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => onNavigate('disciplines')}
                  className="font-semibold text-slate-900 hover:text-[#146C43] transition-colors text-left"
                >
                  <span className="font-mono text-slate-500 mr-1.5">{String(stat.rank).padStart(2, '0')}.</span>
                  {stat.shortName}
                </button>

                <div className="flex items-center gap-3 font-mono text-slate-500 tabular-nums">
                  <span className="text-[#0B3321] font-medium">
                    {stat.examQuestions}q{stat.editalBlock === 'Conhecimentos Específicos' ? ' (bloco)' : ''}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{stat.completedTopics}/{stat.totalTopics} tópicos</span>
                  <span aria-hidden="true">·</span>
                  <span>{stat.minutesLogged} min</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-bold text-[#0B3321] w-10 text-right">{stat.avgPct}%</span>
                </div>
              </div>

              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${stat.avgPct > 0 ? Math.max(4, stat.avgPct) : 0}%`,
                    backgroundColor: stat.avgPct >= 75 ? '#0B3321' : '#146C43',
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>Cálculo baseado no avanço de Teoria (40%), Questões (40%) e Revisão (20%) por tópico.</span>
          <button
            type="button"
            onClick={() => onNavigate('disciplines')}
            className="font-semibold text-[#0B3321] hover:underline whitespace-nowrap"
          >
            Atualizar checklist das disciplinas
          </button>
        </div>
      </section>

      {/* Metas Semanais de Minutos por Disciplina (Tempo Real Estudado × Meta Definida) */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-[#146C43]">
              <Target className="w-4 h-4" />
              <p className="text-xs font-semibold">
                Semana Atual ({currentWeek.label}) · {isMedio ? 'Nível Médio (PL.AL.060)' : 'Nível Superior (PL.AL.102)'}
              </p>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900 mt-0.5">
              Metas Semanais por Disciplina (Minutos Reais × Meta)
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Defina quantos minutos deseja estudar por semana em cada matéria e acompanhe seu tempo real registrado.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 font-mono tabular-nums">
            <span>
              Estudado na semana: <strong className="text-[#0B3321]">{totalWeeklyStudiedMinutes} min</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Meta semanal total: <strong className="text-[#0B3321]">{totalWeeklyTargetMinutes} min</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Cumprimento: <strong className="text-[#0B3321]">{overallWeeklyGoalPct}%</strong>
            </span>
          </div>
        </div>

        {goalFeedbackError && (
          <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-2.5 text-xs font-medium">
            {goalFeedbackError}
          </div>
        )}

        <div className="space-y-4">
          {disciplineStats.map((stat) => {
            const draftValue = goalDrafts[stat.id] ?? String(stat.weeklyGoalMinutes);
            const hasPendingEdit =
              goalDrafts[stat.id] !== undefined && Number(goalDrafts[stat.id]) !== stat.weeklyGoalMinutes;
            const isSaving = savingGoalId === stat.id;
            const isSaved = Boolean(savedGoalIds[stat.id]);
            const goalMet = stat.weeklyMinutesLogged >= stat.weeklyGoalMinutes;
            const remainingMinutes = Math.max(0, stat.weeklyGoalMinutes - stat.weeklyMinutesLogged);

            return (
              <div
                key={stat.id}
                className="p-4 rounded-xl border border-slate-200/90 bg-slate-50/40 space-y-2.5"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-500 font-bold">
                        {String(stat.rank).padStart(2, '0')}.
                      </span>
                      <h3 className="text-sm font-bold text-slate-900">{stat.shortName}</h3>
                      <span
                        className={`text-[11px] font-medium ${
                          stat.hasCustomGoal ? 'text-[#146C43]' : 'text-slate-500'
                        }`}
                      >
                        {stat.hasCustomGoal ? 'Meta definida' : 'Sugestão inicial'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 font-mono tabular-nums">
                      Real na semana: <strong className="text-slate-900">{stat.weeklyMinutesLogged} min</strong> de{' '}
                      <strong className="text-slate-900">{stat.weeklyGoalMinutes} min</strong> ·{' '}
                      <span className={goalMet ? 'text-[#0B3321] font-semibold' : 'text-slate-600'}>
                        {goalMet
                          ? stat.weeklyMinutesLogged > stat.weeklyGoalMinutes
                            ? `Meta superada (+${stat.weeklyMinutesLogged - stat.weeklyGoalMinutes} min)`
                            : 'Meta semanal atingida!'
                          : `Faltam ${remainingMinutes} min`}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <label htmlFor={`goal-${stat.id}`} className="text-[11px] font-medium text-slate-600">
                      Meta (min/sem):
                    </label>
                    <input
                      id={`goal-${stat.id}`}
                      type="number"
                      min={15}
                      max={2520}
                      step={15}
                      value={draftValue}
                      onChange={(e) =>
                        setGoalDrafts((prev) => ({
                          ...prev,
                          [stat.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleSaveDisciplineGoal(stat.id, stat.weeklyGoalMinutes);
                        }
                      }}
                      className="w-24 min-h-[36px] px-2.5 py-1 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
                    />
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void handleSaveDisciplineGoal(stat.id, stat.weeklyGoalMinutes)}
                      className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                        isSaved
                          ? 'bg-emerald-700 text-white'
                          : hasPendingEdit
                            ? 'bg-[#0B3321] hover:bg-[#134b32] text-white'
                            : 'bg-white border border-slate-300 hover:border-[#0B3321] text-slate-800'
                      }`}
                    >
                      {isSaved ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Salvo</span>
                        </>
                      ) : isSaving ? (
                        <span>Salvando...</span>
                      ) : (
                        <span>Salvar meta</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onStartFocusTimer(stat.id, stat.firstTopicTitle)}
                      title="Iniciar cronômetro e registrar minutos nesta disciplina"
                      className="min-h-[36px] px-2.5 py-1 bg-white border border-slate-200 hover:border-[#146C43] text-[#0B3321] text-xs font-medium rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Estudar</span>
                    </button>
                  </div>
                </div>

                {/* Barra de Progresso Individual Comparativa */}
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 flex-1 bg-slate-200/80 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-label={`Progresso semanal em ${stat.shortName}: ${stat.weeklyMinutesLogged} de ${stat.weeklyGoalMinutes} minutos`}
                    aria-valuenow={stat.weeklyMinutesLogged}
                    aria-valuemin={0}
                    aria-valuemax={stat.weeklyGoalMinutes}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${stat.weeklyMinutesLogged > 0 ? Math.max(3, stat.weeklyGoalBarPct) : 0}%`,
                        backgroundColor: goalMet ? '#0B3321' : '#146C43',
                      }}
                    />
                  </div>
                  <span
                    className={`font-mono text-xs font-bold tabular-nums w-12 text-right ${
                      goalMet ? 'text-[#0B3321]' : 'text-slate-700'
                    }`}
                  >
                    {stat.weeklyGoalRawPct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Meta Diária 2h + Estudo de Hoje (Continuar de onde parei) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Meta diária</p>
              <p className="font-display text-3xl font-bold text-slate-900 tabular-nums mt-1">
                {Math.round(dailyGoal / 60)}h
              </p>
              <p className="text-xs text-slate-500 mt-1">Acompanhe seu progresso diário</p>
            </div>
            <span className="font-mono text-sm font-semibold text-[#146C43] tabular-nums">
              {dailyPct}% hoje
            </span>
          </div>

          <div className="mt-5 space-y-2">
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#146C43] rounded-full transition-all duration-300"
                style={{ width: `${dailyPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
              <span>{minutesToday} min concluídos</span>
              <span>Meta: {dailyGoal} min</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#146C43]">
                Estudo de hoje · {isMedio ? 'Nível Médio (PL.AL.060)' : 'Nível Superior (PL.AL.102)'}
              </p>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
                Continuar de onde parei
              </h2>
              <p className="text-sm text-slate-600">
                Teoria · Questões · Correção · Revisão — Foco inicial: <strong>{currentBlock.disciplineName}</strong>
              </p>
            </div>

            <button
              type="button"
              onClick={() => onStartFocusTimer(currentBlock.disciplineId, currentBlock.topicTitle)}
              className="min-h-[44px] px-5 py-2.5 bg-[#0B3321] hover:bg-[#134b32] text-white text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Play className="w-4 h-4" />
              <span>Iniciar bloco de 50 min</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
            {todayPlan.blocks.map((block, idx) => {
              const targetDisc = isMedio ? activeDisciplines[idx % activeDisciplines.length] : null;
              const discId = targetDisc ? targetDisc.id : block.disciplineId;
              const discName = targetDisc ? targetDisc.shortName : block.disciplineName;
              const topicTitle = targetDisc ? targetDisc.topics[0]?.title || block.topicTitle : block.topicTitle;

              return (
                <button
                  key={block.order}
                  type="button"
                  onClick={() => onStartFocusTimer(discId, topicTitle)}
                  className="text-left p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                    <span>0{block.order}. {block.label.split(' ')[0]}</span>
                    <span>{block.durationMinutes}m</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-900 truncate mt-1">{discName}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Dica do Dia & Alerta de Estudos */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-2">
          <div className="flex items-center gap-2 text-[#146C43]">
            <Lightbulb className="w-4 h-4" />
            <h3 className="font-display text-base font-bold text-slate-900">Dica de estudo de hoje</h3>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{todayPlan.studyTip}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-700">
                <Bell className="w-4 h-4" />
                <h3 className="font-display text-base font-bold text-slate-900">Alerta de estudos</h3>
              </div>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {alertSettings.enabled ? `Ativo · ${alertSettings.reminderTime}` : 'Desativado'}
              </span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{todayPlan.alertFocus}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => onNavigate('schedule')}
              className="text-xs font-semibold text-[#0B3321] hover:underline"
            >
              Configurar alerta (celular / WhatsApp / e-mail) e cronograma até 13/12
            </button>
            <button
              type="button"
              onClick={() => onNavigate('revisions')}
              className="text-xs font-medium text-slate-600 hover:underline"
            >
              Abrir Caderno de Erros
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
