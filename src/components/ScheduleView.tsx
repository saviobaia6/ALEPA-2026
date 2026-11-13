import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  BellOff,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  ExternalLink,
  Flag,
  Lightbulb,
  Mail,
  MessageCircle,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Smartphone,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getMedioDisciplines } from '../data/alepaMedioSyllabus';
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
import {
  CalendarStudyEvent,
  createOrUpdateCalendarStudyAlert,
  deleteCalendarStudyEvent,
  listAlepaStudyCalendarEvents,
  sendStudyAlertViaGmail,
} from '../lib/googleWorkspace';
import { BlockType, CampusLevel } from '../types';

interface ScheduleViewProps {
  campus: CampusLevel;
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
  campus,
  initialDisciplineId,
  initialTopicTitle,
  alertSettings,
  onUpdateAlertSettings,
  notificationPermission,
  onRequestNotificationPermission,
  onTestAlert,
}: ScheduleViewProps) {
  const {
    studySessions,
    logStudySession,
    profile,
    user,
    workspaceAccessToken,
    connectGoogleWorkspace,
    clearWorkspaceToken,
  } = useAuth();

  const isMedio = campus === 'medio';
  const activeDisciplines = isMedio ? getMedioDisciplines('cargo_01_04') : ALEPA_DISCIPLINES;

  const [selectedDiscipline, setSelectedDiscipline] = useState(
    initialDisciplineId || activeDisciplines[0].id
  );
  const [topicTitle, setTopicTitle] = useState(
    initialTopicTitle || activeDisciplines[0].topics[0].title
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

  // Google Calendar & Gmail alerts state
  const [calendarEvents, setCalendarEvents] = useState<CalendarStudyEvent[]>([]);
  const [loadingCalendarEvents, setLoadingCalendarEvents] = useState(false);
  const [calendarRecurrence, setCalendarRecurrence] = useState<'daily' | 'single'>('daily');
  const [calendarDuration, setCalendarDuration] = useState<number>(120);
  const [popupMinutesBefore, setPopupMinutesBefore] = useState<number>(10);
  const [emailMinutesBefore, setEmailMinutesBefore] = useState<number | null>(30);
  const [gmailContentMode, setGmailContentMode] = useState<'today' | 'selected'>('today');
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceFeedback, setWorkspaceFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    htmlLink?: string;
  } | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<
    | {
        kind: 'create_calendar' | 'update_calendar';
        existingEventId?: string;
        title: string;
        description: string;
        dateKey: string;
        timeHHMM: string;
        durationMinutes: number;
        recurrenceDailyUntilExam: boolean;
        popupMinutesBefore: number;
        emailMinutesBefore: number | null;
      }
    | {
        kind: 'delete_calendar';
        eventId: string;
        title: string;
      }
    | {
        kind: 'send_gmail';
        toEmail: string;
        subject: string;
        bodyText: string;
      }
    | null
  >(null);

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
    if (!activeDisciplines.some((d) => d.id === selectedDiscipline)) {
      setSelectedDiscipline(activeDisciplines[0].id);
      if (activeDisciplines[0]?.topics[0]) {
        setTopicTitle(activeDisciplines[0].topics[0].title);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus]);

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

  const loadCalendarEvents = React.useCallback(
    async (tokenOverride?: string) => {
      const token = tokenOverride || workspaceAccessToken;
      if (!token) return;
      setLoadingCalendarEvents(true);
      try {
        const events = await listAlepaStudyCalendarEvents(token);
        setCalendarEvents(events);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'AUTH_EXPIRED') {
          clearWorkspaceToken();
          setCalendarEvents([]);
          setWorkspaceFeedback({
            type: 'error',
            message: 'Sua sessão Google expirou. Conecte novamente para sincronizar o Google Calendar e Gmail.',
          });
        }
      } finally {
        setLoadingCalendarEvents(false);
      }
    },
    [workspaceAccessToken, clearWorkspaceToken]
  );

  useEffect(() => {
    if (workspaceAccessToken) {
      void loadCalendarEvents(workspaceAccessToken);
    } else {
      setCalendarEvents([]);
    }
  }, [workspaceAccessToken, loadCalendarEvents]);

  const handleConnectGoogleAlerts = async (): Promise<string | null> => {
    setWorkspaceFeedback(null);
    setWorkspaceBusy(true);
    try {
      const token = await connectGoogleWorkspace();
      if (token) {
        await loadCalendarEvents(token);
        setWorkspaceFeedback({
          type: 'success',
          message: 'Google Calendar e Gmail conectados! Agora você pode agendar alertas ou enviar e-mails.',
        });
      }
      return token;
    } catch (err) {
      setWorkspaceFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível conectar ao Google Calendar e Gmail.',
      });
      return null;
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleExecuteConfirmedAction = async () => {
    if (!pendingConfirmation) return;
    const action = pendingConfirmation;
    setWorkspaceBusy(true);
    setWorkspaceFeedback(null);

    try {
      const token = workspaceAccessToken || (await connectGoogleWorkspace());
      if (!token) {
        throw new Error('Conecte sua conta Google para concluir esta ação.');
      }

      if (action.kind === 'create_calendar' || action.kind === 'update_calendar') {
        const saved = await createOrUpdateCalendarStudyAlert(token, {
          existingEventId: action.existingEventId,
          title: action.title,
          description: action.description,
          dateKey: action.dateKey,
          timeHHMM: action.timeHHMM,
          durationMinutes: action.durationMinutes,
          recurrenceDailyUntilExam: action.recurrenceDailyUntilExam,
          popupMinutesBefore: action.popupMinutesBefore,
          emailMinutesBefore: action.emailMinutesBefore,
        });
        await loadCalendarEvents(token);
        setPendingConfirmation(null);
        setWorkspaceFeedback({
          type: 'success',
          message:
            action.kind === 'update_calendar'
              ? `Evento atualizado no Google Calendar (${action.timeHHMM}).`
              : `Alerta criado no Google Calendar para ${action.timeHHMM} (${
                  action.recurrenceDailyUntilExam ? 'diário até 13/12/2026' : action.dateKey.split('-').reverse().join('/')
                }).`,
          htmlLink: saved.htmlLink,
        });
      } else if (action.kind === 'delete_calendar') {
        await deleteCalendarStudyEvent(token, action.eventId);
        await loadCalendarEvents(token);
        setPendingConfirmation(null);
        setWorkspaceFeedback({
          type: 'success',
          message: `Evento "${action.title}" removido do seu Google Calendar.`,
        });
      } else if (action.kind === 'send_gmail') {
        await sendStudyAlertViaGmail(token, {
          toEmail: action.toEmail,
          subject: action.subject,
          bodyText: action.bodyText,
        });
        setPendingConfirmation(null);
        setWorkspaceFeedback({
          type: 'success',
          message: `Alerta de estudos enviado pelo Gmail para ${action.toEmail}.`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha na integração com Google Workspace.';
      if (msg === 'AUTH_EXPIRED') {
        clearWorkspaceToken();
        setPendingConfirmation(null);
        setWorkspaceFeedback({
          type: 'error',
          message: 'Autorização Google expirada. Clique em "Conectar Google Calendar e Gmail" e tente novamente.',
        });
      } else {
        setPendingConfirmation(null);
        setWorkspaceFeedback({
          type: 'error',
          message: msg,
        });
      }
    } finally {
      setWorkspaceBusy(false);
    }
  };

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

  const priorityGroups = isMedio
    ? [
        { rank: '1º', label: 'Língua Portuguesa', detail: 'Interpretação, gramática e redação oficial' },
        { rank: '2º', label: 'Legislação e Ética', detail: 'LGPD, ética, improbidade e legislação ALEPA' },
        { rank: '3º', label: 'Dir. Constitucional & Administrativo', detail: 'CF/88, RJU (Lei 5.810/94) e Lei 14.133/21' },
        { rank: '4º', label: 'Técnica Legislativa', detail: 'LC 95/98, pareceres, requerimentos e moções' },
        { rank: '5º', label: 'Adm. Pública & Secretaria', detail: 'Processos, contratos, planilhas e atendimento' },
        { rank: '6º', label: 'Arquivologia & Rec. Materiais', detail: 'Protocolo, temporalidade, estoques e patrimônio' },
        { rank: '7º', label: 'Informática & Raciocínio Lógico', detail: 'Office/LibreOffice, segurança e matemática lógica' },
      ]
    : [
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
              Rumo a 13/12/2026 ·{' '}
              {isMedio ? 'Cargo 04 – Nível Médio (PL.AL.060)' : `Cargo 03 – Nível Superior (${CONCURSO_PROFILE.code})`}
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

      {/* Alerta Diário de Estudos + Canais no Celular, E-mail e WhatsApp */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
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

        {/* Canais externos: Google Calendar, Gmail, Celular (.ics / Push) e WhatsApp */}
        {(() => {
          const todayPlan = planByDate[todayKey] || calendarDays[0];
          const targetPlan =
            gmailContentMode === 'selected' && selectedPlan ? selectedPlan : todayPlan;
          const remainingToday = Math.max(0, dailyGoal - (minutesByDate[todayKey] || 0));
          const cargoTag = isMedio
            ? 'Nível Médio · Cargo 04 (PL.AL.060)'
            : 'Nível Superior · Cargo 03 (PL.AL.102)';

          const plainMessage = [
            `Concurso ALEPA 2026 (${cargoTag} · Fundação CETAP)`,
            `Contagem: D-${targetPlan?.daysRemaining ?? countdown.days} para a prova em 13/12/2026`,
            `Progresso de hoje: ${minutesByDate[todayKey] || 0}/${dailyGoal} min (faltam ${remainingToday} min)`,
            targetPlan
              ? `Plano (${targetPlan.dateKey.split('-').reverse().join('/')} · ${targetPlan.phaseName}): ${targetPlan.blocks
                  .map((b) => `${b.disciplineName} - ${b.topicTitle} (${b.durationMinutes}m)`)
                  .join(' | ')}`
              : '',
            targetPlan ? `Dica CETAP: ${targetPlan.studyTip}` : '',
            targetPlan ? `Alerta do dia: ${targetPlan.alertFocus}` : '',
          ]
            .filter(Boolean)
            .join('\n');

          const waDigits = (alertSettings.whatsappNumber || '').replace(/\D/g, '');
          const waNormalized =
            waDigits.length >= 10 && !waDigits.startsWith('55') ? `55${waDigits}` : waDigits;
          const waHref = waNormalized
            ? `https://wa.me/${waNormalized}?text=${encodeURIComponent(plainMessage)}`
            : `https://wa.me/?text=${encodeURIComponent(plainMessage)}`;

          const targetEmail = (alertSettings.reminderEmail || user?.email || '').trim();
          const mailSubject = `Alerta de Estudos Concurso ALEPA 2026 (D-${targetPlan?.daysRemaining ?? countdown.days})`;
          const mailtoHref = `mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(
            mailSubject
          )}&body=${encodeURIComponent(plainMessage)}`;

          const calendarDateKey =
            calendarRecurrence === 'single' && selectedPlan ? selectedPlan.dateKey : todayKey;
          const calendarTitle = isMedio
            ? 'Estudo ALEPA 2026 (Cargo 04 · Nível Médio) - Meta 2h'
            : 'Estudo ALEPA 2026 (Cargo 03 · Nível Superior) - Meta 2h';
          const calendarDescription = [
            `Concurso ALEPA 2026 (${cargoTag}) · Banca Fundação CETAP`,
            `Ciclo diário de estudos até 13/12/2026.`,
            targetPlan
              ? `Disciplinas sugeridas: ${targetPlan.blocks.map((b) => `${b.disciplineName} (${b.durationMinutes}m)`).join(', ')}.`
              : '',
            targetPlan ? `Dica CETAP: ${targetPlan.studyTip}` : '',
          ]
            .filter(Boolean)
            .join('\n');

          const handleDownloadIcs = () => {
            const [hh, mm] = (alertSettings.reminderTime || '19:00').split(':');
            const ymd = todayKey.replace(/-/g, '');
            const icsContent = [
              'BEGIN:VCALENDAR',
              'VERSION:2.0',
              'PRODID:-//Concurso ALEPA 2026//Cronograma 2026//PT-BR',
              'CALSCALE:GREGORIAN',
              'BEGIN:VEVENT',
              `UID:alepa-2026-estudo-diario-${campus}@meucampus`,
              `DTSTAMP:${ymd}T${hh}${mm}00`,
              `DTSTART:${ymd}T${hh}${mm}00`,
              'DURATION:PT2H',
              'RRULE:FREQ=DAILY;UNTIL=20261213T235959Z',
              `SUMMARY:${calendarTitle}`,
              `DESCRIPTION:Ciclo diario de 2 horas ALEPA 2026 (Fundacao CETAP) ate 13/12/2026.`,
              'BEGIN:VALARM',
              'TRIGGER:-PT10M',
              'ACTION:DISPLAY',
              'DESCRIPTION:Faltam 10 min para o seu bloco diario ALEPA 2026!',
              'END:VALARM',
              'END:VEVENT',
              'END:VCALENDAR',
            ].join('\r\n');

            const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = 'alarme-estudos-alepa-2026.ics';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(downloadUrl);
          };

          const primaryExistingEvent = calendarEvents[0];

          return (
            <div className="pt-4 border-t border-slate-100 space-y-5">
              {/* Status de Conexão Google Calendar & Gmail */}
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0B3321]">
                    <CalendarPlus className="w-4 h-4" />
                    <span>Integração Direta: Google Calendar & Gmail</span>
                  </div>
                  <p className="text-xs text-slate-700">
                    {workspaceAccessToken
                      ? 'Conta Google conectada. Crie lembretes automáticos no Google Calendar (notificação no celular e PC) ou envie resumos pelo Gmail.'
                      : 'Conecte sua conta Google para criar alarmes direto no Google Calendar e enviar alertas pelo Gmail (funciona no celular e no PC).'}
                  </p>
                </div>

                {!workspaceAccessToken ? (
                  <button
                    type="button"
                    disabled={workspaceBusy}
                    onClick={() => void handleConnectGoogleAlerts()}
                    className="min-h-[42px] px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-2.5 shadow-2xs whitespace-nowrap shrink-0"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                    <span>{workspaceBusy ? 'Conectando...' : 'Conectar Google Calendar e Gmail'}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      Google conectado
                    </span>
                    <button
                      type="button"
                      disabled={loadingCalendarEvents}
                      onClick={() => void loadCalendarEvents()}
                      className="min-h-[36px] px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingCalendarEvents ? 'animate-spin' : ''}`} />
                      <span>Atualizar</span>
                    </button>
                  </div>
                )}
              </div>

              {workspaceFeedback && (
                <div
                  role="status"
                  className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    workspaceFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {workspaceFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                    )}
                    <span>{workspaceFeedback.message}</span>
                  </div>
                  {workspaceFeedback.htmlLink && (
                    <a
                      href={workspaceFeedback.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[#0B3321] hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <span>Abrir no Google Calendar</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 1. Google Calendar Direto + Fallback .ics */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3.5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <CalendarDays className="w-4 h-4 text-[#0B3321]" />
                        <span>Alerta no Google Calendar</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">
                        {alertSettings.reminderTime}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="gcal-freq" className="block text-[11px] font-medium text-slate-600 mb-1">
                          Frequência
                        </label>
                        <select
                          id="gcal-freq"
                          value={calendarRecurrence}
                          onChange={(e) => setCalendarRecurrence(e.target.value as 'daily' | 'single')}
                          className="w-full min-h-[36px] px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                        >
                          <option value="daily">Diário até 13/12/2026</option>
                          <option value="single">
                            Só {selectedDateKey.split('-').reverse().join('/')}
                          </option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="gcal-dur" className="block text-[11px] font-medium text-slate-600 mb-1">
                          Duração
                        </label>
                        <select
                          id="gcal-dur"
                          value={calendarDuration}
                          onChange={(e) => setCalendarDuration(Number(e.target.value))}
                          className="w-full min-h-[36px] px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                        >
                          <option value={120}>2 horas (120m)</option>
                          <option value={60}>1 hora (60m)</option>
                          <option value={50}>50 minutos</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="gcal-pop" className="block text-[11px] font-medium text-slate-600 mb-1">
                          Push celular/PC
                        </label>
                        <select
                          id="gcal-pop"
                          value={popupMinutesBefore}
                          onChange={(e) => setPopupMinutesBefore(Number(e.target.value))}
                          className="w-full min-h-[36px] px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                        >
                          <option value={0}>Na hora</option>
                          <option value={10}>10 min antes</option>
                          <option value={30}>30 min antes</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="gcal-mail" className="block text-[11px] font-medium text-slate-600 mb-1">
                          E-mail do Calendar
                        </label>
                        <select
                          id="gcal-mail"
                          value={emailMinutesBefore === null ? 'off' : String(emailMinutesBefore)}
                          onChange={(e) =>
                            setEmailMinutesBefore(e.target.value === 'off' ? null : Number(e.target.value))
                          }
                          className="w-full min-h-[36px] px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                        >
                          <option value="30">30 min antes</option>
                          <option value="60">1 hora antes</option>
                          <option value="off">Desativado</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={workspaceBusy}
                      onClick={() => {
                        if (!workspaceAccessToken) {
                          void handleConnectGoogleAlerts();
                          return;
                        }
                        setPendingConfirmation({
                          kind: primaryExistingEvent ? 'update_calendar' : 'create_calendar',
                          existingEventId: primaryExistingEvent?.id,
                          title: calendarTitle,
                          description: calendarDescription,
                          dateKey: calendarDateKey,
                          timeHHMM: alertSettings.reminderTime || '19:00',
                          durationMinutes: calendarDuration,
                          recurrenceDailyUntilExam: calendarRecurrence === 'daily',
                          popupMinutesBefore,
                          emailMinutesBefore,
                        });
                      }}
                      className="w-full min-h-[40px] px-3.5 py-2 bg-[#0B3321] hover:bg-[#134b32] disabled:opacity-60 text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-2"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      <span>
                        {workspaceAccessToken
                          ? primaryExistingEvent
                            ? 'Atualizar alerta no Google Calendar'
                            : 'Criar alerta no Google Calendar'
                          : 'Conectar e criar no Calendar'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadIcs}
                      className="w-full min-h-[34px] px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-medium rounded-lg inline-flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3 h-3" />
                      <span>Ou baixar arquivo .ics offline</span>
                    </button>
                  </div>
                </div>

                {/* 2. Envio direto de Alerta por Gmail (+ fallback mailto) */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3.5">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <Mail className="w-4 h-4 text-[#0B3321]" />
                      <span>Alerta por E-mail (Gmail)</span>
                    </div>

                    <div>
                      <label htmlFor="gmail-to" className="block text-[11px] font-medium text-slate-600 mb-1">
                        E-mail de destino
                      </label>
                      <input
                        id="gmail-to"
                        type="email"
                        value={alertSettings.reminderEmail || user?.email || ''}
                        onChange={(e) => onUpdateAlertSettings({ reminderEmail: e.target.value })}
                        placeholder="seuemail@exemplo.com"
                        className="w-full min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>

                    <div>
                      <label htmlFor="gmail-mode" className="block text-[11px] font-medium text-slate-600 mb-1">
                        Conteúdo do alerta
                      </label>
                      <select
                        id="gmail-mode"
                        value={gmailContentMode}
                        onChange={(e) => setGmailContentMode(e.target.value as 'today' | 'selected')}
                        className="w-full min-h-[36px] px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="today">Plano de hoje + Dica CETAP</option>
                        <option value="selected">
                          Dia selecionado ({selectedDateKey.split('-').reverse().join('/')})
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={workspaceBusy}
                      onClick={() => {
                        if (!workspaceAccessToken) {
                          void handleConnectGoogleAlerts();
                          return;
                        }
                        setPendingConfirmation({
                          kind: 'send_gmail',
                          toEmail: targetEmail,
                          subject: mailSubject,
                          bodyText: plainMessage,
                        });
                      }}
                      className="w-full min-h-[40px] px-3.5 py-2 bg-[#0B3321] hover:bg-[#134b32] disabled:opacity-60 text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-2"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {workspaceAccessToken ? 'Enviar alerta agora via Gmail' : 'Conectar e enviar via Gmail'}
                      </span>
                    </button>

                    <a
                      href={mailtoHref}
                      className="w-full min-h-[34px] px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-medium rounded-lg inline-flex items-center justify-center gap-1.5"
                    >
                      <Mail className="w-3 h-3" />
                      <span>Abrir no app de e-mail padrão</span>
                    </a>
                  </div>
                </div>

                {/* 3. Lembrete rápido no WhatsApp */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3.5">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <MessageCircle className="w-4 h-4 text-[#146C43]" />
                      <span>Lembrete no WhatsApp</span>
                    </div>
                    <div>
                      <label htmlFor="wa-num" className="block text-[11px] font-medium text-slate-600 mb-1">
                        Número com DDD
                      </label>
                      <input
                        id="wa-num"
                        type="tel"
                        value={alertSettings.whatsappNumber}
                        onChange={(e) => onUpdateAlertSettings({ whatsappNumber: e.target.value })}
                        placeholder="Ex.: 91999999999"
                        className="w-full min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Envia o resumo do plano de hoje e a dica CETAP para o seu WhatsApp no celular ou PC.
                    </p>
                  </div>

                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] px-3.5 py-2 bg-[#146C43] hover:bg-[#0B3321] text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Enviar plano no WhatsApp</span>
                  </a>
                </div>
              </div>

              {/* Lista de eventos ALEPA ativos no Google Calendar */}
              {workspaceAccessToken && calendarEvents.length > 0 && (
                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <Smartphone className="w-4 h-4 text-[#0B3321]" />
                      <span>Alertas agendados no seu Google Calendar ({calendarEvents.length})</span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Sincronizado automaticamente com celular e computador
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {calendarEvents.map((ev) => {
                      const startLabel = ev.start?.dateTime
                        ? new Date(ev.start.dateTime).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Horário configurado';
                      const isRecurring = Boolean(ev.recurrence && ev.recurrence.length > 0);
                      return (
                        <div
                          key={ev.id}
                          className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">{ev.summary}</p>
                            <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                              {startLabel} {isRecurring ? '· Recorrência diária até 13/12/2026' : '· Evento único'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {ev.htmlLink && (
                              <a
                                href={ev.htmlLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[11px] font-medium inline-flex items-center gap-1"
                              >
                                <span>Abrir</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setPendingConfirmation({
                                  kind: 'delete_calendar',
                                  eventId: ev.id,
                                  title: ev.summary,
                                })
                              }
                              className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[11px] font-medium inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Remover</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </section>

      {/* Modal obrigatório de confirmação para criar/atualizar/excluir no Google Calendar ou enviar pelo Gmail */}
      {pendingConfirmation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-confirm-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 id="workspace-confirm-title" className="font-display text-lg font-bold text-slate-900">
                  {pendingConfirmation.kind === 'create_calendar' && 'Confirmar criação no Google Calendar'}
                  {pendingConfirmation.kind === 'update_calendar' && 'Confirmar atualização no Google Calendar'}
                  {pendingConfirmation.kind === 'delete_calendar' && 'Confirmar remoção no Google Calendar'}
                  {pendingConfirmation.kind === 'send_gmail' && 'Confirmar envio de e-mail pelo Gmail'}
                </h3>
                <p className="text-xs text-slate-500">
                  Revise os detalhes abaixo antes de autorizar esta ação na sua conta Google.
                </p>
              </div>
              <button
                type="button"
                disabled={workspaceBusy}
                onClick={() => setPendingConfirmation(null)}
                aria-label="Fechar"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(pendingConfirmation.kind === 'create_calendar' || pendingConfirmation.kind === 'update_calendar') && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                <p>
                  <strong>Evento:</strong> {pendingConfirmation.title}
                </p>
                <p>
                  <strong>Data inicial e horário:</strong>{' '}
                  {pendingConfirmation.dateKey.split('-').reverse().join('/')} às {pendingConfirmation.timeHHMM} (
                  {pendingConfirmation.durationMinutes} min)
                </p>
                <p>
                  <strong>Repetição:</strong>{' '}
                  {pendingConfirmation.recurrenceDailyUntilExam
                    ? 'Todos os dias até 13/12/2026'
                    : 'Evento único nesta data'}
                </p>
                <p>
                  <strong>Lembretes:</strong> Push {pendingConfirmation.popupMinutesBefore} min antes
                  {pendingConfirmation.emailMinutesBefore !== null
                    ? ` · E-mail do Google Calendar ${pendingConfirmation.emailMinutesBefore} min antes`
                    : ''}
                </p>
              </div>
            )}

            {pendingConfirmation.kind === 'delete_calendar' && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-1.5">
                <p>
                  Você está prestes a remover o evento <strong>{pendingConfirmation.title}</strong> do seu Google
                  Calendar principal.
                </p>
                <p>Os alarmes associados a este evento deixarão de ser disparados.</p>
              </div>
            )}

            {pendingConfirmation.kind === 'send_gmail' && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                <p>
                  <strong>Para:</strong> {pendingConfirmation.toEmail || '(informe um e-mail válido)'}
                </p>
                <p>
                  <strong>Assunto:</strong> {pendingConfirmation.subject}
                </p>
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-[11px] font-semibold text-slate-600 mb-1">Prévia da mensagem:</p>
                  <pre className="whitespace-pre-wrap font-sans text-[11px] text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 max-h-40 overflow-y-auto">
                    {pendingConfirmation.bodyText}
                  </pre>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={workspaceBusy}
                onClick={() => setPendingConfirmation(null)}
                className="min-h-[40px] px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={workspaceBusy}
                onClick={() => void handleExecuteConfirmedAction()}
                className={`min-h-[40px] px-4 py-2 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-2 ${
                  pendingConfirmation.kind === 'delete_calendar'
                    ? 'bg-red-700 hover:bg-red-800'
                    : 'bg-[#0B3321] hover:bg-[#134b32]'
                } disabled:opacity-60`}
              >
                <span>{workspaceBusy ? 'Processando...' : 'Confirmar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
                const disc = activeDisciplines.find((d) => d.id === e.target.value);
                setSelectedDiscipline(e.target.value);
                if (disc?.topics[0]) setTopicTitle(disc.topics[0].title);
              }}
              className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
            >
              {activeDisciplines.map((d) => (
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
          <h2 className="font-display text-base font-bold text-slate-900 mb-3">
            {isMedio ? 'Prioridade (Cargo 04 · PL.AL.060)' : 'Prioridade (Cargo 03 · PL.AL.102)'}
          </h2>
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
