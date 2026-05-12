import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Download, Search, Calendar, ChevronRight, Loader2, AlertCircle, ArrowUpDown, X } from 'lucide-react';
import Sidebar from '../components/Sidebar.tsx';
import { ProtocolShortResponse, ProtocolResponse } from '../types.ts';
import ProtocolViewer from '../components/ProtocolViewer.tsx';
import { api } from '../services/api.ts';

type SortField = 'date' | 'title' | 'room';
type SortDir = 'asc' | 'desc';

// Переводы
const translations = {
  title: 'Протоколы встреч',
  subtitle: 'AI-сгенерированные резюме, решения и планы действий',
  searchPlaceholder: 'Поиск по названию, комнате, резюме...',
  clearSearch: 'Очистить поиск',
  loading: 'Загрузка протоколов...',
  error: 'Не удалось загрузить протоколы',
  tryAgain: 'Повторить',
  protocolsFound: (count: number) => {
    if (count % 10 === 1 && count % 100 !== 11) return `${count} протокол найден`;
    if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) return `${count} протокола найдено`;
    return `${count} протоколов найдено`;
  },
  noProtocols: 'Протоколы не найдены',
  noMatch: 'Ничего не найдено по вашему запросу',
  createFirst: 'Создайте комнату и проведите встречу, чтобы увидеть протокол здесь',
  downloadPdf: 'Скачать PDF',
  view: 'Просмотр',
  sort: {
    date: 'Дата',
    title: 'Название',
    room: 'Комната'
  },
  noSummary: 'Нет доступного резюме'
};

// ===== МОКОВЫЕ ДАННЫЕ ДЛЯ ВИЗУАЛИЗАЦИИ =====
const MOCK_PROTOCOLS: ProtocolShortResponse[] = [
  {
    id: 'prot_001',
    room_id: 'room_alpha_01',
    title: 'Стартовое совещание проекта Альфа',
    created_at: '2026-05-10T10:30:00Z',
    room_name: 'Комната запуска Альфа',
    summary: 'Обсуждена архитектура платформы и распределение задач между модулями. Принято решение использовать PostgreSQL и WebSockets для сигнализации в реальном времени.',
    pdf_url: '#'
  },
  {
    id: 'prot_002',
    room_id: 'room_analytics_02',
    title: 'Обзор аналитической панели',
    created_at: '2026-05-08T14:15:00Z',
    room_name: 'Комната команды аналитики',
    summary: 'Рассмотрены метрики новой аналитической панели. Ключевые решения включают внедрение обновления данных в реальном времени каждые 30 секунд и добавление функционала экспорта отчетов.',
    pdf_url: '#'
  },
  {
    id: 'prot_003',
    room_id: 'room_cloud_03',
    title: 'Планирование миграции в облако',
    created_at: '2026-05-05T09:00:00Z',
    room_name: 'Инфраструктурная комната',
    summary: 'Стратегическое планирование миграции устаревших сервисов в облако. Установлен график поэтапной миграции с AWS в качестве основного провайдера.',
    pdf_url: '#'
  },
  {
    id: 'prot_004',
    room_id: 'room_security_04',
    title: 'Результаты аудита безопасности Q2 2026',
    created_at: '2026-04-28T11:45:00Z',
    room_name: 'Комната команды безопасности',
    summary: 'Представлены результаты аудита безопасности за второй квартал. Выявлено 12 критических уязвимостей, создан план действий с графиком устранения на следующие 2 недели.',
    pdf_url: '#'
  },
  {
    id: 'prot_005',
    room_id: 'room_product_05',
    title: 'Планирование продуктового роудмапа - Q3 2026',
    created_at: '2026-04-25T16:00:00Z',
    room_name: 'Комната продуктовой стратегии',
    summary: 'Стратегическая сессия по планированию продуктового роудмапа на третий квартал. Приоритетные функции: поиск на базе ИИ, улучшенные инструменты совместной работы и релиз мобильного приложения.',
    pdf_url: '#'
  }
];

