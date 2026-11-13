import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Flag,
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  Save,
  Volume2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  ALEPA_DISCIPLINES,
  CONCURSO_PROFILE,
  DailyPlan,
  OFFICIAL_ANEXO_III_MILESTONES,
  formatDateKey,
  generateCalendarUntilExam,
  getDisciplineShortName,
} from '../data/alepaSyllabus';
import { StudyAlertSettings, playStudyChime } from '../hooks/useStudyAlert';
import { BlockType } from '../types';

interface ScheduleViewProps {
  initialDisciplineId?: string;
  initialTopicTitle?: string;
  alertSettings: StudyAlertSettings;
  onUpdateAlertSettings: (patch: Partial<StudyAlertSettings>) => void;
  notificationPermission: NotificationPermission | 'unsupported';
  onRequestNotificationPermission: () => Promise<void>;
  onTestAlert: () => void;
}

interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  finished: boolean;
}

function computeCountdownToExam(): CountdownParts {
  // Prova Objetiva ALEPA 2026: 13/12/2026 (início das atividades / tarde conforme edital)
  const target = new Date(2026, 11, 13, 13, 0, 0).getTime();
  const diff = target - Date.now();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, finished: true };
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds, finished: false };
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_HEADERS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface MonthMatrix {
  key: string;
  label: string;
  year: number;
  month: number;
  cells: Array<{
    dateKey: string;
    dayOfMonth: number;
    plan?: DailyPlan;
    isBeforeStart: boolean;
    isAfterExam: boolean;
  } | null>;
}

