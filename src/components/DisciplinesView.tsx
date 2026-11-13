import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, ExternalLink, FileEdit } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ALEPA_DISCIPLINES, CONCURSO_PROFILE } from '../data/alepaSyllabus';

export function DisciplinesView() {
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

  const filteredDisciplines =
    blockFilter === 'all'
      ? ALEPA_DISCIPLINES
      : ALEPA_DISCIPLINES.filter((d) => d.editalBlock === blockFilter);

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
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-800">
            Anexo II Oficial · {CONCURSO_PROFILE.board} · {CONCURSO_PROFILE.code}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Disciplinas e Checklist do Edital
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={CONCURSO_PROFILE.anexoIIPdfPath}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-4 py-2 bg-[#0B3321] hover:bg-[#134b32] text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2 whitespace-nowrap"
          >
            <span>Anexo II (PDF)</span>
            <ExternalLink className="w-4 h-4" />
          </a>

          <a
            href={CONCURSO_PROFILE.editalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-sm font-medium rounded-xl inline-flex items-center gap-2 whitespace-nowrap"
          >
            <span>Portal CETAP</span>
            <ExternalLink className="w-4 h-4 text-slate-500" />
          </a>
        </div>
      </div>

      {/* Official Prova Structure Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="font-display text-base font-bold text-slate-900">
            Estrutura da Prova Objetiva (50 questões · 10,0 pontos)
          </h2>
          <span className="text-xs text-slate-500">0,2 ponto por questão · 5 alternativas (A–E)</span>
        </div>
        <table className="w-full text-left text-sm border-collapse min-w-[560px]">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="py-2 pr-4 font-medium">Bloco do Edital</th>
              <th className="py-2 px-4 font-medium text-right">Questões</th>
              <th className="py-2 px-4 font-medium text-right">Pontos</th>
              <th className="py-2 pl-4 font-medium text-right">Desempate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-2.5 pr-4 font-medium text-slate-900">Conhecimentos Específicos</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">20</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">4,0</td>
              <td className="py-2.5 pl-4 text-right font-mono tabular-nums text-emerald-800">1º critério</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 font-medium text-slate-900">Legislação e Ética no Serviço Público</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">10</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">2,0</td>
              <td className="py-2.5 pl-4 text-right font-mono tabular-nums">2º critério</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 font-medium text-slate-900">Língua Portuguesa</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">10</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">2,0</td>
              <td className="py-2.5 pl-4 text-right font-mono tabular-nums">3º critério</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 font-medium text-slate-900">Raciocínio Lógico</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">05</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">1,0</td>
              <td className="py-2.5 pl-4 text-right font-mono tabular-nums">4º critério</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 font-medium text-slate-900">Noções de Informática</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">05</td>
              <td className="py-2.5 px-4 text-right font-mono tabular-nums">1,0</td>
              <td className="py-2.5 pl-4 text-right font-mono tabular-nums">5º critério</td>
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
                    <span className="font-mono tabular-nums">
                      {disc.examQuestions} questões ({disc.examPoints.toFixed(1)} pts)
                    </span>
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
                            placeholder="Anote artigos importantes, exceções de banca ou súmulas..."
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
