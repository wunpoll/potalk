import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { 
  Mic, FileText, Users, Shield, CheckCircle2, ArrowRight, XCircle, 
  Zap, Clock, MessageSquare, Headphones, Calendar, Download, 
  Play, Star, ChevronRight, Globe, Award, Sparkles, Quote
} from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const features = [
    { icon: Mic, title: 'Кристально чистый звук', description: 'Низкая задержка WebRTC P2P соединений обеспечивает идеальное качество связи', gradient: 'from-blue-500 to-blue-600' },
    { icon: Zap, title: 'AI Протоколы', description: 'Автоматическая расшифровка и LLM-резюме с ключевыми решениями', gradient: 'from-purple-500 to-purple-600' },
    { icon: Shield, title: 'Корпоративная безопасность', description: 'JWT аутентификация, ролевой доступ и изолированные пространства', gradient: 'from-green-500 to-green-600' },
    { icon: MessageSquare, title: 'Умный чат', description: 'Редактирование сообщений, ответы и индикатор набора текста', gradient: 'from-orange-500 to-orange-600' },
    { icon: Headphones, title: 'Качество связи', description: 'Эхоподавление, шумоподавление и автоматическая регулировка', gradient: 'from-teal-500 to-teal-600' },
    { icon: Globe, title: 'Доступность', description: 'Работает в любом браузере без установки', gradient: 'from-rose-500 to-rose-600' }
  ];

  const testimonials = [
    { name: 'Алексей Иванов', role: 'CEO, TechStart', text: 'Протоколы встреч экономят нам часы в неделю! Рекомендую.' },
    { name: 'Мария Смирнова', role: 'Project Manager', text: 'Лучшее решение для удалённых команд. Качество связи отличное.' },
    { name: 'Дмитрий Козлов', role: 'CTO, DigitalLab', text: 'AI расшифровка работает просто отлично. Экономия времени огромная.' }
  ];

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Массив скриншотов (добавьте свои изображения)
  const screenshots = [
    { src: '/images/dashboard-meetings.png', title: 'Дашборд встреч', description: 'Список всех встреч и управление ими' },
    { src: '/images/team-management.png', title: 'Управление командой', description: 'Приглашение участников и управление ролями' },
    { src: '/images/support-center.png', title: 'Центр поддержки', description: 'Помощь и обратная связь' },
    { src: '/images/profile-settings.png', title: 'Настройки профиля', description: 'Управление личной информацией' },
    { src: '/images/analytics-dashboard.png', title: 'Аналитика компании', description: 'Ключевые метрики эффективности' },
  ];

  // Функции для переключения слайдов
  const nextSlide = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setCurrentSlide((prev) => (prev + 1) % screenshots.length);
    setTimeout(() => setIsAnimating(false), 300);
  };

  const prevSlide = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setCurrentSlide((prev) => (prev - 1 + screenshots.length) % screenshots.length);
    setTimeout(() => setIsAnimating(false), 300);
  };


  return (
    <div className="min-h-screen bg-white font-sans selection:bg-blue-100">
      
      {/* Navigation - улучшенное выравнивание */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-200' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Логотип - слева */}
            <div className="flex items-center gap-2 cursor-pointer min-w-[180px]">
              <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-2 rounded-xl shadow-lg shadow-blue-600/20">
                <Mic className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                Potalkyem
              </span>
              <span className="hidden md:inline-flex text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full ml-2">
                AI-Powered
              </span>
            </div>
            
            {/* Навигационные ссылки - по центру */}
            <div className="hidden md:flex items-center justify-center gap-8 flex-1">
              <button onClick={() => scrollToSection('features')} className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">Возможности</button>
              <button onClick={() => scrollToSection('pricing')} className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">Тарифы</button>
              <button onClick={() => scrollToSection('testimonials')} className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">Отзывы</button>
            </div>
            
            {/* Кнопки - справа */}
            <div className="flex items-center gap-3 min-w-[180px] justify-end">
              <button onClick={() => navigate('/login')} className="text-gray-600 hover:text-gray-900 font-medium text-sm transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100">Войти</button>
              <button onClick={() => navigate('/login?mode=register')} className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium transition-all shadow-md hover:shadow-lg active:scale-95">Начать</button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - добавлен отступ от шапки */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-20">
        {/* Фоновый градиент */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.1),transparent_50%)]"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-blue-200 rounded-full px-4 py-1.5 mb-6 shadow-sm">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-700">AI-платформа для аудиоконференций</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 tracking-tight mb-6 leading-tight">
              Умные аудиоконференции с
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 block md:inline md:ml-3">
                AI-протоколами
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              Фокусируйтесь на разговоре, а не на заметках. Наша платформа автоматически записывает, 
              расшифровывает и генерирует протоколы встреч с помощью передового AI.
            </p>
            
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
              <button 
                onClick={() => navigate('/login?mode=register')}
                className="group w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white px-8 py-3.5 rounded-xl text-lg font-semibold transition-all shadow-xl shadow-blue-600/30 hover:shadow-blue-600/40 hover:-translate-y-0.5"
              >
                <span>Начать бесплатно</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button 
                onClick={() => scrollToSection('features')}
                className="w-full sm:w-auto flex items-center justify-center gap-2 text-gray-600 hover:text-gray-900 px-6 py-3.5 rounded-xl text-lg font-medium transition-all hover:bg-gray-100"
              >
                <Play className="w-5 h-5" />
                <span>Смотреть демо</span>
              </button>
            </div>
            
            <div className="flex flex-wrap justify-center gap-8 mt-16 pt-8 border-t border-gray-200/50">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">500+</div>
                <div className="text-sm text-gray-500">Компаний доверяют</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">10K+</div>
                <div className="text-sm text-gray-500">Проведено встреч</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">24/7</div>
                <div className="text-sm text-gray-500">Служба поддержки</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-gray-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Возможности</span>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mt-2 mb-4">
              Всё, что нужно вашей команде
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Создано для современных организаций, которые ценят время и ясность коммуникаций
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <div 
                key={idx} 
                className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer"
              >
                <div className={`w-14 h-14 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Скриншот приложения */}
      <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Интерфейс</span>
            <h2 className="text-4xl font-bold text-gray-900 mt-2 mb-4">
              Интуитивно понятный интерфейс
            </h2>
            <p className="text-lg text-gray-600 mb-6">
              Всё, что нужно для продуктивной встречи — в одном месте. Чат, участники, AI-протоколы и управление аудио.
            </p>
            <div className="space-y-3">
              {[
                { icon: MessageSquare, text: 'Умный чат с редактированием сообщений' },
                { icon: Zap, text: 'Индикатор набора текста' },
                { icon: Users, text: 'Поднятие руки' },
                { icon: Mic, text: 'Управление микрофоном' }
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <item.icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-gray-700">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Карусель скриншотов */}
          <div className="relative">
            {/* Градиентный фон */}
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-3xl blur-2xl"></div>
            
            {/* Контейнер с изображением */}
            <div className="relative bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
              <img 
                src={screenshots[currentSlide].src}
                alt={screenshots[currentSlide].title}
                className={`w-full h-auto transition-all duration-300 ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
                onError={(e) => {
                  e.currentTarget.src = `https://placehold.co/800x500/e2e8f0/64748b?text=${screenshots[currentSlide].title}+Screenshot`;
                }}
              />
              
              {/* Затемнение снизу */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-900/60 to-transparent p-4">
                <p className="text-white text-sm font-medium">{screenshots[currentSlide].description}</p>
              </div>
              
              {/* Кнопки навигации карусели */}
              <button 
                onClick={prevSlide}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110"
              >
                <ChevronRight className="w-4 h-4 text-gray-800 rotate-180" />
              </button>
              <button 
                onClick={nextSlide}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110"
              >
                <ChevronRight className="w-4 h-4 text-gray-800" />
              </button>
            </div>
            
            {/* Индикаторы слайдов */}
            <div className="flex justify-center gap-2 mt-4">
              {screenshots.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setIsAnimating(true);
                    setCurrentSlide(idx);
                    setTimeout(() => setIsAnimating(false), 300);
                  }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    currentSlide === idx 
                      ? 'w-8 bg-blue-600' 
                      : 'w-1.5 bg-gray-300 hover:bg-gray-400'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-gray-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Тарифы</span>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mt-2 mb-4">
              Простое и прозрачное ценообразование
            </h2>
            <p className="text-xl text-gray-600">Выберите тариф, который подходит вашей организации</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Light Tier */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Light</h3>
              <p className="text-gray-500 text-sm mb-4">Для небольших команд</p>
              <div className="mb-6">
                <span className="text-5xl font-extrabold text-gray-900">Бесплатно</span>
                <span className="text-gray-500"> навсегда</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> До <span className="font-bold">5</span> участников</li>
                <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> <span className="font-bold">10</span> встреч/месяц</li>
                <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> WebRTC аудио и чат</li>
                <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> AI Протоколы</li>
                <li className="flex items-center gap-3 text-gray-400"><XCircle className="w-5 h-5 text-gray-300 shrink-0" /> Запись встреч</li>
              </ul>
              <button 
                onClick={() => navigate('/login?mode=register&plan=light')} 
                className="w-full py-3 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl font-semibold transition-all"
              >
                Начать
              </button>
            </div>

            {/* Pro Tier */}
            <div className="relative bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-2xl p-8 flex flex-col transform hover:scale-105 transition-all duration-300">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-yellow-400 to-yellow-500 text-gray-900 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg">
                Популярный
              </div>
              <h3 className="text-2xl font-bold text-white mb-1">Pro</h3>
              <p className="text-blue-100 text-sm mb-4">Для растущих организаций</p>
              <div className="mb-6">
                <span className="text-5xl font-extrabold text-white">2 999 ₽</span>
                <span className="text-blue-200">/мес</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                <li className="flex items-center gap-3 text-white"><CheckCircle2 className="w-5 h-5 text-blue-300 shrink-0" /> До <span className="font-bold">30</span> участников</li>
                <li className="flex items-center gap-3 text-white"><CheckCircle2 className="w-5 h-5 text-blue-300 shrink-0" /> <span className="font-bold">50</span> встреч/месяц</li>
                <li className="flex items-center gap-3 text-white"><CheckCircle2 className="w-5 h-5 text-blue-300 shrink-0" /> AI Протоколы</li>
                <li className="flex items-center gap-3 text-white"><CheckCircle2 className="w-5 h-5 text-blue-300 shrink-0" /> Запись встреч</li>
                <li className="flex items-center gap-3 text-white"><CheckCircle2 className="w-5 h-5 text-blue-300 shrink-0" /> <span className="font-bold">30 дней</span> хранения</li>
              </ul>
              <button 
                onClick={() => navigate('/login?mode=register&plan=pro')} 
                className="w-full py-3 bg-white text-blue-600 hover:bg-gray-50 rounded-xl font-bold transition-all shadow-lg"
              >
                14 дней бесплатно
              </button>
            </div>

            {/* Business Tier */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <h3 className="text-2xl font-bold text-gray-900 mb-1">Business</h3>
              <p className="text-gray-500 text-sm mb-4">Для крупных предприятий</p>
              <div className="mb-6">
                <span className="text-5xl font-extrabold text-gray-900">9 999 ₽</span>
                <span className="text-gray-500">/мес</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> До <span className="font-bold">100</span> участников</li>
                <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> <span className="font-bold">Безлимит</span> встреч</li>
                <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> AI Протоколы</li>
                <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> Запись встреч</li>
                <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> <span className="font-bold">90 дней</span> хранения</li>
              </ul>
              <button 
                onClick={() => navigate('/login?mode=register&plan=business')} 
                className="w-full py-3 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl font-semibold transition-all"
              >
                Связаться с нами
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-24 bg-white scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Отзывы</span>
            <h2 className="text-4xl font-bold text-gray-900 mt-2 mb-4">
              Что говорят наши клиенты
            </h2>
            <p className="text-xl text-gray-600">Более 500 компаний уже выбрали нас</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, idx) => (
              <div key={idx} className="bg-gray-50 p-6 rounded-2xl border border-gray-100 hover:shadow-lg transition-all">
                <Quote className="w-8 h-8 text-blue-400 mb-4 opacity-50" />
                <p className="text-gray-600 mb-4 leading-relaxed">"{testimonial.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-md">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{testimonial.name}</p>
                    <p className="text-sm text-gray-500">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Готовы начать?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Присоединяйтесь к тысячам команд, которые уже используют Potalkyem
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button 
              onClick={() => navigate('/login?mode=register')}
              className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-3.5 rounded-xl text-lg font-semibold transition-all shadow-lg hover:shadow-xl"
            >
              Начать бесплатно
            </button>
            <button 
              onClick={() => navigate('/login')}
              className="border-2 border-white/30 text-white hover:bg-white/10 px-8 py-3.5 rounded-xl text-lg font-semibold transition-all"
            >
              Войти в аккаунт
            </button>
          </div>
          <p className="text-blue-100 text-sm mt-6">Бесплатная пробная версия. Не требуется кредитная карта.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-1.5 rounded-lg">
                  <Mic className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-white">Potalkyem</span>
              </div>
              <p className="text-gray-400 text-sm">AI-платформа для умных аудиоконференций</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Продукт</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><button onClick={() => scrollToSection('features')} className="hover:text-white transition-colors">Возможности</button></li>
                <li><button onClick={() => scrollToSection('pricing')} className="hover:text-white transition-colors">Тарифы</button></li>
                <li><Link to="/docs/api" className="hover:text-white transition-colors">API</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Компания</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link to="/about" className="hover:text-white transition-colors">О нас</Link></li>
                <li><Link to="/blog" className="hover:text-white transition-colors">Блог</Link></li>
                <li><Link to="/contacts" className="hover:text-white transition-colors">Контакты</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Поддержка</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link to="/docs/user-guide" className="hover:text-white transition-colors">Документация</Link></li>
                <li><Link to="/faq" className="hover:text-white transition-colors">FAQ</Link></li>
                <li><a href="mailto:potalkyem412@gmail.com" className="hover:text-white transition-colors">potalkyem412@gmail.com</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-500">
            © 2026 Potalkyem. Все права защищены.
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out forwards;
        }
        .scroll-mt-20 {
          scroll-margin-top: 80px;
        }
      `}</style>
    </div>
  );
}