function buildMonthsUntilExam(startDate: Date, planByDate: Record<string, DailyPlan>): MonthMatrix[] {
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth();
  const startMidnightKey = formatDateKey(startDate);
  const examYear = 2026;
  const examMonth = 11; // Dezembro (0-indexed)

  const months: MonthMatrix[] = [];
  let y = startYear;
  let m = startMonth;

  // Safety guard so loop always terminates cleanly
  while ((y < examYear || (y === examYear && m <= examMonth)) && months.length < 18) {
    const firstWeekday = new Date(y, m, 1).getDay();
    const totalDaysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: MonthMatrix['cells'] = [];

    for (let blank = 0; blank < firstWeekday; blank++) {
      cells.push(null);
    }

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dateObj = new Date(y, m, day);
      const dateKey = formatDateKey(dateObj);
      cells.push({
        dateKey,
        dayOfMonth: day,
        plan: planByDate[dateKey],
        isBeforeStart: dateKey < startMidnightKey,
        isAfterExam: dateKey > CONCURSO_PROFILE.examDate,
      });
    }

    months.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[m]} ${y}`,
      year: y,
      month: m,
      cells,
    });

    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }

  return months;
}

export function ScheduleView({
  initialDisciplineId,
  initialTopicTitle,
  alertSettings,
  onUpdateAlertSettings,
  notificationPermission,
  onRequestNotificationPermission,
  onTestAlert,
}: ScheduleViewProps) {
  const { studySessions, logStudySession, profile } = useAuth();

  const [selectedDiscipline, setSelectedDiscipline] = useState(
    initialDisciplineId || ALEPA_DISCIPLINES[0].id
  );
  const [topicTitle, setTopicTitle] = useState(
    initialTopicTitle || ALEPA_DISCIPLINES[0].topics[0].title
  );
  const [blockType, setBlockType] = useState<BlockType>('theory');
  const [manualMinutes, setManualMinutes] = useState(50);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [calendarTab, setCalendarTab] = useState<'calendar' | 'list' | 'official'>('calendar');
  const [officialFilter, setOfficialFilter] = useState<'all' | 'upcoming'>('upcoming');
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => formatDateKey(new Date()));
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(() => formatDateKey(new Date()));

  // Live countdown until 13/12/2026
  const [countdown, setCountdown] = useState<CountdownParts>(() => computeCountdownToExam());

  // Live study block countdown timer
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(50 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCountdown(computeCountdownToExam());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (initialDisciplineId) setSelectedDiscipline(initialDisciplineId);
    if (initialTopicTitle) setTopicTitle(initialTopicTitle);
  }, [initialDisciplineId, initialTopicTitle]);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => {
      setTimerSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          if (alertSettings.soundEnabled) playStudyChime();
          return 0;
        }
        return prev - 1;
      });
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning, alertSettings.soundEnabled]);

  const calendarDays = useMemo(() => generateCalendarUntilExam(new Date(), 365), []);
  const planByDate = useMemo(() => {
    const map: Record<string, DailyPlan> = {};
    calendarDays.forEach((p) => {
      map[p.dateKey] = p;
    });
    return map;
  }, [calendarDays]);

  const monthMatrices = useMemo(
    () => buildMonthsUntilExam(new Date(), planByDate),
    [planByDate]
  );

  const todayKey = formatDateKey(new Date());
  const dailyGoal = profile?.dailyGoalMinutes || CONCURSO_PROFILE.dailyGoalMinutes;

  const minutesByDate = useMemo(() => {
    const map: Record<string, number> = {};
    studySessions.forEach((s) => {
      map[s.dateKey] = (map[s.dateKey] || 0) + s.durationMinutes;
    });
    return map;
  }, [studySessions]);

  const completedPlanDays = useMemo(
    () => calendarDays.filter((d) => (minutesByDate[d.dateKey] || 0) >= dailyGoal).length,
    [calendarDays, minutesByDate, dailyGoal]
  );

  const selectedPlan = planByDate[selectedDateKey] || calendarDays[0];

  const filteredMilestones = useMemo(() => {
    if (officialFilter === 'all') return OFFICIAL_ANEXO_III_MILESTONES;
    return OFFICIAL_ANEXO_III_MILESTONES.filter((m) => (m.isoEnd || m.isoStart) >= todayKey);
  }, [officialFilter, todayKey]);

  const formatTimer = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleSaveSession = async (minutesToSave: number, targetDateKey = todayKey) => {
    setSaving(true);
    setFeedback(null);
    try {
      await logStudySession({
        dateKey: targetDateKey,
        disciplineId: selectedDiscipline,
        topicTitle: topicTitle.trim() || getDisciplineShortName(selectedDiscipline),
        blockType,
        durationMinutes: Math.max(1, minutesToSave),
        notes,
      });
      setTimerRunning(false);
      setElapsedSeconds(0);
      setNotes('');
      setFeedback(`Sessão de ${minutesToSave} min registrada em ${targetDateKey.split('-').reverse().join('/')}.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao salvar sessão.');
    } finally {
      setSaving(false);
    }
  };

  const priorityGroups = [
    { rank: '1º', label: 'Processo Legislativo e Técnica Legislativa', detail: 'Regimento ALEPA (Res. 02/2022) + LC 95/98' },
    { rank: '2º', label: 'Direito Administrativo', detail: 'Atos, Lei 14.133/21 e RJU Pará (Lei 5.810/94)' },
    { rank: '3º', label: 'Direito Constitucional e Proc. Constitucional', detail: 'Controle, Poder Legislativo e Remédios' },
    { rank: '4º', label: 'Legislação e Ética no Serviço Público', detail: 'LGPD, Improbidade e Const. do Pará' },
    { rank: '5º', label: 'Direito Financeiro', detail: 'PPA/LDO/LOA e LRF' },
    { rank: '6º', label: 'Português, Raciocínio Lógico e Informática', detail: 'Disciplinas básicas da prova objetiva' },
    { rank: '7º', label: 'Dir. Civil, Proc. Civil, Previdenciário e DH', detail: 'Revisão direcionada e questões' },
  ];

  const totalPlannedHours = calendarDays.length * 2;
  const completedHoursTotal = Object.values(minutesByDate).reduce((acc, m) => acc + m, 0) / 60;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-800">
            Contagem regressiva até 13/12/2026 · Plano diário de 2h · Dicas CETAP · Alerta
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Cronograma & Calendário até 13/12/2026
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-mono tabular-nums text-slate-700">
            Hoje: <strong>{minutesByDate[todayKey] || 0}</strong> / {dailyGoal} min
          </span>
          <a
            href={CONCURSO_PROFILE.anexoIIIPdfPath}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>Anexo III (PDF)</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
          </a>
        </div>
      </div>

      {/* Contagem Regressiva até a Prova (13/12/2026) */}
      <section className="bg-[#0B3321] text-white rounded-2xl p-6 sm:p-7">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-300 text-xs font-medium">
              <Flag className="w-4 h-4" />
              <span>Contagem regressiva oficial · Prova Objetiva Fundação CETAP</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Rumo a 13/12/2026 · Cargo 03 ({CONCURSO_PROFILE.code})
            </h2>
            <p className="text-xs sm:text-sm text-emerald-100/85 font-mono tabular-nums">
              {calendarDays.length} dias de calendário ativo · {completedPlanDays}/{calendarDays.length} dias com meta 2h concluída · {completedHoursTotal.toFixed(1)}h / {totalPlannedHours}h previstas
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3 sm:gap-4 shrink-0">
            {[
              { value: countdown.days, label: 'Dias' },
              { value: countdown.hours, label: 'Horas' },
              { value: countdown.minutes, label: 'Min' },
              { value: countdown.seconds, label: 'Seg' },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-white/10 border border-white/15 rounded-xl px-3.5 py-3 text-center min-w-[66px]"
              >
                <div className="font-mono text-2xl sm:text-3xl font-bold text-white tabular-nums leading-none">
                  {String(item.value).padStart(2, '0')}
                </div>
                <div className="text-[11px] text-emerald-200 mt-1.5">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Calendário Diário até 13/12/2026 + Detalhes do Dia Selecionado */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit overflow-x-auto">
            <button
              type="button"
              onClick={() => setCalendarTab('calendar')}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                calendarTab === 'calendar' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Calendário Diário (até 13/12)
            </button>
            <button
              type="button"
              onClick={() => setCalendarTab('list')}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                calendarTab === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lista Diária ({calendarDays.length} dias)
            </button>
            <button
              type="button"
              onClick={() => setCalendarTab('official')}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                calendarTab === 'official' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cronograma Oficial (Anexo III)
            </button>
          </div>

          {calendarTab === 'calendar' && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span>Clique em qualquer dia até 13/12 para abrir plano, dica e contagem</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => setSelectedDateKey(todayKey)}
                className="font-semibold text-[#0B3321] hover:underline whitespace-nowrap"
              >
                Ir para hoje ({todayKey.split('-').reverse().join('/')})
              </button>
            </div>
          )}

          {calendarTab === 'official' && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => setOfficialFilter('upcoming')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                  officialFilter === 'upcoming' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Próximas datas
              </button>
              <button
                type="button"
                onClick={() => setOfficialFilter('all')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                  officialFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Todas (39)
              </button>
            </div>
          )}
        </div>

        {calendarTab === 'calendar' && (
          <div className="space-y-6">
            {/* Monthly Visual Calendar Grid up to 13/12/2026 */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {monthMatrices.map((month) => (
                <div key={month.key} className="border border-slate-200 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-base font-bold text-slate-900">{month.label}</h3>
                    <span className="text-xs font-mono text-slate-500 tabular-nums">
                      {month.year === 2026 && month.month === 11
                        ? 'Prova dia 13/12'
                        : 'Ciclo ativo de 2h/dia'}
                    </span>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5 text-center mb-2">
                    {WEEKDAY_HEADERS.map((wd) => (
                      <div key={wd} className="text-[11px] font-semibold text-slate-500 py-1">
                        {wd}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    {month.cells.map((cell, idx) => {
                      if (!cell) {
                        return <div key={`empty-${month.key}-${idx}`} className="min-h-[68px]" />;
                      }

                      const { dateKey, dayOfMonth, plan, isBeforeStart, isAfterExam } = cell;
                      const isDisabled = isBeforeStart || isAfterExam || !plan;
                      const isSelected = selectedDateKey === dateKey;
                      const isToday = dateKey === todayKey;
                      const logged = minutesByDate[dateKey] || 0;
                      const isDone = logged >= dailyGoal;
                      const isExam = Boolean(plan?.isExamDay);

                      if (isDisabled) {
                        return (
                          <div
                            key={dateKey}
                            className="min-h-[68px] p-1.5 rounded-xl bg-slate-50/70 text-slate-300 flex flex-col justify-between text-left"
                          >
                            <span className="font-mono text-xs tabular-nums">{dayOfMonth}</span>
                            <span className="text-[10px]">
                              {isAfterExam ? 'Pós' : '—'}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={dateKey}
                          type="button"
                          onClick={() => setSelectedDateKey(dateKey)}
                          className={`min-h-[68px] p-1.5 rounded-xl border text-left transition-colors flex flex-col justify-between ${
                            isSelected
                              ? 'border-[#0B3321] bg-[#0B3321] text-white'
                              : isExam
                                ? 'border-emerald-700 bg-emerald-50 text-slate-900 hover:bg-emerald-100/70'
                                : isToday
                                  ? 'border-emerald-600 bg-emerald-50/40 text-slate-900 hover:bg-slate-50'
                                  : 'border-slate-200 bg-white text-slate-900 hover:border-slate-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 w-full">
                            <span className="font-mono text-xs font-bold tabular-nums">{dayOfMonth}</span>
                            <span
                              className={`font-mono text-[10px] tabular-nums ${
                                isSelected
                                  ? 'text-emerald-200'
                                  : isExam
                                    ? 'text-[#0B3321] font-bold'
                                    : 'text-slate-500'
                              }`}
                            >
                              {isExam ? 'PROVA' : `D-${plan.daysRemaining}`}
                            </span>
                          </div>

                          <div className="space-y-0.5 w-full">
                            <p
                              className={`text-[10px] font-medium truncate ${
                                isSelected ? 'text-white' : 'text-slate-700'
                              }`}
                            >
                              {isExam ? 'Prova Objetiva' : plan.blocks[0].disciplineName}
                            </p>
                            <div className="flex items-center justify-between gap-1">
                              <span
                                className={`font-mono text-[10px] tabular-nums ${
                                  isSelected
                                    ? 'text-emerald-200'
                                    : isDone
                                      ? 'text-emerald-700 font-semibold'
                                      : 'text-slate-400'
                                }`}
                              >
                                {isDone ? '2h OK' : logged > 0 ? `${logged}m` : plan.officialMilestone ? 'Edital' : '2h'}
                              </span>
                              {isDone && (
                                <CheckCircle2
                                  className={`w-3 h-3 shrink-0 ${isSelected ? 'text-emerald-300' : 'text-emerald-700'}`}
                                />
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Selected Day Inspector */}
            {selectedPlan && (
              <div className="border-t border-slate-200 pt-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                      <span className="font-semibold text-[#0B3321]">
                        {selectedPlan.dateKey.split('-').reverse().join('/')}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {selectedPlan.isExamDay
                          ? 'Dia da Prova Objetiva'
                          : selectedPlan.daysRemaining === 1
                            ? 'Falta 1 dia para a prova'
                            : `Faltam ${selectedPlan.daysRemaining} dias para a prova`}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-sans">Dia {selectedPlan.dayNumber} · {selectedPlan.phaseName}</span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-slate-900 mt-1">
                      {selectedPlan.isExamDay
                        ? 'Execução da Prova Objetiva · Cargo 03'
                        : `${selectedPlan.blocks[0].disciplineName}: ${selectedPlan.blocks[0].topicTitle}`}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="font-mono text-xs text-slate-600 tabular-nums mr-2">
                      Registrado: <strong>{minutesByDate[selectedPlan.dateKey] || 0}</strong> / {dailyGoal} min
                    </span>
                    {!selectedPlan.isExamDay && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDiscipline(selectedPlan.blocks[0].disciplineId);
                          setTopicTitle(selectedPlan.blocks[0].topicTitle);
                          setBlockType(selectedPlan.blocks[0].blockType);
                        }}
                        className="min-h-[40px] px-4 py-2 bg-[#0B3321] hover:bg-[#134b32] text-white text-xs font-semibold rounded-xl whitespace-nowrap"
                      >
                        Carregar no cronômetro
                      </button>
                    )}
                  </div>
                </div>

                {selectedPlan.officialMilestone && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
                    <CalendarDays className="w-4 h-4 text-[#0B3321] shrink-0 mt-0.5" />
                    <span>
                      <strong>Marco oficial Anexo III ({selectedPlan.officialMilestone.dateLabel}):</strong>{' '}
                      {selectedPlan.officialMilestone.description}.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {selectedPlan.blocks.map((b) => (
                    <div key={b.order} className="p-3.5 rounded-xl bg-slate-50 text-xs space-y-1">
                      <div className="flex items-center justify-between font-mono text-slate-500 tabular-nums">
                        <span>0{b.order}. {b.label}</span>
                        <span>{b.durationMinutes} min</span>
                      </div>
                      <p className="font-semibold text-slate-900">{b.disciplineName}</p>
                      <p className="text-slate-600">{b.topicTitle}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200/80 space-y-1.5 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-[#0B3321]">
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span>Dica estratégica CETAP</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">{selectedPlan.studyTip}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                      <Bell className="w-3.5 h-3.5 text-amber-700" />
                      <span>Alerta do dia</span>
                    </div>
                    <p className="text-amber-950 leading-relaxed">{selectedPlan.alertFocus}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {calendarTab === 'list' && (
          <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto pr-1">
            {calendarDays.map((day) => {
              const logged = minutesByDate[day.dateKey] || 0;
              const isDone = logged >= dailyGoal;
              const isToday = day.dateKey === todayKey;
              const isExpanded = expandedDayKey === day.dateKey;

              return (
                <div
                  key={day.dateKey}
                  className={`py-3.5 ${day.isExamDay ? 'bg-emerald-50/70 -mx-2 px-2 rounded-xl' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedDayKey(isExpanded ? null : day.dateKey)}
                    className="w-full text-left flex items-center justify-between gap-4 min-h-[44px]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                        <span className="font-semibold text-slate-800">
                          {day.dateKey.split('-').reverse().join('/')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{day.isExamDay ? 'PROVA' : `D-${day.daysRemaining}`}</span>
                        <span aria-hidden="true">·</span>
                        <span>{isToday ? 'Hoje' : day.isExamDay ? 'Dia da Prova' : `Dia ${day.dayNumber}`}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans">{day.phaseName}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                        {day.blocks[0].disciplineName}: {day.blocks[0].topicTitle}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="font-mono text-xs tabular-nums text-slate-600">{logged}/120 min</span>
                      {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-700" />}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {day.blocks.map((b) => (
                          <div key={b.order} className="p-3 rounded-xl bg-slate-50 text-xs">
                            <div className="flex items-center justify-between font-mono text-slate-500 tabular-nums">
                              <span>
                                0{b.order}. {b.label}
                              </span>
                              <span>{b.durationMinutes} min</span>
                            </div>
                            <p className="font-semibold text-slate-900 mt-1">{b.disciplineName}</p>
                            <p className="text-slate-600 mt-0.5">{b.topicTitle}</p>
                          </div>
                        ))}
                      </div>

                      <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 space-y-1.5 text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-[#0B3321]">
                          <Lightbulb className="w-3.5 h-3.5" />
                          <span>Dica estratégica CETAP</span>
                        </div>
                        <p className="text-slate-700 leading-relaxed">{day.studyTip}</p>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                        <div className="flex items-start gap-2 text-amber-950">
                          <Bell className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                          <span>
                            <strong>Alerta do dia:</strong> {day.alertFocus}
                          </span>
                        </div>

                        {!day.isExamDay && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDiscipline(day.blocks[0].disciplineId);
                              setTopicTitle(day.blocks[0].topicTitle);
                              setBlockType(day.blocks[0].blockType);
                            }}
                            className="px-3 py-1.5 bg-[#0B3321] text-white font-semibold rounded-lg whitespace-nowrap shrink-0"
                          >
                            Carregar no cronômetro
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {calendarTab === 'official' && (
          <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto pr-1">
            {filteredMilestones.map((m) => {
              const isTodayMilestone =
                m.isoStart === todayKey || (m.isoEnd && todayKey >= m.isoStart && todayKey <= m.isoEnd);
              const isExamDay = m.item === '15';
              return (
                <div
                  key={m.item}
                  className={`py-3 flex items-start justify-between gap-4 ${
                    isExamDay ? 'bg-emerald-50/70 -mx-2 px-2 rounded-xl' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="font-mono text-xs font-semibold text-[#0B3321] w-6 shrink-0 pt-0.5 tabular-nums">
                      {m.item}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{m.description}</p>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                        {m.dateLabel}
                        {isTodayMilestone && ' · Etapa de hoje'}
                        {isExamDay && ' · Dia da Prova Objetiva'}
                      </p>
                    </div>
                  </div>

                  <CalendarDays
                    className={`w-4 h-4 shrink-0 mt-1 ${isExamDay ? 'text-[#0B3321]' : 'text-slate-400'}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Alerta Diário de Estudos Configuration */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-3">
            {alertSettings.enabled ? (
              <Bell className="w-5 h-5 text-[#146C43] shrink-0 mt-0.5" />
            ) : (
              <BellOff className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            )}
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Alerta Diário de Estudos</h2>
              <p className="text-sm text-slate-600">
                Receba aviso visual, sinal sonoro e notificação no aparelho caso ainda não tenha concluído suas 2h do
                dia no horário programado.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 min-h-[40px] px-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={alertSettings.enabled}
                onChange={(e) => onUpdateAlertSettings({ enabled: e.target.checked })}
              />
              <span>Alerta ativo</span>
            </label>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 min-h-[40px] px-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span>Horário:</span>
              <input
                type="time"
                aria-label="Horário do alerta diário de estudos"
                value={alertSettings.reminderTime}
                onChange={(e) => onUpdateAlertSettings({ reminderTime: e.target.value })}
                className="font-mono text-xs bg-transparent focus:outline-none"
              />
            </label>

            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 min-h-[40px] px-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={alertSettings.soundEnabled}
                onChange={(e) => onUpdateAlertSettings({ soundEnabled: e.target.checked })}
              />
              <Volume2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Som</span>
            </label>

            {notificationPermission === 'default' && (
              <button
                type="button"
                onClick={onRequestNotificationPermission}
                className="min-h-[40px] px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-xl whitespace-nowrap"
              >
                Permitir notificações
              </button>
            )}

            <button
              type="button"
              onClick={onTestAlert}
              className="min-h-[40px] px-4 py-1.5 bg-[#0B3321] hover:bg-[#134b32] text-white text-xs font-semibold rounded-xl whitespace-nowrap"
            >
              Testar alerta
            </button>
          </div>
        </div>
      </section>

      {/* Active Timer + Manual Log + Priority Order */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Clock className="w-5 h-5 text-[#0B3321]" />
              <h2 className="font-display text-xl font-bold text-slate-900">Sessão Cronometrada</h2>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {[25, 40, 50].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setTimerRunning(false);
                    setTimerSecondsLeft(preset * 60);
                    setElapsedSeconds(0);
                    setManualMinutes(preset);
                  }}
                  className="px-2.5 py-1 text-xs font-mono font-medium rounded-md hover:bg-white text-slate-700"
                >
                  {preset}m
                </button>
              ))}
            </div>
          </div>

          <div className="my-7 text-center">
            <div className="font-mono text-5xl font-bold tracking-tight text-[#0B3321] tabular-nums">
              {formatTimer(timerSecondsLeft)}
            </div>
            <p className="text-sm text-slate-600 mt-3">
              {getDisciplineShortName(selectedDiscipline)} · {topicTitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => setTimerRunning((r) => !r)}
              className="min-h-[44px] px-4 py-2.5 bg-[#0B3321] hover:bg-[#134b32] text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{timerRunning ? 'Pausar' : 'Iniciar'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTimerRunning(false);
                setTimerSecondsLeft(manualMinutes * 60);
                setElapsedSeconds(0);
              }}
              className="min-h-[44px] px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Zerar</span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveSession(Math.max(1, Math.round(elapsedSeconds / 60) || manualMinutes))}
              className="min-h-[44px] px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>
                Registrar {elapsedSeconds >= 60 ? `${Math.round(elapsedSeconds / 60)}m` : `${manualMinutes}m`}
              </span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 space-y-3.5">
          <h2 className="font-display text-lg font-bold text-slate-900">Configurar bloco de estudo</h2>

          <div>
            <label htmlFor="sch-disc" className="block text-xs font-medium text-slate-600 mb-1">
              Disciplina (por prioridade)
            </label>
            <select
              id="sch-disc"
              value={selectedDiscipline}
              onChange={(e) => {
                const disc = ALEPA_DISCIPLINES.find((d) => d.id === e.target.value);
                setSelectedDiscipline(e.target.value);
                if (disc?.topics[0]) setTopicTitle(disc.topics[0].title);
              }}
              className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
            >
              {ALEPA_DISCIPLINES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.priorityRank}º · {d.shortName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sch-topic" className="block text-xs font-medium text-slate-600 mb-1">
              Assunto / Tópico
            </label>
            <input
              id="sch-topic"
              type="text"
              value={topicTitle}
              onChange={(e) => setTopicTitle(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sch-type" className="block text-xs font-medium text-slate-600 mb-1">
                Etapa
              </label>
              <select
                id="sch-type"
                value={blockType}
                onChange={(e) => setBlockType(e.target.value as BlockType)}
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
              >
                <option value="theory">Teoria / Lei Seca</option>
                <option value="questions">Questões CETAP</option>
                <option value="correction">Correção</option>
                <option value="revision">Revisão</option>
              </select>
            </div>

            <div>
              <label htmlFor="sch-mins" className="block text-xs font-medium text-slate-600 mb-1">
                Duração (min)
              </label>
              <input
                id="sch-mins"
                type="number"
                min={5}
                max={240}
                value={manualMinutes}
                onChange={(e) => setManualMinutes(Number(e.target.value) || 30)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label htmlFor="sch-notes" className="block text-xs font-medium text-slate-600 mb-1">
              Resumo da sessão
            </label>
            <textarea
              id="sch-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: Artigos revisados do Regimento Interno (Res. 02/2022)..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl resize-none"
            />
          </div>

          {feedback && (
            <p className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {feedback}
            </p>
          )}
        </div>

        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="font-display text-base font-bold text-slate-900 mb-3">Prioridade (Cargo 03)</h2>
          <div className="divide-y divide-slate-100">
            {priorityGroups.map((item) => (
              <div key={item.label} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-2.5">
                <span className="font-mono text-xs font-semibold text-[#0B3321] w-6 shrink-0 pt-0.5 tabular-nums">
                  {item.rank}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 leading-snug">{item.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
