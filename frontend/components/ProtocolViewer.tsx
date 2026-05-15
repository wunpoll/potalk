import React from 'react';
import { X, Download, FileText, CheckCircle2, Clock, Tag, User, Calendar, AlertCircle } from 'lucide-react';
import { ProtocolResponse } from '../types.ts';

interface ProtocolViewerProps {
  protocol: ProtocolResponse | null;
  isOpen: boolean;
  onClose: () => void;
}

// Переводы
const translations = {
  title: 'Протокол встречи',
  generated: 'Создан',
  download: 'Скачать PDF',
  sections: {
    summary: 'Резюме',
    topics: 'Обсуждаемые темы',
    decisions: 'Принятые решения',
    actionItems: 'План действий'
  },
  table: {
    task: 'Задача',
    assignee: 'Ответственный',
    deadline: 'Срок',
    status: 'Статус'
  },
  statuses: {
    pending: 'В ожидании',
    in_progress: 'В процессе',
    completed: 'Выполнено'
  },
  noDeadline: 'Без срока',
  unassigned: 'Не назначен',
  untitled: 'Без названия'
};

export default function ProtocolViewer({ protocol, isOpen, onClose }: ProtocolViewerProps) {
  if (!isOpen || !protocol) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col overflow-hidden animate-slide-in">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-gray-50 to-gray-100 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2 rounded-xl shadow-md">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                {protocol.title || translations.title}
              </h2>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {translations.generated}: {formatDate(protocol.created_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {protocol.pdf_url && (
              <a 
                href={protocol.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-medium transition-all hover:scale-105"
              >
                <Download className="w-4 h-4" />
                <span>{translations.download}</span>
              </a>
            )}
            <button 
              onClick={onClose} 
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all hover:rotate-90 duration-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
          <div className="space-y-6 max-w-3xl mx-auto">
            
            {/* Summary Section */}
            {protocol.summary_json && (
              <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-md font-bold text-gray-900 mb-3 flex items-center">
                  <FileText className="w-4 h-4 mr-2 text-blue-500" />
                  {translations.sections.summary}
                </h3>
                <p className="text-gray-700 text-sm leading-relaxed">
                  {protocol.summary_json.summary}
                </p>
                
                {protocol.summary_json.topics && protocol.summary_json.topics.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center">
                      <Tag className="w-3 h-3 mr-1" /> {translations.sections.topics}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {protocol.summary_json.topics.map((topic, idx) => (
                        <span key={idx} className="px-2.5 py-1 bg-gradient-to-r from-gray-100 to-gray-50 text-gray-700 text-xs rounded-full border border-gray-200">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Decisions Section */}
            {protocol.decisions_json && protocol.decisions_json.decisions && protocol.decisions_json.decisions.length > 0 && (
              <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-md font-bold text-gray-900 mb-4 flex items-center">
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                  {translations.sections.decisions}
                </h3>
                <ul className="space-y-3">
                  {protocol.decisions_json.decisions.map((decision, idx) => (
                    <li key={idx} className="flex items-start group">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-500 mt-2 mr-3 group-hover:scale-110 transition-transform"></span>
                      <span className="text-sm text-gray-700">{decision}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Action Items Section */}
            {protocol.action_items_json && protocol.action_items_json.action_items && protocol.action_items_json.action_items.length > 0 && (
              <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-md font-bold text-gray-900 mb-4 flex items-center">
                  <Clock className="w-4 h-4 mr-2 text-orange-500" />
                  {translations.sections.actionItems}
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr className="bg-gray-50 rounded-lg">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-l-lg">
                          {translations.table.task}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          {translations.table.assignee}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          {translations.table.deadline}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-r-lg">
                          {translations.table.status}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {protocol.action_items_json.action_items.map((item, idx) => {
                        const status = item.status || 'pending';
                        const assignee = item.assignee || translations.unassigned;
                        const initial = item.assignee ? String(item.assignee).charAt(0).toUpperCase() : '?';
                        
                        const statusConfig = {
                          completed: { label: translations.statuses.completed, color: 'green' },
                          in_progress: { label: translations.statuses.in_progress, color: 'blue' },
                          pending: { label: translations.statuses.pending, color: 'yellow' }
                        };
                        const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
                        
                        return (
                          <tr key={item.id || `action-item-${idx}`} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                              {item.task || translations.untitled}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              <div className="flex items-center space-x-2">
                                <div className={`w-6 h-6 rounded-full bg-${config.color}-100 text-${config.color}-700 flex items-center justify-center text-[10px] font-bold`}>
                                  {initial}
                                </div>
                                <span>{assignee}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {item.deadline || translations.noDeadline}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                config.color === 'green' ? 'bg-green-100 text-green-800' :
                                config.color === 'blue' ? 'bg-blue-100 text-blue-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {config.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Dialogue Section */}
            {protocol.content_json && protocol.content_json.dialogue && protocol.content_json.dialogue.length > 0 && (
              <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-md font-bold text-gray-900 mb-4 flex items-center">
                  <User className="w-4 h-4 mr-2 text-purple-500" />
                  Восстановленный диалог
                </h3>
                <div className="space-y-4">
                  {protocol.content_json.dialogue.map((reply: any, idx: number) => (
                    <div key={idx} className="flex flex-col">
                      <span className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-1">
                        {reply.speaker}
                      </span>
                      <p className="text-sm text-gray-800 bg-gray-50 p-3 rounded-lg border border-gray-100">
                        {reply.text}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state - если нет данных */}
            {!protocol.summary_json && !protocol.decisions_json && !protocol.action_items_json && !protocol.content_json?.dialogue && (
              <div className="bg-white p-12 rounded-xl border border-gray-200 text-center">
                <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Нет данных</h3>
                <p className="text-gray-500 text-sm">
                  Протокол пока не содержит информации. <br/>Попробуйте обновить страницу позже.
                </p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}