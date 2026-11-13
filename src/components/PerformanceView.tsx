import React from 'react';
import { BarChart3, Clock, Cloud, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ALEPA_DISCIPLINES, getDisciplineShortName } from '../data/alepaSyllabus';

export function PerformanceView() {
  const { studySessions, simuladoAttempts, topicProgressMap, errorNotebook, user } = useAuth();

  const totalMinutes = studySessions.reduce((acc, s) => acc + s.durationMinutes, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  const avgScore =
    simuladoAttempts.length > 0
      ? (simuladoAttempts.reduce((acc, a) => acc + a.score, 0) / simuladoAttempts.length).toFixed(1)
      : '0.0';

  const masteredErrors = errorNotebook.filter((e) => e.status === 'mastered').length;
  const totalErrors = errorNotebook.length;
  const recoveryPct = totalErrors > 0 ? Math.round((masteredErrors / totalErrors) * 100) : 100;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-800 inline-flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5" />
            <span>
              Sincronizado entre dispositivos · {user?.emailVerified ? 'Nuvem ativa' : 'Aguardando verificação de e-mail'}
            </span>
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Histórico de Desempenho
          </h1>
        </div>
      </div>

      {/* 4-column KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs text-slate-500">Horas acumuladas</p>
          <p className="font-display text-3xl font-bold text-slate-900 font-mono tabular-nums mt-1">{totalHours}h</p>
          <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">{studySessions.length} sessões</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs text-slate-500">Média nos simulados</p>
          <p className="font-display text-3xl font-bold text-[#0B3321] font-mono tabular-nums mt-1">{avgScore}</p>
          <p className="text-xs text-slate-500 mt-1">Escala 0 a 10,0 pontos</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs text-slate-500">Simulados realizados</p>
          <p className="font-display text-3xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {simuladoAttempts.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">Padrão Fundação CETAP</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs text-slate-500">Recuperação de erros</p>
          <p className="font-display text-3xl font-bold text-emerald-700 font-mono tabular-nums mt-1">
            {recoveryPct}%
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {masteredErrors}/{totalErrors} dominadas
          </p>
        </div>
      </div>

      {/* Progress by Discipline */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#0B3321]" />
            <h2 className="font-display text-lg font-bold text-slate-900">
              Cobertura e Horas por Disciplina (Ordem de Prioridade)
            </h2>
          </div>
        </div>

        <div className="space-y-4">
          {ALEPA_DISCIPLINES.map((disc) => {
            const topicLevels = disc.topics.map((t) => topicProgressMap[t.id]?.masteryLevel ?? 0);
            const avgMastery = topicLevels.length
              ? Math.round(topicLevels.reduce((a, b) => a + b, 0) / topicLevels.length)
              : 0;
            const mins = studySessions
              .filter((s) => s.disciplineId === disc.id)
              .reduce((a, s) => a + s.durationMinutes, 0);

            return (
              <div key={disc.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-slate-900">
                    {disc.priorityRank}º · {disc.shortName}
                  </span>
                  <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-600">
                    <span>{mins} min</span>
                    <span className="font-semibold text-slate-900 w-10 text-right">{avgMastery}%</span>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0B3321] rounded-full transition-all"
                    style={{ width: `${avgMastery}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tables: Simulado History + Study Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4">Histórico de Simulados</h2>
          {simuladoAttempts.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Nenhum simulado registrado ainda. Conclua uma bateria na aba Simulados.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {simuladoAttempts.slice(0, 10).map((att) => (
                <div key={att.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{att.title}</p>
                    <p className="text-xs text-slate-500 font-mono tabular-nums">
                      {att.correctCount}/{att.totalQuestions} acertos · {Math.round(att.durationSeconds / 60)} min
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                      {att.score.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4">Sessões de Estudo Recentes</h2>
          {studySessions.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Nenhuma sessão registrada ainda. Inicie o cronômetro de 2h no Cronograma.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {studySessions.slice(0, 10).map((ses) => (
                <div key={ses.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {getDisciplineShortName(ses.disciplineId)} · {ses.topicTitle}
                    </p>
                    <p className="text-xs text-slate-500 font-mono tabular-nums">
                      {ses.dateKey.split('-').reverse().join('/')} · {ses.blockType}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700 tabular-nums shrink-0">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{ses.durationMinutes} min</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