const MOCK_FULL_PROTOCOLS: Record<string, ProtocolResponse> = {
  'prot_001': {
    id: 'prot_001',
    room_id: 'room_alpha_01',
    title: 'Стартовое совещание проекта Альфа',
    created_at: '2026-05-10T10:30:00Z',
    updated_at: '2026-05-10T10:30:00Z',
    summary_json: {
      summary: 'Обсуждена архитектура платформы и распределение задач между модулями. Принято решение использовать PostgreSQL и WebSockets для сигнализации в реальном времени.',
      topics: ['Архитектура', 'Проектирование БД', 'WebRTC сигнализация', 'Распределение задач']
    },
    decisions_json: {
      decisions: [
        'Использовать PostgreSQL в качестве основной базы данных с поддержкой JSONB',
        'Внедрить WebSocket сервер для сигнализации в реальном времени',
        'Хранить протоколы встреч в формате JSONB для гибких запросов'
      ]
    },
    action_items_json: {
      action_items: [
        { id: 'a1', task: 'Разработать ER-диаграмму', assignee: 'Алексей Петров', deadline: '2026-05-15', status: 'completed' },
        { id: 'a2', task: 'Настроить WebSocket сервер', assignee: 'Дмитрий Иванов', deadline: '2026-05-18', status: 'in_progress' },
        { id: 'a3', task: 'Создать схему базы данных', assignee: 'Мария Соколова', deadline: '2026-05-20', status: 'pending' }
      ]
    },
    pdf_url: '#'
  },
  'prot_002': {
    id: 'prot_002',
    room_id: 'room_analytics_02',
    title: 'Обзор аналитической панели',
    created_at: '2026-05-08T14:15:00Z',
    updated_at: '2026-05-08T14:15:00Z',
    summary_json: {
      summary: 'Рассмотрены метрики новой аналитической панели.',
      topics: ['Метрики панели', 'Обновления в реальном времени', 'Экспорт данных']
    },
    decisions_json: {
      decisions: [
        'Внедрить обновление данных в реальном времени через WebSocket каждые 30 секунд',
        'Добавить форматы экспорта CSV, Excel и PDF для отчетов'
      ]
    },
    action_items_json: {
      action_items: [
        { id: 'b1', task: 'Реализовать WebSocket соединение', assignee: 'Елена Козлова', deadline: '2026-05-14', status: 'completed' },
        { id: 'b2', task: 'Добавить функционал экспорта', assignee: 'Павел Морозов', deadline: '2026-05-16', status: 'in_progress' }
      ]
    },
    pdf_url: '#'
  },
  'prot_003': {
    id: 'prot_003',
    room_id: 'room_cloud_03',
    title: 'Планирование миграции в облако',
    created_at: '2026-05-05T09:00:00Z',
    updated_at: '2026-05-05T09:00:00Z',
    summary_json: {
      summary: 'Стратегическое планирование миграции устаревших сервисов в облако.',
      topics: ['Облачные провайдеры', 'Стратегия миграции', 'Анализ затрат']
    },
    decisions_json: {
      decisions: [
        'Выбрать AWS в качестве основного облачного провайдера',
        'Принять поэтапный подход к миграции в течение 6 месяцев'
      ]
    },
    action_items_json: {
      action_items: [
        { id: 'c1', task: 'Провести оценку облачных провайдеров', assignee: 'Максим Лебедев', deadline: '2026-05-10', status: 'completed' },
        { id: 'c2', task: 'Создать график миграции', assignee: 'Ольга Новикова', deadline: '2026-05-15', status: 'in_progress' }
      ]
    },
    pdf_url: '#'
  },
  'prot_004': {
    id: 'prot_004',
    room_id: 'room_security_04',
    title: 'Результаты аудита безопасности Q2 2026',
    created_at: '2026-04-28T11:45:00Z',
    updated_at: '2026-04-28T11:45:00Z',
    summary_json: {
      summary: 'Представлены результаты аудита безопасности за второй квартал.',
      topics: ['Оценка уязвимостей', 'Тестирование на проникновение', 'Анализ рисков']
    },
    decisions_json: {
      decisions: [
        'Внедрить экстренные исправления для критических уязвимостей',
        'Развернуть межсетевой экран веб-приложений (WAF)'
      ]
    },
    action_items_json: {
      action_items: [
        { id: 'd1', task: 'Устранить критические уязвимости', assignee: 'Команда безопасности', deadline: '2026-05-05', status: 'completed' },
        { id: 'd2', task: 'Развернуть WAF в продакшене', assignee: 'DevOps команда', deadline: '2026-05-10', status: 'in_progress' }
      ]
    },
    pdf_url: '#'
  },
  'prot_005': {
    id: 'prot_005',
    room_id: 'room_product_05',
    title: 'Планирование продуктового роудмапа - Q3 2026',
    created_at: '2026-04-25T16:00:00Z',
    updated_at: '2026-04-25T16:00:00Z',
    summary_json: {
      summary: 'Стратегическая сессия по планированию продуктового роудмапа на третий квартал.',
      topics: ['Приоритезация функций', 'Распределение ресурсов', 'Анализ рынка']
    },
    decisions_json: {
      decisions: [
        'Приоритезировать функцию поиска на базе ИИ для запуска в Q3',
        'Выделить дополнительные ресурсы на разработку мобильного приложения'
      ]
    },
    action_items_json: {
      action_items: [
        { id: 'e1', task: 'Создать PRD для функции ИИ-поиска', assignee: 'Продуктовая команда', deadline: '2026-05-05', status: 'completed' },
        { id: 'e2', task: 'Нанять двух мобильных разработчиков', assignee: 'HR команда', deadline: '2026-05-20', status: 'in_progress' }
      ]
    },
    pdf_url: '#'
  }
};



