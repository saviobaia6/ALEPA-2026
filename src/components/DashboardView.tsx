import React from 'react';
import {
  Bell,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  Lightbulb,
  Play,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  ALEPA_DISCIPLINES,
  CONCURSO_PROFILE,
  formatDateKey,
  generateDailyPlanForDate,
  getDaysUntilExam,
} from '../data/alepaSyllabus';
import { StudyAlertSettings } from '../hooks/useStudyAlert';
import { NavSection } from '../types';

interface DashboardViewProps {
  onNavigate: (section: NavSection) => void;
  onStartFocusTimer: (disciplineId: string, topicTitle: string) => void;
  alertSettings: StudyAlertSettings;
}

export function DashboardView({ onNavigate, onStartFocusTimer, alertSettings }: DashboardViewProps) {
  const { profile, topicProgressMap, studySessions, simuladoAttempts, errorNotebook } = useAuth();

  const todayKey = formatDateKey(new Date());
  const dailyGoal = profile?.dailyGoalMinutes || CONCURSO_PROFILE.dailyGoalMinutes;
  const minutesToday = studySessions
    .filter((s) => s.dateKey === todayKey)
    .reduce((acc, s) => acc + s.durationMinutes, 0);

  const dailyPct = Math.min(100, Math.round((minutesToday / dailyGoal) * 100));
  const daysUntilExam = getDaysUntilExam(profile?.examDate || CONCURSO_PROFILE.examDate);

  const totalTopics = ALEPA_DISCIPLINES.reduce((acc, d) => acc + d.topics.length, 0);
  const completedTopics = Object.values(topicProgressMap).filter(
    (p) => p.theoryDone && p.questionsDone
  ).length;
  const syllabusPct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  const pendingErrors = errorNotebook.filter((e) => e.status === 'pending').length;
  const latestAttempt = simuladoAttempts[0];

  const dayIndex = Math.max(0, new Date().getDate() - 1);
  const todayPlan = generateDailyPlanForDate(new Date(), dayIndex);
  const currentBlock = todayPlan.blocks[0];

  const navigationCards: Array<{
    id: NavSection;
    title: string;
    subtitle: string;
    metric: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'disciplines',
      title: 'Matérias',
      subtitle: 'Conteúdo organizado pelo edital.',
      metric: `${completedTopics}/${totalTopics} tópicos · ${syllabusPct}%`,
      icon: BookOpen,
    },
    {
      id: 'schedule',
      title: 'Cronograma',
      subtitle: 'Plano diário de 2h e revisões.',
      metric: `${minutesToday}/${dailyGoal} min hoje`,
      icon: CalendarCheck,
    },
    {
      id: 'simulados',
      title: 'Questões',
      subtitle: 'Exercícios CETAP e simulados.',
      metric: latestAttempt ? `Último: ${latestAttempt.score.toFixed(1)}/10` : '50 questões · 10 pts',
      icon: ClipboardList,
    },
    {
      id: 'performance',
      title: 'Desempenho',
      subtitle: 'Acertos, erros e evolução.',
      metric: `${simuladoAttempts.length} simulados salvos`,
      icon: TrendingUp,
    },
    {
      id: 'materials',
      title: 'Materiais',
      subtitle: 'PDF, PowerPoint, Excel e Drive.',
      metric: 'Leitor integrado',
      icon: FileText,
    },
    {
      id: 'revisions',
      title: 'Caderno de Erros',
      subtitle: 'Banco de melhoria e revisão espaçada.',
      metric: `${pendingErrors} pendentes`,
      icon: RefreshCw,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Main Container Framing Matching Reference Layout */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 space-y-5">
        {/* Deep Forest Green Hero Banner */}
        <section className="bg-[#0B3321] text-white rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-emerald-300 tracking-wide">
                Preparação intensiva · {profile?.role === 'teacher' ? 'Área do Professor' : 'Área do Estudante'}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
                ALEPA 2026
              </h1>
              <p className="text-sm text-emerald-100/90">
                Fundação CETAP • Área legislativa · Cargo 03 – Técnico Legislativo ({CONCURSO_PROFILE.code})
              </p>
            </div>
            <GraduationCap className="w-7 h-7 text-emerald-200/90 shrink-0" />
          </div>

          <div className="mt-6 pt-5 border-t border-white/15 flex items-end justify-between gap-4">
            <div>
              <p className="font-display text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">
                13/12/2026
              </p>
              <p className="text-xs text-emerald-100/80 mt-1">Data prevista da prova objetiva</p>
            </div>

            <div className="text-right">
              <p className="font-display text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">
                {daysUntilExam}
              </p>
              <p className="text-xs text-emerald-100/80 mt-1">Dias até a prova</p>
            </div>
          </div>
        </section>

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
                  <h2 className="font-display text-lg font-bold text-slate-900">{card.title}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">{card.subtitle}</p>
                </div>
              </button>
            );
          })}
        </section>
      </div>

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
              <p className="text-xs font-semibold text-[#146C43]">Estudo de hoje</p>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
                Continuar de onde parei
              </h2>
              <p className="text-sm text-slate-600">
                Teoria · Questões · Correção · Revisão — Prioridade 1: <strong>{currentBlock.disciplineName}</strong>
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
            {todayPlan.blocks.map((block) => (
              <button
                key={block.order}
                type="button"
                onClick={() => onStartFocusTimer(block.disciplineId, block.topicTitle)}
                className="text-left p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                  <span>0{block.order}. {block.label.split(' ')[0]}</span>
                  <span>{block.durationMinutes}m</span>
                </div>
                <p className="text-xs font-semibold text-slate-900 truncate mt-1">{block.disciplineName}</p>
              </button>
            ))}
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
          <div>
            <button
              type="button"
              onClick={() => onNavigate('schedule')}
              className="text-xs font-semibold text-[#0B3321] hover:underline"
            >
              Configurar horário do alerta e ver cronograma completo até 13/12
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
