import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, ExternalLink, FileEdit, GraduationCap, Layers } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  MEDIO_CARGOS,
  MEDIO_CONCURSO_PROFILE,
  getMedioDisciplines,
} from '../data/alepaMedioSyllabus';
import { ALEPA_DISCIPLINES, CONCURSO_PROFILE } from '../data/alepaSyllabus';
import { CampusLevel, MedioCargoGroup } from '../types';

interface DisciplinesViewProps {
  campus: CampusLevel;
  onChangeCampus: (campus: CampusLevel) => void;
  medioCargoGroup: MedioCargoGroup;
  onChangeMedioCargoGroup: (group: MedioCargoGroup) => void;
}

export function DisciplinesView({
  campus,
  onChangeCampus,
  medioCargoGroup,
  onChangeMedioCargoGroup,
}: DisciplinesViewProps) {
  const { topicProgressMap, saveTopicProgress } = useAuth();
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingTopicId, setSavingTopicId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const blocks = [
    'all',
    'Conhecimentos Específicos',
    'Legislação e Ética',
    'Língua Portuguesa',
    'Raciocínio Lógico',
    'Noções de Informática',
  ];

  const activeDisciplines =
    campus === 'medio' ? getMedioDisciplines(medioCargoGroup) : ALEPA_DISCIPLINES;

  const filteredDisciplines =
    blockFilter === 'all'
      ? activeDisciplines
      : activeDisciplines.filter((d) => d.editalBlock === blockFilter);

  const handleToggle = async (
    topicId: string,
    disciplineId: string,
    field: 'theoryDone' | 'questionsDone' | 'revisionDone'
  ) => {
    const current = topicProgressMap[topicId];
    const nextVal = !(current?.[field] ?? false);
    setSavingTopicId(topicId);
    setStatusMessage(null);
    try {
      await saveTopicProgress(topicId, disciplineId, { [field]: nextVal });
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Erro ao atualizar tópico.');
    } finally {
      setSavingTopicId(null);
    }
  };

  const handleSaveNotes = async (topicId: string, disciplineId: string) => {
    const text = noteDrafts[topicId] ?? topicProgressMap[topicId]?.notes ?? '';
    setSavingTopicId(topicId);
    setStatusMessage(null);
    try {
      await saveTopicProgress(topicId, disciplineId, { notes: text });
      setStatusMessage('Anotações do tópico sincronizadas.');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Erro ao salvar anotação.');
    } finally {
      setSavingTopicId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-800">
            Concurso ALEPA 2026 · {CONCURSO_PROFILE.board} · Conteúdo Programático Oficial (Anexo II)
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Campus & Conteúdo Programático do Edital
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={CONCURSO_PROFILE.anexoIIPdfPath}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[42px] px-4 py-2 bg-[#0B3321] hover:bg-[#134b32] text-white text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center gap-2 whitespace-nowrap"
          >
            <span>Anexo II Superior (PDF)</span>
            <ExternalLink className="w-4 h-4" />
          </a>

          <a
            href={CONCURSO_PROFILE.editalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[42px] px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-medium rounded-xl inline-flex items-center gap-2 whitespace-nowrap"
          >
            <span>Portal CETAP</span>
            <ExternalLink className="w-4 h-4 text-slate-500" />
          </a>
        </div>
      </div>

      {/* Dois Campus de Escolha: Nível Médio (Edital 001/2026) e Nível Superior (Edital 002/2026) */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">
            Escolha o Campus para estudar o conteúdo programático correspondente:
          </p>
          <span className="text-xs font-mono text-slate-500">
            {campus === 'medio' ? MEDIO_CONCURSO_PROFILE.editalNumber : CONCURSO_PROFILE.editalNumber}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              onChangeCampus('medio');
              setBlockFilter('all');
            }}
            className={`text-left p-4 rounded-xl border transition-colors flex items-start gap-3 ${
              campus === 'medio'
                ? 'border-[#0B3321] bg-[#0B3321] text-white'
                : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 text-slate-900'
            }`}
          >
            <Layers
              className={`w-5 h-5 shrink-0 mt-0.5 ${campus === 'medio' ? 'text-emerald-300' : 'text-[#146C43]'}`}
            />
            <div>
              <p className={`text-xs font-mono ${campus === 'medio' ? 'text-emerald-200' : 'text-emerald-800'}`}>
                CAMPUS 01 · EDITAL Nº 001/2026
              </p>
              <p className="font-display text-base font-bold mt-0.5">Nível Médio (Cargos 01 a 04)</p>
              <p className={`text-xs mt-1 ${campus === 'medio' ? 'text-emerald-100/85' : 'text-slate-600'}`}>
                Auxiliar Técnico Legislativo: Plenário, Telefonia, Patrimônio e Assistência Administrativa.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeCampus('superior');
              setBlockFilter('all');
            }}
            className={`text-left p-4 rounded-xl border transition-colors flex items-start gap-3 ${
              campus === 'superior'
                ? 'border-[#0B3321] bg-[#0B3321] text-white'
                : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 text-slate-900'
            }`}
          >
            <GraduationCap
              className={`w-5 h-5 shrink-0 mt-0.5 ${campus === 'superior' ? 'text-emerald-300' : 'text-[#146C43]'}`}
            />
            <div>
              <p className={`text-xs font-mono ${campus === 'superior' ? 'text-emerald-200' : 'text-emerald-800'}`}>
                CAMPUS 02 · EDITAL Nº 002/2026
              </p>
              <p className="font-display text-base font-bold mt-0.5">Nível Superior (Cargo 03 · PL.AL.102)</p>
              <p className={`text-xs mt-1 ${campus === 'superior' ? 'text-emerald-100/85' : 'text-slate-600'}`}>
                Assessoramento Legislativo – Técnico Legislativo · 50 questões objetivas.
              </p>
            </div>
          </button>
        </div>

        {/* Nível Médio Cargo Selector + Anexo I Details */}
        {campus === 'medio' && (
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  {MEDIO_CONCURSO_PROFILE.primaryCargoNumber} – {MEDIO_CONCURSO_PROFILE.primaryCargoTitle} ({MEDIO_CONCURSO_PROFILE.primaryCargoCode})
                </h2>
                <p className="text-xs text-slate-600">
                  Escolaridade: {MEDIO_CONCURSO_PROFILE.level} · Remuneração: {MEDIO_CONCURSO_PROFILE.remuneration} ·{' '}
                  {MEDIO_CONCURSO_PROFILE.workload} · {MEDIO_CONCURSO_PROFILE.retificacaoNote}
                </p>
              </div>
              <a
                href={MEDIO_CONCURSO_PROFILE.editalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-[#0B3321] hover:underline inline-flex items-center gap-1 shrink-0"
              >
                <span>Página oficial – CETAP</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 leading-relaxed">
              {MEDIO_CONCURSO_PROFILE.cargo04SpecificNote}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {MEDIO_CARGOS.map((cargo) => {
                const isSelected = medioCargoGroup === cargo.group;
                return (
                  <button
                    key={cargo.code}
                    type="button"
                    onClick={() => onChangeMedioCargoGroup(cargo.group)}
                    className={`text-left p-4 rounded-xl border transition-colors space-y-2 ${
                      isSelected
                        ? 'border-[#146C43] bg-emerald-50/70'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-bold text-[#0B3321]">
                        {cargo.cargoNumber} · {cargo.code}
                      </span>
                      <span className="font-semibold text-[#146C43]">{cargo.vacanciesSummary}</span>
                    </div>
                    <p className="font-display text-sm font-bold text-slate-900">{cargo.title}</p>
                    <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                      {cargo.activitiesSummary}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500">
                      Remuneração: {cargo.remuneration} · {cargo.vacanciesBreakdown}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Estrutura da Prova Objetiva e Quantidade de Questões (Médio e Superior) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <h2 className="font-display text-base font-bold text-slate-900">
            Quantidade de Questões ·{' '}
            {campus === 'medio'
              ? 'Nível Médio · Edital nº 001/2026 (50 questões · 10,0 pontos)'
              : 'Nível Superior · Edital nº 002/2026 (50 questões · 10,0 pontos)'}
          </h2>
          <span className="text-xs text-slate-500">0,2 ponto por questão · 5 alternativas (A–E)</span>
        </div>
        <table className="w-full text-left text-sm border-collapse min-w-[560px]">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="py-2 pr-4 font-medium">Bloco do Edital</th>
              <th className="py-2 px-4 font-medium text-right">Qtd. de Questões</th>
              <th className="py-2 px-4 font-medium text-right">Pontos</th>
              <th className="py-2 pl-4 font-medium text-right">Desempate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-2.5 pr-4 font-medium text-slate-900">
                Conhecimentos Específicos
                {campus === 'medio' && (
                  <span className="block text-xs font-normal text-slate-500">
                    Dir. Constitucional, Dir. Administrativo, Técnica Legislativa, Adm. Pública, Secretaria, Arquivologia e Rec. Materiais
                  </span>
                )}
              </td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">20</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">4,0</td>
              <td className="py-2.5 pl-4 text-right font-mono tabular-nums text-emerald-800">1º critério</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 font-medium text-slate-900">Legislação e Ética no Serviço Público</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">10</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">2,0</td>
              <td className="py-2.5 pl-4 text-right font-mono tabular-nums">2º critério</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 font-medium text-slate-900">Língua Portuguesa</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">10</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">2,0</td>
              <td className="py-2.5 pl-4 text-right font-mono tabular-nums">3º critério</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 font-medium text-slate-900">Raciocínio Lógico</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">05</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">1,0</td>
              <td className="py-2.5 pl-4 text-right font-mono tabular-nums">4º critério</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 font-medium text-slate-900">Noções de Informática</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">05</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">1,0</td>
              <td className="py-2.5 pl-4 text-right font-mono tabular-nums">5º critério</td>
            </tr>
            <tr className="bg-slate-50/80 font-semibold text-slate-900">
              <td className="py-2.5 pr-4">Total da Prova Objetiva</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">50 questões</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">10,0</td>
              <td className="py-2.5 pl-4 text-right text-xs text-slate-500 font-normal">Mínimo conforme edital</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Block Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
        {blocks.map((block) => (
          <button
            key={block}
            type="button"
            onClick={() => setBlockFilter(block)}
            className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              blockFilter === block
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {block === 'all' ? 'Todos os blocos' : block}
          </button>
        ))}
      </div>

      {statusMessage && (
        <div className="text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-xl px-4 py-3">
          {statusMessage}
        </div>
      )}

      {/* Disciplines List */}
      <div className="space-y-6">
        {filteredDisciplines.map((disc) => {
          const totalMastery = disc.topics.reduce(
            (acc, t) => acc + (topicProgressMap[t.id]?.masteryLevel ?? 0),
            0
          );
          const avgMastery = disc.topics.length ? Math.round(totalMastery / disc.topics.length) : 0;

          return (
            <section key={disc.id} className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Prioridade {disc.priorityRank}</span>
                    <span aria-hidden="true">·</span>
                    <span>{disc.editalBlock}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono font-semibold text-[#0B3321]">
                      {disc.examQuestions} {disc.examQuestions === 1 ? 'questão' : 'questões'}{' '}
                      {disc.editalBlock === 'Conhecimentos Específicos' ? '(no bloco)' : ''} ·{' '}
                      {disc.examPoints.toFixed(1).replace('.', ',')} pts
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{campus === 'medio' ? 'Edital 001/2026 (Médio)' : 'Edital 002/2026 (Superior)'}</span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-slate-900 mt-1">{disc.name}</h3>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-700 rounded-full transition-all"
                      style={{ width: `${avgMastery}%` }}
                    />
                  </div>
                  <span className="font-mono text-sm font-semibold text-slate-800 tabular-nums w-11 text-right">
                    {avgMastery}%
                  </span>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {disc.topics.map((topic) => {
                  const prog = topicProgressMap[topic.id];
                  const isExpanded = expandedTopicId === topic.id;
                  const noteVal = noteDrafts[topic.id] ?? prog?.notes ?? '';

                  return (
                    <div key={topic.id} className="py-4 first:pt-4 last:pb-0">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{topic.highYield ? 'Alta incidência CETAP' : 'Conteúdo programático'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{prog?.masteryLevel ?? 0}% concluído</span>
                          </div>
                          <p className="text-base font-semibold text-slate-900">{topic.title}</p>
                          <p className="text-xs text-slate-500">{topic.subtopics.join(' · ')}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {(
                            [
                              { key: 'theoryDone', label: 'Teoria' },
                              { key: 'questionsDone', label: 'Questões' },
                              { key: 'revisionDone', label: 'Revisão' },
                            ] as const
                          ).map((item) => {
                            const checked = Boolean(prog?.[item.key]);
                            return (
                              <button
                                key={item.key}
                                type="button"
                                disabled={savingTopicId === topic.id}
                                onClick={() => handleToggle(topic.id, disc.id, item.key)}
                                className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                                  checked
                                    ? 'bg-emerald-700 border-emerald-700 text-white'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <Check className={`w-3.5 h-3.5 ${checked ? 'opacity-100' : 'opacity-30'}`} />
                                <span>{item.label}</span>
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => setExpandedTopicId(isExpanded ? null : topic.id)}
                            aria-label="Abrir anotações do tópico"
                            className="min-h-[40px] min-w-[40px] px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1 text-xs"
                          >
                            <FileEdit className="w-3.5 h-3.5" />
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                          <label htmlFor={`note-${topic.id}`} className="block text-xs font-medium text-slate-700">
                            Anotações de lei seca, artigos e resumos deste tópico
                          </label>
                          <textarea
                            id={`note-${topic.id}`}
                            rows={3}
                            value={noteVal}
                            onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [topic.id]: e.target.value }))}
                            placeholder="Anote artigos importantes, exceções de banca ou normas técnicas..."
                            className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
                          />
                          <div className="flex justify-end">
                            <button
                              type="button"
                              disabled={savingTopicId === topic.id}
                              onClick={() => handleSaveNotes(topic.id, disc.id)}
                              className="min-h-[40px] px-4 py-1.5 bg-[#0B3321] hover:bg-[#134b32] text-white text-xs font-semibold rounded-lg"
                            >
                              Salvar anotações
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
