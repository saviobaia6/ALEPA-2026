import React, { useState } from 'react';
import { CheckCircle2, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isMedioDisciplineId } from '../data/alepaMedioSyllabus';
import { getDisciplineShortName } from '../data/alepaSyllabus';
import { CampusLevel, ErrorReason } from '../types';

const REASON_LABELS: Record<ErrorReason, string> = {
  atencao: 'Falta de atenção',
  teoria: 'Lacuna de teoria',
  lei_seca: 'Letra da lei / Regimento',
  banca_cetap: 'Pegadinha da banca CETAP',
};

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ErrorNotebookView({ campus }: { campus: CampusLevel }) {
  const { errorNotebook, updateErrorEntry, deleteErrorEntry } = useAuth();
  const [filterStatus, setFilterStatus] = useState<'pending' | 'mastered' | 'all'>('pending');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [reasonDraft, setReasonDraft] = useState<ErrorReason>('teoria');

  const isMedio = campus === 'medio';
  const campusErrors = errorNotebook.filter((e) =>
    isMedio ? isMedioDisciplineId(e.disciplineId) : !isMedioDisciplineId(e.disciplineId)
  );

  const filtered =
    filterStatus === 'all' ? campusErrors : campusErrors.filter((e) => e.status === filterStatus);

  const pendingCount = campusErrors.filter((e) => e.status === 'pending').length;
  const masteredCount = campusErrors.filter((e) => e.status === 'mastered').length;

  const handleMarkReviewed = async (id: string, currentCount: number, markMastered: boolean) => {
    await updateErrorEntry(id, {
      reviewCount: currentCount + 1,
      nextReviewDate: markMastered ? addDaysIso(15) : addDaysIso(7),
      status: markMastered ? 'mastered' : 'pending',
    });
  };

  const handleSaveEdit = async (id: string) => {
    await updateErrorEntry(id, {
      improvementNote: noteText,
      errorReason: reasonDraft,
    });
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-800">Banco de Melhoria · Revisão Espaçada (D+1 / D+7 / D+15)</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Caderno de Erros e Revisões
          </h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-600">
          <span>Pendentes: {pendingCount}</span>
          <span aria-hidden="true">·</span>
          <span>Dominadas: {masteredCount}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {(
          [
            { id: 'pending', label: `Pendentes (${pendingCount})` },
            { id: 'mastered', label: `Dominadas (${masteredCount})` },
            { id: 'all', label: `Todas (${campusErrors.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterStatus(tab.id)}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              filterStatus === tab.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
          <RefreshCw className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="font-display text-lg font-bold text-slate-900">
            {filterStatus === 'pending'
              ? 'Nenhuma questão pendente de revisão'
              : 'Nenhum registro nesta categoria'}
          </p>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Sempre que você errar uma questão nos simulados ou baterias de treino, ela aparecerá automaticamente aqui
            para revisão espaçada e registro de melhoria.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((entry) => {
            const isEditing = editingId === entry.id;
            return (
              <article key={entry.id} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-900">{getDisciplineShortName(entry.disciplineId)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{entry.topicTitle}</span>
                    <span aria-hidden="true">·</span>
                    <span>Motivo: {REASON_LABELS[entry.errorReason]}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-500">
                    <span>Próx. revisão: {entry.nextReviewDate.split('-').reverse().join('/')}</span>
                    <span>Revisões: {entry.reviewCount}</span>
                  </div>
                </div>

                <p className="text-sm sm:text-base font-medium text-slate-900 leading-relaxed">
                  {entry.questionStem}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900">
                    <span className="font-semibold block mb-1">Sua resposta anterior</span>
                    <span>{entry.selectedOption}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950">
                    <span className="font-semibold block mb-1">Gabarito oficial</span>
                    <span>{entry.correctOption}</span>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Causa do erro</label>
                        <select
                          value={reasonDraft}
                          onChange={(e) => setReasonDraft(e.target.value as ErrorReason)}
                          className="w-full min-h-[40px] px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-xl"
                        >
                          {Object.entries(REASON_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nota de melhoria (o que memorizar para não errar novamente)
                      </label>
                      <textarea
                        rows={3}
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="min-h-[38px] px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(entry.id)}
                        className="min-h-[38px] px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#0B3321] text-white"
                      >
                        Salvar melhoria
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-50 text-sm text-slate-700">
                    <span className="text-xs font-semibold text-slate-900 block mb-1">Nota de melhoria:</span>
                    {entry.improvementNote || 'Sem nota registrada.'}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(entry.id);
                        setNoteText(entry.improvementNote);
                        setReasonDraft(entry.errorReason);
                      }}
                      className="min-h-[40px] px-3.5 py-1.5 text-xs font-medium border border-slate-200 rounded-xl hover:bg-slate-50"
                    >
                      Editar nota de melhoria
                    </button>

                    {entry.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleMarkReviewed(entry.id, entry.reviewCount, false)}
                          className="min-h-[40px] px-3.5 py-1.5 text-xs font-medium border border-slate-200 rounded-xl hover:bg-slate-50"
                        >
                          Revisar novamente em 7 dias
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMarkReviewed(entry.id, entry.reviewCount, true)}
                          className="min-h-[40px] px-4 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl inline-flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Marcar como dominada</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleMarkReviewed(entry.id, entry.reviewCount, false)}
                        className="min-h-[40px] px-3.5 py-1.5 text-xs font-medium border border-slate-200 rounded-xl hover:bg-slate-50"
                      >
                        Retornar para pendentes
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteErrorEntry(entry.id)}
                    aria-label="Excluir registro do caderno"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