export default function Protocols() {
  const [search, setSearch] = useState('');
  const [protocols, setProtocols] = useState<ProtocolShortResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);
  const [fullProtocol, setFullProtocol] = useState<ProtocolResponse | null>(null);
  const [isViewerLoading, setIsViewerLoading] = useState(false);

  const downloadProtocolPDF = async (protocolId: string, title: string) => {
  try {
    // Используем state protocols, который доступен внутри компонента
    const protocol = protocols.find(p => p.id === protocolId);
    if (protocol?.pdf_url && protocol.pdf_url !== '#') {
      window.open(protocol.pdf_url, '_blank');
      return;
    }
    
    alert('Функция скачивания PDF будет доступна в ближайшее время');
  } catch (error) {
    console.error('Error downloading PDF:', error);
    alert('Не удалось скачать PDF');
  }
};

  useEffect(() => {
    fetchProtocols();
  }, []);

  const fetchProtocols = async () => {
  try {
    setIsLoading(true);
    setError(null);
    const response = await api.protocols.list();
    
    // Если есть реальные протоколы - показываем их, иначе мок-данные
    if (response.protocols && response.protocols.length > 0) {
      setProtocols(response.protocols);
    } else {
      console.log("Нет протоколов, показываем демо-данные");
      setProtocols(MOCK_PROTOCOLS);
    }
  } catch (err: any) {
    console.error("Failed to fetch protocols:", err);
    // При ошибке API тоже показываем мок-данные
    setProtocols(MOCK_PROTOCOLS);
    // Не показываем ошибку, так как используем демо-данные
    if (err.status !== 404) {
      setError(translations.error);
    }
  } finally {
    setIsLoading(false);
  }
};

 const handleViewProtocol = async (id: string) => {
  setSelectedProtocolId(id);
  setIsViewerLoading(true);
  try {
    let data: ProtocolResponse | null = null;
    
    // Проверяем, есть ли мок-данные для этого ID
    if (MOCK_FULL_PROTOCOLS[id]) {
      // Имитируем задержку сети для реалистичности
      await new Promise(resolve => setTimeout(resolve, 500));
      data = MOCK_FULL_PROTOCOLS[id];
    } else {
      data = await api.protocols.getById(id);
    }
    
    setFullProtocol(data);
  } catch (err) {
    console.error("Failed to fetch full protocol:", err);
    // Пробуем показать мок-данные при ошибке
    if (MOCK_FULL_PROTOCOLS[id]) {
      setFullProtocol(MOCK_FULL_PROTOCOLS[id]);
    } else {
      alert("Не удалось загрузить детали протокола");
      setSelectedProtocolId(null);
    }
  } finally {
    setIsViewerLoading(false);
  }
};

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filteredAndSortedProtocols = useMemo(() => {
    const searchLower = search.toLowerCase();
    
    let filtered = protocols.filter(p => {
      if (!search) return true;
      return (
        p.title.toLowerCase().includes(searchLower) ||
        p.room_name.toLowerCase().includes(searchLower) ||
        (p.summary && p.summary.toLowerCase().includes(searchLower))
      );
    });

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title':
          cmp = a.title.localeCompare(b.title, 'ru');
          break;
        case 'room':
          cmp = a.room_name.localeCompare(b.room_name, 'ru');
          break;
        case 'date':
        default:
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [protocols, search, sortField, sortDir]);

  const getSortButtonClass = (field: SortField) => {
    const isActive = sortField === field;
    return `px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
      isActive
        ? 'bg-white text-gray-900 shadow-sm'
        : 'text-gray-500 hover:text-gray-700'
    }`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-6 flex justify-between items-center shrink-0 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              {translations.title}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{translations.subtitle}</p>
          </div>          
          <div className="flex items-center gap-3 flex-wrap"></div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Кнопки сортировки */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {[
                { field: 'date' as SortField, label: translations.sort.date },
                { field: 'title' as SortField, label: translations.sort.title },
                { field: 'room' as SortField, label: translations.sort.room },
              ].map(({ field, label }) => (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  className={getSortButtonClass(field)}
                >
                  <span>{label}</span>
                  {sortField === field && (
                    <ArrowUpDown className={`w-3.5 h-3.5 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} />
                  )}
                </button>
              ))}
            </div>
            
            {/* Поиск */}
            <div className="relative w-72">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder={translations.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={translations.clearSearch}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
              <p className="text-sm font-medium text-gray-500">{translations.loading}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="bg-red-50 rounded-full p-4 mb-4">
                <AlertCircle className="w-12 h-12 text-red-400" />
              </div>
              <p className="text-lg font-medium text-red-800">{error}</p>
              <button 
                onClick={fetchProtocols} 
                className="mt-4 px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors font-medium"
              >
                {translations.tryAgain}
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {filteredAndSortedProtocols.length > 0 && (
                <div className="px-6 py-2.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                  {translations.protocolsFound(filteredAndSortedProtocols.length)}
                </div>
              )}
              <ul className="divide-y divide-gray-200">
                {filteredAndSortedProtocols.map((protocol) => (
                  <li key={protocol.id} className="hover:bg-gray-50/80 transition-colors">
                    <div className="px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="bg-gradient-to-br from-blue-100 to-blue-50 p-3 rounded-xl border border-blue-200 shrink-0">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                            <h3 className="text-lg font-bold text-gray-900 truncate">
                              {protocol.title}
                            </h3>
                            <div className="flex items-center text-xs text-gray-500 shrink-0">
                              <Calendar className="w-3.5 h-3.5 mr-1.5" />
                              {formatDate(protocol.created_at)}
                            </div>
                          </div>
                          <p className="text-sm font-medium text-blue-600 mb-1 truncate">
                            {protocol.room_name}
                          </p>
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {protocol.summary || translations.noSummary}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {protocol.pdf_url && (
                          <a
                            href={protocol.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title={translations.downloadPdf}
                          >
                            <Download className="w-5 h-5" />
                          </a>
                        )}
                        <button 
                          onClick={() => handleViewProtocol(protocol.id)}
                          disabled={isViewerLoading && selectedProtocolId === protocol.id}
                          className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all shadow-sm hover:shadow disabled:opacity-50"
                        >
                          {isViewerLoading && selectedProtocolId === protocol.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <span>{translations.view}</span>
                              <ChevronRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
                {filteredAndSortedProtocols.length === 0 && (
                  <li className="px-6 py-12 text-center">
                    <div className="bg-gray-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-gray-500 font-medium">
                      {search ? translations.noMatch : translations.noProtocols}
                    </p>
                    {!search && (
                      <p className="text-sm text-gray-400 mt-1">{translations.createFirst}</p>
                    )}
                  </li>
                )}
              </ul>
            </div>
          )}
        </main>
      </div>

      <ProtocolViewer 
        isOpen={!!fullProtocol} 
        onClose={() => {
          setFullProtocol(null);
          setSelectedProtocolId(null);
        }} 
        protocol={fullProtocol} 
      />
    </div>
  );
}