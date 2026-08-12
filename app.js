/**
 * ================================================================
 *  CRYPTO SIGNAL WIDGET — СО ЗВУКОВЫМИ ОПОВЕЩЕНИЯМИ
 *  
 *  ЗВУКОВЫЕ ФУНКЦИИ:
 *  - Звуковой сигнал Ding-ding.mp3 при BUY/SELL >= 75%
 *  - Кнопка включения/выключения звука
 *  - Звук сохраняется в папке audio/
 * ================================================================
 */

(function() {
    'use strict';

    // ============================================================
    //  КОНФИГУРАЦИЯ
    // ============================================================

    const CONFIG = {
        assets: ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'GRAM', 'TRX', 'PAXG'],
        symbolMap: {
            'BTC': 'BTCUSDT',
            'ETH': 'ETHUSDT',
            'BNB': 'BNBUSDT',
            'SOL': 'SOLUSDT',
            'XRP': 'XRPUSDT',
            'ADA': 'ADAUSDT',
            'GRAM': 'GRAMUSDT',
            'TRX': 'TRXUSDT',
            'PAXG': 'PAXGUSDT'
        },
        timeframes: ['15m', '1h', '2h', '4h', '1d'],
        wsEndpoint: 'wss://stream.binance.com:9443/ws',
        cacheTTL: 300000,
        maxCandles: 1000,
        historyCandles: 1500,
        minCandlesRequired: 50,
        trading: {
            minConfidence: 65,
            minProfitPercent: 1.0,
            maxLossPercent: 2.0,
            positionSize: 1000
        },
        sound: {
            threshold: 75, // Процент уверенности для звукового сигнала
            filePath: 'audio/Ding-ding.mp3' // Путь к звуковому файлу
        }
    };

    // ============================================================
    //  ЗВУКОВАЯ СИСТЕМА
    // ============================================================

    const SoundSystem = {
        _audio: null,
        _isEnabled: true,
        _isLoaded: false,
        _lastPlayedSignals: new Map(),

        init: function() {
            this._audio = new Audio();
            this._audio.preload = 'auto';
            
            // Загружаем звуковой файл
            this._audio.src = CONFIG.sound.filePath;
            
            // Обработчики загрузки
            this._audio.addEventListener('canplaythrough', () => {
                this._isLoaded = true;
                console.log('🔊 Звук загружен:', CONFIG.sound.filePath);
            });
            
            this._audio.addEventListener('error', (e) => {
                console.warn('⚠️ Не удалось загрузить звук:', CONFIG.sound.filePath);
                console.warn('⚠️ Убедитесь, что файл существует по пути:', CONFIG.sound.filePath);
                // Пробуем загрузить с относительным путем
                this._audio.src = './' + CONFIG.sound.filePath;
            });

            // Загружаем состояние из localStorage
            this.loadState();
            
            return this;
        },

        playSound: function(signalType, asset, confidence) {
            if (!this._isEnabled) return;
            if (!this._isLoaded) {
                console.warn('⚠️ Звук ещё не загружен');
                return;
            }
            if (confidence < CONFIG.sound.threshold) return;

            // Проверяем, не играли ли уже этот сигнал для данного актива
            const signalKey = `${asset}-${signalType}`;
            const now = Date.now();
            const lastPlayed = this._lastPlayedSignals.get(signalKey) || 0;
            
            // Не играем чаще чем раз в 30 секунд для одного актива
            if (now - lastPlayed < 30000) return;
            
            this._lastPlayedSignals.set(signalKey, now);

            try {
                // Сброс и воспроизведение
                this._audio.currentTime = 0;
                this._audio.play().catch(e => {
                    console.warn('⚠️ Не удалось воспроизвести звук:', e);
                });
                
                console.log(`🔊 Звуковой сигнал: ${signalType} ${asset} (${confidence}%)`);
                
                // Очищаем старые записи (старше 5 минут)
                for (const [key, time] of this._lastPlayedSignals) {
                    if (now - time > 300000) {
                        this._lastPlayedSignals.delete(key);
                    }
                }

            } catch (e) {
                console.warn('⚠️ Ошибка воспроизведения звука:', e);
            }
        },

        toggle: function() {
            this._isEnabled = !this._isEnabled;
            this.saveState();
            return this._isEnabled;
        },

        isEnabled: function() {
            return this._isEnabled;
        },

        isLoaded: function() {
            return this._isLoaded;
        },

        saveState: function() {
            try {
                localStorage.setItem('signalSoundEnabled', JSON.stringify(this._isEnabled));
            } catch (e) {}
        },

        loadState: function() {
            try {
                const enabled = localStorage.getItem('signalSoundEnabled');
                if (enabled !== null) {
                    this._isEnabled = JSON.parse(enabled);
                }
            } catch (e) {}
        }
    };

    // ============================================================
    //  МУЛЬТИ-БИРЖЕВОЙ ЗАГРУЗЧИК
    // ============================================================

    const EXCHANGE_CONFIG = {
        restEndpoints: [
            { id: 'binance', url: 'https://api.binance.com/api/v3/klines', format: 'binance' },
            { id: 'bybit', url: 'https://api.bybit.com/v5/market/kline', format: 'bybit' },
            { id: 'okx', url: 'https://www.okx.com/api/v5/market/history-candles', format: 'okx' },
            { id: 'mexc', url: 'https://api.mexc.com/api/v3/klines', format: 'binance' },
            { id: 'coinbase', url: 'https://api.exchange.coinbase.com/products', format: 'coinbase' },
            { id: 'htx', url: 'https://api.huobi.pro/market/history/kline', format: 'htx' },
            { id: 'kucoin', url: 'https://api.kucoin.com/api/v1/market/candles', format: 'kucoin' }
        ],
        timeout: 8000
    };

    const ASSET_DISPLAY_NAMES = {
        'BTC': '₿ BTC',
        'ETH': '⟠ ETH',
        'BNB': '🟡 BNB',
        'SOL': '◎ SOL',
        'XRP': '✕ XRP',
        'ADA': '₳ ADA',
        'GRAM': '📱 GRAM',
        'TRX': '🔺 TRX',
        'PAXG': '🥇 PAXG'
    };

    const INDICATOR_LABELS = {
        rsi: 'RSI',
        macd: 'MACD',
        ema: 'EMA Ribbon',
        cvd: 'CVD',
        bb: 'Bollinger',
        volume: 'Volume',
        poc: 'POC'
    };

    // ============================================================
    //  ДОКУМЕНТАЦИЯ
    // ============================================================

    const TRADING_GUIDE = {
        '15m': {
            name: '15 Минут',
            icon: '⚡',
            action: { BUY: 'Скальпинг. Цель: +0.5-1.5%. Стоп: -0.5-1%.', SELL: 'Краткосрочный выход. Цель: +0.5-1.5%. Стоп: -0.5-1%.', WAIT: 'Рынок неопределён. Ждите 1H+.' },
            risk: 'Высокий',
            riskLevel: 'high',
            recommended: 'Для опытных трейдеров',
            positionSize: '1-2%',
            stopLoss: '0.5-1%',
            takeProfit: '0.5-1.5%',
            confidence: 'Требуется > 75%'
        },
        '1h': {
            name: '1 Час',
            icon: '📊',
            action: { BUY: 'Стандартный вход. Цель: +1-3%. Стоп: -1-1.5%.', SELL: 'Стандартный выход. Цель: +1-3%. Стоп: -1-1.5%.', WAIT: 'Сигнал слабый. Ждите 4H.' },
            risk: 'Средний',
            riskLevel: 'medium',
            recommended: 'Для всех трейдеров',
            positionSize: '3-5%',
            stopLoss: '1-1.5%',
            takeProfit: '1-3%',
            confidence: 'Требуется > 70%'
        },
        '2h': {
            name: '2 Часа',
            icon: '📈',
            action: { BUY: 'Свинг-трейдинг. Цель: +2-4%. Стоп: -1.5-2%.', SELL: 'Свинг-выход. Цель: +2-4%. Стоп: -1.5-2%.', WAIT: 'Тренд не сформирован.' },
            risk: 'Средний-Высокий',
            riskLevel: 'medium-high',
            recommended: 'Для среднесрочных',
            positionSize: '3-5%',
            stopLoss: '1.5-2%',
            takeProfit: '2-4%',
            confidence: 'Требуется > 65%'
        },
        '4h': {
            name: '4 Часа',
            icon: '📉',
            action: { BUY: 'Среднесрочный вход. Цель: +3-6%. Стоп: -2-3%.', SELL: 'Среднесрочный выход. Цель: +3-6%. Стоп: -2-3%.', WAIT: 'Нет чёткого тренда.' },
            risk: 'Средний',
            riskLevel: 'medium',
            recommended: 'Рекомендуемый',
            positionSize: '5-10%',
            stopLoss: '2-3%',
            takeProfit: '3-6%',
            confidence: 'Требуется > 65%'
        },
        '1d': {
            name: '1 День',
            icon: '🏛️',
            action: { BUY: 'Долгосрочный вход. Цель: +5-15%. Стоп: -3-5%.', SELL: 'Долгосрочный выход. Цель: +5-15%. Стоп: -3-5%.', WAIT: 'Глобальный тренд не определён.' },
            risk: 'Низкий-Средний',
            riskLevel: 'low-medium',
            recommended: 'Для инвесторов',
            positionSize: '10-20%',
            stopLoss: '3-5%',
            takeProfit: '5-15%',
            confidence: 'Требуется > 55%'
        }
    };

    // ============================================================
    //  СОСТОЯНИЕ
    // ============================================================

    const state = {
        marketData: new Map(),
        signals: new Map(),
        actionScores: new Map(),
        indicatorScores: new Map(),
        tradeHistory: [],
        tradeStats: { totalTrades: 0, wins: 0, losses: 0, totalProfit: 0, winRate: 0, avgProfit: 0 },
        ws: null,
        reconnectAttempts: 0,
        maxReconnectAttempts: 10,
        isConnected: false,
        updateInterval: null,
        signalThrottle: null,
        currentTF: '1h',
        historyLoaded: false,
        assetAvailability: {},
        loadingStatus: {},
        dataLoadAttempts: {},
        previousSignals: new Map()
    };

    const cache = new Map();
    const els = {};

    // ============================================================
    //  МУЛЬТИ-БИРЖЕВОЙ ЗАГРУЗЧИК
    // ============================================================

    async function fetchHistoricalData(symbol, limit, interval) {
        limit = limit || CONFIG.historyCandles;
        interval = interval || '1h';

        const intervalMap = {
            '15m': { binance: '15m', bybit: '15', okx: '15m', mexc: '15m', htx: '15min', kucoin: '15min' },
            '1h': { binance: '1h', bybit: '60', okx: '1H', mexc: '1h', htx: '60min', kucoin: '1hour' },
            '2h': { binance: '2h', bybit: '120', okx: '2H', mexc: '2h', htx: '2hour', kucoin: '2hour' },
            '4h': { binance: '4h', bybit: '240', okx: '4H', mexc: '4h', htx: '4hour', kucoin: '4hour' },
            '1d': { binance: '1d', bybit: 'D', okx: '1D', mexc: '1d', htx: '1day', kucoin: '1day' }
        };

        for (const exchange of EXCHANGE_CONFIG.restEndpoints) {
            try {
                let url = '';
                const intervalStr = intervalMap[interval]?.[exchange.id] || '1h';

                switch (exchange.id) {
                    case 'binance':
                        url = `${exchange.url}?symbol=${symbol}&interval=${intervalStr}&limit=${limit}`;
                        break;
                    case 'bybit':
                        url = `${exchange.url}?symbol=${symbol}&interval=${intervalStr}&limit=${limit}`;
                        break;
                    case 'okx':
                        url = `${exchange.url}?instId=${symbol}&bar=${intervalStr}&limit=${limit}`;
                        break;
                    case 'mexc':
                        url = `${exchange.url}?symbol=${symbol}&interval=${intervalStr}&limit=${limit}`;
                        break;
                    case 'coinbase':
                        const granularity = interval === '1h' ? 3600 : interval === '15m' ? 900 : interval === '2h' ?
                            7200 : interval === '4h' ? 14400 : 86400;
                        url = `${exchange.url}/${symbol}/candles?granularity=${granularity}`;
                        break;
                    case 'htx':
                        url = `${exchange.url}?symbol=${symbol.toLowerCase()}&period=${intervalStr}&size=${limit}`;
                        break;
                    case 'kucoin':
                        url = `${exchange.url}?symbol=${symbol}&type=${intervalStr}&limit=${limit}`;
                        break;
                    default:
                        continue;
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), EXCHANGE_CONFIG.timeout);

                const response = await fetch(url, {
                    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) continue;

                const data = await response.json();

                let candles = parseExchangeData(data, exchange.id);

                if (candles && candles.length >= CONFIG.minCandlesRequired) {
                    return candles;
                }

            } catch (error) {
                // Продолжаем со следующей биржей
            }
        }

        return [];
    }

    function parseExchangeData(data, exchangeId) {
        try {
            switch (exchangeId) {
                case 'binance':
                case 'mexc':
                    return data.map(k => ({
                        time: k[0],
                        open: parseFloat(k[1]),
                        high: parseFloat(k[2]),
                        low: parseFloat(k[3]),
                        close: parseFloat(k[4]),
                        volume: parseFloat(k[5])
                    }));
                case 'bybit':
                    if (data.result?.list) {
                        return data.result.list.map(k => ({
                            time: parseInt(k[0]),
                            open: parseFloat(k[1]),
                            high: parseFloat(k[2]),
                            low: parseFloat(k[3]),
                            close: parseFloat(k[4]),
                            volume: parseFloat(k[5])
                        }));
                    }
                    return [];
                case 'okx':
                    if (data.data) {
                        return data.data.map(k => ({
                            time: parseInt(k[0]),
                            open: parseFloat(k[1]),
                            high: parseFloat(k[2]),
                            low: parseFloat(k[3]),
                            close: parseFloat(k[4]),
                            volume: parseFloat(k[5])
                        }));
                    }
                    return [];
                case 'coinbase':
                    return data.map(k => ({
                        time: parseInt(k[0]) * 1000,
                        open: parseFloat(k[3]),
                        high: parseFloat(k[2]),
                        low: parseFloat(k[1]),
                        close: parseFloat(k[4]),
                        volume: parseFloat(k[5])
                    }));
                case 'htx':
                    if (data.data) {
                        return data.data.map(k => ({
                            time: parseInt(k[0]) * 1000,
                            open: parseFloat(k[1]),
                            high: parseFloat(k[2]),
                            low: parseFloat(k[3]),
                            close: parseFloat(k[4]),
                            volume: parseFloat(k[5])
                        }));
                    }
                    return [];
                case 'kucoin':
                    if (data.data) {
                        return data.data.map(k => ({
                            time: parseInt(k[0]),
                            open: parseFloat(k[1]),
                            high: parseFloat(k[2]),
                            low: parseFloat(k[3]),
                            close: parseFloat(k[4]),
                            volume: parseFloat(k[5])
                        }));
                    }
                    return [];
                default:
                    return [];
            }
        } catch (e) {
            return [];
        }
    }

    // ============================================================
    //  РЕНДЕРИНГ
    // ============================================================

    function renderWidget() {
        const container = document.getElementById('signal-widget');
        if (!container) {
            console.error('❌ Контейнер #signal-widget не найден');
            return;
        }

        const isSoundEnabled = SoundSystem.isEnabled();
        const isSoundLoaded = SoundSystem.isLoaded();

        container.innerHTML = `
            <div class="crypto-signal-widget">
                <div class="widget-header">
                    <div>
                        <span class="widget-title">🧠 Crypto Signal Engine</span>
                        <span class="widget-version">v8.1 • Со звуковыми оповещениями</span>
                        <span class="widget-version">🔊 Звуковой сигнал при BUY/SELL ≥ 75%</span>
                    </div>
                    <div class="widget-status-group">
                        <div class="sound-controls">
                            <button class="sound-toggle ${isSoundEnabled ? 'active' : 'muted'}" id="sound-toggle">
                                ${isSoundEnabled ? '🔊' : '🔇'}
                                <span class="sound-label">${isSoundEnabled ? 'Звук Вкл' : 'Звук Выкл'}</span>
                            </button>
                            <span class="sound-status" id="sound-status">
                                <span class="sound-indicator ${isSoundLoaded ? 'on' : 'off'}"></span>
                                ${isSoundLoaded ? 'Ding-ding.mp3' : 'Загрузка...'}
                            </span>
                        </div>
                        <span class="ws-status" id="ws-status">⚡ Подключение...</span>
                        <span class="last-update" id="last-update">--:--:--</span>
                    </div>
                </div>

                <div class="tf-group" id="tf-group">
                    ${CONFIG.timeframes.map(tf => `
                        <button class="tf-btn ${tf === '1h' ? 'active' : ''}" data-tf="${tf}">${tf}</button>
                    `).join('')}
                </div>

                <div class="signal-grid" id="signal-grid">
                    ${CONFIG.assets.map(asset => `
                        <div class="signal-card neutral" data-asset="${asset}">
                            <div class="signal-strength-badge" id="badge-${asset}"></div>
                            <div class="card-header">
                                <span class="asset-name">${ASSET_DISPLAY_NAMES[asset] || asset}</span>
                                <span class="asset-price">--</span>
                            </div>
                            <div class="card-body">
                                <span class="signal-direction">⏳ Ожидание</span>
                                <span class="signal-confidence">--%</span>
                            </div>
                            <div class="indicators-grid" id="indicators-${asset}">
                                ${['rsi', 'macd', 'ema', 'cvd', 'bb', 'volume', 'poc'].map(ind => `
                                    <div class="indicator-item" data-indicator="${ind}">
                                        <span class="ind-label">${INDICATOR_LABELS[ind]}</span>
                                        <div class="indicator-bar-wrap">
                                            <div class="indicator-bar-fill neutral" style="width:0%"></div>
                                        </div>
                                        <span class="ind-value neutral">--</span>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="action-indicators" id="action-${asset}">
                                <div class="action-indicator wait" data-action="wait">
                                    <span class="label">⏸️ Ждать</span>
                                    <span class="value">0%</span>
                                    <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
                                </div>
                                <div class="action-indicator buy" data-action="buy">
                                    <span class="label">📈 Купить</span>
                                    <span class="value">0%</span>
                                    <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
                                </div>
                                <div class="action-indicator sell" data-action="sell">
                                    <span class="label">📉 Продать</span>
                                    <span class="value">0%</span>
                                    <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
                                </div>
                            </div>
                            <div class="card-footer">
                                <span class="tf-signal">--</span>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="trade-history-section">
                    <div class="trade-history-header">
                        <div class="trade-history-title">📊 История торговли — это бэктест (backtesting) вашей стратегии на исторических данных. <span id="history-asset-count">(загружается...)</span></div>
                        <div class="trade-history-stats" id="trade-stats">
                            <div class="stat-item">Всего: <span class="stat-value total" id="stat-total">0</span></div>
                            <div class="stat-item">✅ Win: <span class="stat-value win" id="stat-wins">0</span></div>
                            <div class="stat-item">❌ Loss: <span class="stat-value loss" id="stat-losses">0</span></div>
                            <div class="stat-item">📈 Win Rate: <span class="stat-value" id="stat-winrate" style="color:#fbbf24;">0%</span></div>
                            <div class="stat-item">💰 P/L: <span class="stat-value" id="stat-pl" style="color:#94a3b8;">$0</span></div>
                        </div>
                    </div>
                    <div class="trade-history-grid" id="trade-history-grid">
                        <div style="grid-column:1/-1; text-align:center; color:#475569; font-size:12px; padding:20px;">⏳ Загрузка исторических данных...</div>
                    </div>
                </div>

                <div class="widget-footer">
                    <div class="footer-stat">⚡ <span id="signal-count">0</span> активных сигналов</div>
                    <div class="footer-stat">🎯 Уверенность: <span style="color:#e2e8f0;">>75% Сильный</span></div>
                    <div class="footer-stat">📊 <span id="cache-status">Кэш готов</span></div>
                    <div class="footer-stat">🔗 <span id="connection-info">WebSocket</span></div>
                    <div class="footer-stat">📈 <span id="history-status">История: загрузка...</span></div>
                    <div class="footer-stat">🪙 <span id="asset-count">${CONFIG.assets.length} активов</span></div>
                    <div class="footer-stat">🌐 <span id="exchange-info">Биржи: мульти</span></div>
                    <div class="footer-stat">⏱️ <span id="tf-info">5 таймфреймов</span></div>
                    <div class="footer-stat">🔔 <span id="visual-status">Мерцание: активно</span></div>
                    <div class="footer-stat">🔊 <span id="sound-status-footer">Звук: ${isSoundEnabled ? 'Вкл' : 'Выкл'}</span></div>
                </div>

                <div class="documentation-section" id="doc-section">
                    <h3>📖 Документация-инструкция: Действия при сигналах</h3>
                    <div class="doc-grid" id="doc-grid">
                        ${CONFIG.timeframes.map(tf => {
                            const guide = TRADING_GUIDE[tf];
                            if (!guide) return '';
                            return `
                                <div class="doc-card" data-tf="${tf}">
                                    <div class="tf-name">${guide.icon} ${guide.name}</div>
                                    <div style="margin:4px 0; font-size:11px;">
                                        <span class="action-buy">📈 BUY:</span> ${guide.action.BUY}
                                    </div>
                                    <div style="margin:4px 0; font-size:11px;">
                                        <span class="action-sell">📉 SELL:</span> ${guide.action.SELL}
                                    </div>
                                    <div style="margin:4px 0; font-size:11px;">
                                        <span class="action-wait">⏸️ WAIT:</span> ${guide.action.WAIT}
                                    </div>
                                    <div style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05);">
                                        <div><span class="risk-label">Риск:</span> <span class="risk-value" style="color:${guide.riskLevel === 'high' ? '#f87171' : guide.riskLevel === 'medium-high' ? '#fbbf24' : guide.riskLevel === 'medium' ? '#60a5fa' : '#34d399'}">${guide.risk}</span></div>
                                        <div><span class="risk-label">Размер позиции:</span> <span class="risk-value">${guide.positionSize}</span></div>
                                        <div><span class="risk-label">Стоп-лосс:</span> <span class="risk-value" style="color:#f87171;">${guide.stopLoss}</span></div>
                                        <div><span class="risk-label">Тейк-профит:</span> <span class="risk-value" style="color:#34d399;">${guide.takeProfit}</span></div>
                                        <div><span class="risk-label">Рекомендация:</span> <span class="risk-value">${guide.recommended}</span></div>
                                        <div><span class="risk-label">Уверенность:</span> <span class="risk-value">${guide.confidence}</span></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="doc-legend">
                        <span class="legend-item"><span class="legend-dot buy-dot"></span> BUY — Покупка</span>
                        <span class="legend-item"><span class="legend-dot sell-dot"></span> SELL — Продажа</span>
                        <span class="legend-item"><span class="legend-dot wait-dot"></span> WAIT — Ожидание</span>
                        <span class="legend-item"><span class="legend-dot strong-dot"></span> Strong (>75%)</span>
                        <span class="legend-item" style="color:#fbbf24;">🟢 Мерцание BUY</span>
                        <span class="legend-item" style="color:#fbbf24;">🔴 Мерцание SELL</span>
                        <span class="legend-item" style="color:#64748b;">⚠️ Риск-менеджмент обязателен!</span>
                        <span class="legend-item" style="color:#fbbf24;">🔊 Звук при ≥75%</span>
                    </div>
                    <div style="margin-top:8px; padding:8px 12px; background:rgba(255,255,255,0.03); border-radius:8px; font-size:11px; color:#94a3b8;">
                        <strong style="color:#e2e8f0;">📌 Общие правила:</strong><br>
                        • Используйте 4H как основной таймфрейм для входа<br>
                        • 1H и 2H — для уточнения точек входа<br>
                        • 15m — только для скальпинга (опытные трейдеры)<br>
                        • 1D — для долгосрочных инвестиций<br>
                        • Всегда используйте стоп-лосс!<br>
                        • Не рискуйте более 2-3% депозита на одну сделку<br>
                        • Диверсифицируйте активы (не более 30% в один актив)<br>
                        🔊 <strong style="color:#fbbf24;">Звук:</strong> Активируется при сигнале BUY или SELL с уверенностью ≥ 75%
                    </div>
                </div>
            </div>
        `;

        // Сохраняем ссылки
        els.grid = document.getElementById('signal-grid');
        els.status = document.getElementById('ws-status');
        els.lastUpdate = document.getElementById('last-update');
        els.signalCount = document.getElementById('signal-count');
        els.cacheStatus = document.getElementById('cache-status');
        els.connectionInfo = document.getElementById('connection-info');
        els.historyGrid = document.getElementById('trade-history-grid');
        els.historyAssetCount = document.getElementById('history-asset-count');
        els.historyStatus = document.getElementById('history-status');
        els.assetCount = document.getElementById('asset-count');
        els.exchangeInfo = document.getElementById('exchange-info');
        els.tfInfo = document.getElementById('tf-info');
        els.visualStatus = document.getElementById('visual-status');
        els.docGrid = document.getElementById('doc-grid');
        els.tfButtons = document.querySelectorAll('.tf-btn');
        els.soundToggle = document.getElementById('sound-toggle');
        els.soundStatus = document.getElementById('sound-status');
        els.soundStatusFooter = document.getElementById('sound-status-footer');

        els.statTotal = document.getElementById('stat-total');
        els.statWins = document.getElementById('stat-wins');
        els.statLosses = document.getElementById('stat-losses');
        els.statWinrate = document.getElementById('stat-winrate');
        els.statPl = document.getElementById('stat-pl');

        if (els.tfInfo) els.tfInfo.textContent = `${CONFIG.timeframes.length} таймфреймов`;
        if (els.visualStatus) els.visualStatus.textContent = '🔔 Мерцание: активно';

        // --- Обработчик кнопки звука ---
        if (els.soundToggle) {
            els.soundToggle.addEventListener('click', function() {
                const enabled = SoundSystem.toggle();
                this.className = `sound-toggle ${enabled ? 'active' : 'muted'}`;
                this.innerHTML = `
                    ${enabled ? '🔊' : '🔇'}
                    <span class="sound-label">${enabled ? 'Звук Вкл' : 'Звук Выкл'}</span>
                `;
                if (els.soundStatusFooter) {
                    els.soundStatusFooter.textContent = `Звук: ${enabled ? 'Вкл' : 'Выкл'}`;
                }
                console.log(`🔊 Звук ${enabled ? 'включен' : 'выключен'}`);
            });
        }

        // --- Обработчики таймфреймов ---
        els.tfButtons.forEach(btn => {
            btn.addEventListener('click', function(e) {
                els.tfButtons.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                state.currentTF = this.dataset.tf;
                generateSignals();
                if (els.docGrid) {
                    const cards = els.docGrid.querySelectorAll('.doc-card');
                    cards.forEach(card => {
                        card.style.borderColor = 'rgba(255,255,255,0.05)';
                        card.style.background = 'rgba(255,255,255,0.03)';
                        if (card.dataset.tf === state.currentTF) {
                            card.style.borderColor = 'rgba(96,165,250,0.3)';
                            card.style.background = 'rgba(96,165,250,0.08)';
                        }
                    });
                }
            });
        });

        setTimeout(() => {
            if (els.docGrid) {
                const cards = els.docGrid.querySelectorAll('.doc-card');
                cards.forEach(card => {
                    if (card.dataset.tf === state.currentTF) {
                        card.style.borderColor = 'rgba(96,165,250,0.3)';
                        card.style.background = 'rgba(96,165,250,0.08)';
                    }
                });
            }
        }, 100);
    }

    // ============================================================
    //  WEB SOCKET
    // ============================================================

    function setupWebSocket() {
        const streams = CONFIG.assets
            .map(a => `${CONFIG.symbolMap[a].toLowerCase()}@kline_1m`)
            .join('/');

        try {
            state.ws = new WebSocket(`${CONFIG.wsEndpoint}/${streams}`);

            state.ws.onopen = function() {
                state.isConnected = true;
                state.reconnectAttempts = 0;
                updateStatus('🟢 Live', '#34d399');
                if (els.connectionInfo) {
                    els.connectionInfo.textContent = '🟢 Подключен';
                    els.connectionInfo.style.color = '#34d399';
                }
                if (els.exchangeInfo) {
                    els.exchangeInfo.textContent = '🌐 Binance WS + Мульти REST';
                }
            };

            state.ws.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    if (data && data.k) {
                        handleKlineData(data);
                    }
                } catch (error) {}
            };

            state.ws.onerror = function(error) {
                console.warn('⚠️ Ошибка WebSocket:', error);
                updateStatus('⚠️ Ошибка', '#f87171');
            };

            state.ws.onclose = function() {
                state.isConnected = false;
                updateStatus('🔴 Переподключение...', '#f87171');
                if (els.connectionInfo) {
                    els.connectionInfo.textContent = '🔴 Отключен';
                    els.connectionInfo.style.color = '#f87171';
                }
                reconnectWebSocket();
            };
        } catch (e) {
            console.warn('⚠️ Ошибка создания WebSocket:', e);
        }
    }

    function reconnectWebSocket() {
        if (state.reconnectAttempts >= state.maxReconnectAttempts) {
            updateStatus('❌ Ошибка', '#ef4444');
            return;
        }
        state.reconnectAttempts++;
        const delay = Math.min(1000 * state.reconnectAttempts, 30000);
        setTimeout(() => {
            if (!state.isConnected) {
                setupWebSocket();
            }
        }, delay);
    }

    function updateStatus(text, color) {
        if (els.status) {
            els.status.textContent = text;
            els.status.style.color = color || '#94a3b8';
        }
    }

    // ============================================================
    //  ОБРАБОТКА ДАННЫХ
    // ============================================================

    function handleKlineData(data) {
        const k = data.k;
        const symbol = data.s;
        const asset = Object.keys(CONFIG.symbolMap).find(
            key => CONFIG.symbolMap[key] === symbol
        );

        if (!asset || !CONFIG.assets.includes(asset)) return;

        if (!state.marketData.has(asset)) {
            state.marketData.set(asset, []);
        }

        const candles = state.marketData.get(asset);
        candles.push({
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            time: k.T
        });

        if (candles.length > CONFIG.maxCandles) {
            candles.splice(0, 100);
        }

        if (!state.signalThrottle) {
            state.signalThrottle = setTimeout(() => {
                generateSignals();
                state.signalThrottle = null;
            }, 30000);
        }

        updatePriceDisplay(asset, parseFloat(k.c));
    }

    function updatePriceDisplay(asset, price) {
        const card = els.grid?.querySelector(`[data-asset="${asset}"]`);
        if (!card) return;
        const priceEl = card.querySelector('.asset-price');
        if (priceEl) {
            priceEl.textContent = `$${price.toFixed(2)}`;
        }
    }

    // ============================================================
    //  ИНДИКАТОРЫ
    // ============================================================

    function calculateRSI(data, period) {
        if (!data || data.length < period + 1) {
            return Array(data ? data.length : 1).fill(50);
        }
        const changes = [];
        for (let i = 1; i < data.length; i++) {
            changes.push(data[i] - data[i - 1]);
        }
        let avgGain = 0,
            avgLoss = 0;
        const len = Math.min(period, changes.length);
        for (let i = 0; i < len; i++) {
            if (changes[i] >= 0) avgGain += changes[i];
            else avgLoss += Math.abs(changes[i]);
        }
        avgGain /= period;
        avgLoss /= period || 1;
        const rsi = [100 - (100 / (1 + (avgGain / (avgLoss || 1))))];
        for (let i = period; i < changes.length; i++) {
            const gain = changes[i] >= 0 ? changes[i] : 0;
            const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
            avgGain = ((avgGain * (period - 1)) + gain) / period;
            avgLoss = ((avgLoss * (period - 1)) + loss) / period;
            rsi.push(100 - (100 / (1 + (avgGain / (avgLoss || 1)))));
        }
        return rsi;
    }

    function calculateEMA(data, period) {
        if (!data || data.length === 0) return [];
        const ema = [];
        const k = 2 / (period + 1);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            if (i < period) {
                sum += data[i];
                ema.push(sum / (i + 1));
            } else {
                ema.push((data[i] * k) + (ema[i - 1] * (1 - k)));
            }
        }
        return ema;
    }

    function calculateMACD(data, fast, slow, signal) {
        if (!data || data.length < slow) {
            return { macd: [], signal: [], histogram: [] };
        }
        const emaFast = calculateEMA(data, fast);
        const emaSlow = calculateEMA(data, slow);
        const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
        const signalLine = calculateEMA(macdLine.slice(slow - fast), signal);
        const histogram = macdLine.slice(slow - fast).map((v, i) => v - signalLine[i]);
        return {
            macd: macdLine.slice(slow - fast),
            signal: signalLine,
            histogram: histogram
        };
    }

    function calculateATR(candles, period) {
        if (!candles || candles.length < period + 1) {
            return Array(candles ? candles.length : 1).fill(0.01);
        }
        const tr = [];
        for (let i = 1; i < candles.length; i++) {
            const h = candles[i].high;
            const l = candles[i].low;
            const pc = candles[i - 1].close;
            tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
        }
        const atr = [];
        let sum = 0;
        for (let i = 0; i < tr.length; i++) {
            if (i < period) {
                sum += tr[i];
                atr.push(sum / (i + 1));
            } else {
                atr.push(((atr[i - 1] * (period - 1)) + tr[i]) / period);
            }
        }
        return atr;
    }

    function calculatePOC(candles) {
        if (!candles || candles.length === 0) return 0;
        const priceLevels = new Map();
        const minP = Math.min(...candles.map(c => c.low));
        const maxP = Math.max(...candles.map(c => c.high));
        const bucketSize = (maxP - minP) / 50 || 0.01;
        candles.forEach(c => {
            const bucket = Math.floor(c.close / (bucketSize || 0.01));
            priceLevels.set(bucket, (priceLevels.get(bucket) || 0) + c.volume);
        });
        let maxVol = 0,
            pocBucket = 0;
        for (const [bucket, vol] of priceLevels) {
            if (vol > maxVol) { maxVol = vol;
                pocBucket = bucket; }
        }
        return pocBucket * (bucketSize || 0.01) + (bucketSize || 0.01) / 2;
    }

    function calculateCVD(candles) {
        if (!candles || candles.length < 2) return [];
        const cvd = [];
        let cum = 0;
        for (let i = 1; i < candles.length; i++) {
            const change = candles[i].close - candles[i - 1].close;
            const vol = candles[i].volume;
            const delta = change > 0 ? vol * (change / candles[i - 1].close) :
                change < 0 ? -vol * (Math.abs(change) / candles[i - 1].close) : 0;
            cum += delta;
            cvd.push(cum);
        }
        return cvd;
    }

    function calculateBB(data, period, stdDev) {
        if (!data || data.length < period) {
            return { upper: [], middle: [], lower: [] };
        }
        const upper = [],
            middle = [],
            lower = [];
        for (let i = period - 1; i < data.length; i++) {
            const slice = data.slice(i - period + 1, i + 1);
            const mean = slice.reduce((a, b) => a + b, 0) / period;
            const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
            const std = Math.sqrt(variance);
            middle.push(mean);
            upper.push(mean + stdDev * std);
            lower.push(mean - stdDev * std);
        }
        return { upper, middle, lower };
    }

    function aggregateCandles(candles, tf) {
        if (!candles || candles.length === 0) return [];
        const tfMap = { '15m': 15, '1h': 60, '2h': 120, '4h': 240, '1d': 1440 };
        const minutes = tfMap[tf] || 60;
        const agg = [];
        let current = null;
        for (const c of candles) {
            if (!current) { current = { ...c };
                continue; }
            const diff = (c.time - current.time) / (60 * 1000);
            if (diff >= minutes) {
                agg.push(current);
                current = { ...c };
            } else {
                current.high = Math.max(current.high, c.high);
                current.low = Math.min(current.low, c.low);
                current.close = c.close;
                current.volume += c.volume;
            }
        }
        if (current) agg.push(current);
        return agg;
    }

    // ============================================================
    //  ГЕНЕРАЦИЯ СИГНАЛА
    // ============================================================

    function calculateActionProbabilities(indicators, netScore, buyScore, sellScore, maxScore) {
        let buyProb = Math.min((buyScore / maxScore) * 100, 100);
        let sellProb = Math.min((sellScore / maxScore) * 100, 100);

        const trendStrength = indicators.trendStrength || 0;
        const bbWidth = parseFloat(indicators.bbWidth) || 10;

        if (bbWidth < 5) {
            buyProb = buyProb * 0.7;
            sellProb = sellProb * 0.7;
        }

        if (Math.abs(trendStrength) > 2) {
            if (trendStrength > 0) {
                buyProb = Math.min(buyProb * 1.3, 100);
                sellProb = sellProb * 0.7;
            } else {
                sellProb = Math.min(sellProb * 1.3, 100);
                buyProb = buyProb * 0.7;
            }
        }

        let waitProb = Math.max(100 - (buyProb + sellProb), 0);

        buyProb = Math.round(Math.max(0, Math.min(buyProb, 100)));
        sellProb = Math.round(Math.max(0, Math.min(sellProb, 100)));
        waitProb = Math.round(Math.max(0, Math.min(100 - buyProb - sellProb, 100)));

        return { wait: waitProb, buy: buyProb, sell: sellProb };
    }

    function createEmptySignal(asset, tf, status) {
        status = status || '⏳ Загрузка...';
        const emptyIndicators = {
            rsi: 0,
            macd: 0,
            ema: 0,
            cvd: 0,
            bb: 0,
            volume: 0,
            poc: 0
        };
        state.indicatorScores.set(asset, emptyIndicators);
        return {
            asset: asset,
            timeframe: tf || '1h',
            direction: 'NEUTRAL',
            confidence: 0,
            rawScore: { buy: 0, sell: 0, net: 0 },
            price: 0,
            timestamp: Date.now(),
            indicators: {
                rsi: 0,
                macd: '0',
                ema8: '0',
                ema50: '0',
                atr: '0',
                bbWidth: '0',
                trendStrength: '0'
            },
            actionProbabilities: { wait: 100, buy: 0, sell: 0 },
            indicatorScores: emptyIndicators,
            status: status
        };
    }

    function generateSignal(asset, tf) {
        tf = tf || state.currentTF || '1h';
        let rawCandles = state.marketData.get(asset);

        if (!rawCandles || rawCandles.length < CONFIG.minCandlesRequired) {
            if (!state.loadingStatus[asset]) {
                state.loadingStatus[asset] = true;
                loadAssetData(asset).then(() => {
                    state.loadingStatus[asset] = false;
                    generateSignals();
                });
            }
            return createEmptySignal(asset, tf, '⏳ Загрузка...');
        }

        const candles = aggregateCandles(rawCandles, tf);
        if (!candles || candles.length < CONFIG.minCandlesRequired) {
            return createEmptySignal(asset, tf, '⏳ Недостаточно данных');
        }

        const closes = candles.map(c => c.close);
        const volumes = candles.map(c => c.volume);

        // ---- ВЫЧИСЛЕНИЕ ВСЕХ 7 ИНДИКАТОРОВ ----
        const rsi = calculateRSI(closes, 14);
        const currentRSI = rsi.length > 0 ? rsi[rsi.length - 1] : 50;

        const macd = calculateMACD(closes, 12, 26, 9);
        const hist = macd.histogram;
        const currentHist = hist.length > 0 ? hist[hist.length - 1] : 0;
        const currentMACD = macd.macd.length > 0 ? macd.macd[macd.macd.length - 1] : 0;
        const currentSignal = macd.signal.length > 0 ? macd.signal[macd.signal.length - 1] : 0;
        const prevHist = hist.length > 1 ? hist[hist.length - 2] : currentHist;

        const ema8 = calculateEMA(closes, 8);
        const ema13 = calculateEMA(closes, 13);
        const ema21 = calculateEMA(closes, 21);
        const ema50 = calculateEMA(closes, 50);
        const close = closes[closes.length - 1];
        const e8 = ema8.length > 0 ? ema8[ema8.length - 1] : close;
        const e13 = ema13.length > 0 ? ema13[ema13.length - 1] : close;
        const e21 = ema21.length > 0 ? ema21[ema21.length - 1] : close;
        const e50 = ema50.length > 0 ? ema50[ema50.length - 1] : close;

        const atrArr = calculateATR(candles, 14);
        const atr = atrArr.length > 0 ? atrArr[atrArr.length - 1] : 0.01;

        const poc = calculatePOC(candles);

        const cvdArr = calculateCVD(candles);
        const cvd = cvdArr.length > 0 ? cvdArr[cvdArr.length - 1] : 0;
        const cvdPrev = cvdArr.length > 1 ? cvdArr[cvdArr.length - 2] : cvd;

        const bb = calculateBB(closes, 20, 2);
        const bbUpper = bb.upper.length > 0 ? bb.upper[bb.upper.length - 1] : close * 1.05;
        const bbLower = bb.lower.length > 0 ? bb.lower[bb.lower.length - 1] : close * 0.95;
        const bbMiddle = bb.middle.length > 0 ? bb.middle[bb.middle.length - 1] : close;
        const bbWidth = (bbUpper - bbLower) / (bbMiddle || 1);

        const vol = volumes[volumes.length - 1] || 0;
        const volAvg = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20 || 1;

        // ---- СКОРИНГ ----
        let buyScore = 0,
            sellScore = 0;
        const indicatorDetails = {};

        // 1. RSI (15%)
        let rsiScore = 0;
        if (currentRSI < 30) { buyScore += 15;
            rsiScore = 15; } else if (currentRSI > 70) { sellScore += 15;
            rsiScore = -15; } else if (currentRSI < 40) { buyScore += 5;
            rsiScore = 5; } else if (currentRSI > 60) { sellScore += 5;
            rsiScore = -5; }
        indicatorDetails.rsi = rsiScore;

        // 2. MACD (20%)
        let macdScore = 0;
        if (currentHist > 0 && currentMACD > currentSignal) { buyScore += 20;
            macdScore = 20; } else if (currentHist < 0 && currentMACD < currentSignal) { sellScore += 20;
            macdScore = -20; } else if (currentHist > prevHist) { buyScore += 10;
            macdScore = 10; } else if (currentHist < prevHist) { sellScore += 10;
            macdScore = -10; }
        indicatorDetails.macd = macdScore;

        // 3. EMA Ribbon (20%)
        let emaScore = 0;
        if (close > e8 && e8 > e13 && e13 > e21 && e21 > e50) { buyScore += 20;
            emaScore = 20; } else if (close < e8 && e8 < e13 && e13 < e21 && e21 < e50) { sellScore += 20;
            emaScore = -20; }
        indicatorDetails.ema = emaScore;

        // 4. CVD (15%)
        let cvdScore = 0;
        if (cvd > cvdPrev && cvd > 0) { buyScore += 15;
            cvdScore = 15; } else if (cvd < cvdPrev && cvd < 0) { sellScore += 15;
            cvdScore = -15; }
        indicatorDetails.cvd = cvdScore;

        // 5. Bollinger Bands (15%)
        let bbScore = 0;
        if (close < bbLower) { buyScore += 15;
            bbScore = 15; } else if (close > bbUpper) { sellScore += 15;
            bbScore = -15; } else if (bbWidth < 0.1 && close > bbMiddle) { buyScore += 10;
            bbScore = 10; } else if (bbWidth < 0.1 && close < bbMiddle) { sellScore += 10;
            bbScore = -10; }
        indicatorDetails.bb = bbScore;

        // 6. Volume Spike (10%)
        let volScore = 0;
        const volRatio = vol / (volAvg || 1);
        if (volRatio > 1.5 && close > e8) { buyScore += 10;
            volScore = 10; } else if (volRatio > 1.5 && close < e8) { sellScore += 10;
            volScore = -10; }
        indicatorDetails.volume = volScore;

        // 7. POC (5%)
        let pocScore = 0;
        const pocDist = Math.abs(close - poc) / (atr || 0.01);
        if (pocDist < 0.2 && close > e8) { buyScore += 5;
            pocScore = 5; } else if (pocDist < 0.2 && close < e8) { sellScore += 5;
            pocScore = -5; }
        indicatorDetails.poc = pocScore;

        const netScore = buyScore - sellScore;
        const confidence = Math.min(Math.abs(netScore), 100);
        const trendStrength = (close - e50) / (atr || 0.01);

        let direction = 'NEUTRAL';
        let finalConfidence = confidence;

        if (netScore > 30 && trendStrength > -1) {
            direction = 'BUY';
        } else if (netScore < -30 && trendStrength < 1) {
            direction = 'SELL';
        } else if (Math.abs(netScore) < 30 && bbWidth < 0.08) {
            direction = 'NEUTRAL';
            finalConfidence = 40;
        } else {
            direction = 'NEUTRAL';
            finalConfidence = Math.min(confidence, 50);
        }

        const indicators = {
            rsi: currentRSI,
            macd: currentHist,
            bbWidth: (bbWidth * 100),
            trendStrength: trendStrength,
            close: close,
            e50: e50,
            atr: atr
        };

        const actionProbs = calculateActionProbabilities(
            indicators,
            netScore,
            buyScore,
            sellScore,
            100
        );

        state.indicatorScores.set(asset, indicatorDetails);

        return {
            asset: asset,
            timeframe: tf,
            direction: direction,
            confidence: Math.round(finalConfidence),
            rawScore: {
                buy: Math.round(buyScore),
                sell: Math.round(sellScore),
                net: Math.round(netScore)
            },
            price: close,
            timestamp: Date.now(),
            indicators: {
                rsi: Math.round(currentRSI),
                macd: currentHist.toFixed(4),
                ema8: e8.toFixed(2),
                ema50: e50.toFixed(2),
                atr: atr.toFixed(2),
                bbWidth: (bbWidth * 100).toFixed(1),
                trendStrength: trendStrength.toFixed(2)
            },
            actionProbabilities: actionProbs,
            indicatorScores: indicatorDetails,
            status: 'Активен'
        };
    }

    // ============================================================
    //  ЗАГРУЗКА ДАННЫХ
    // ============================================================

    async function loadAssetData(asset) {
        const symbol = CONFIG.symbolMap[asset];
        if (!symbol) return false;

        try {
            const candles = await fetchHistoricalData(symbol, CONFIG.historyCandles, '1h');

            if (candles && candles.length > 0) {
                if (!state.marketData.has(asset)) {
                    state.marketData.set(asset, []);
                }
                const existing = state.marketData.get(asset) || [];
                const merged = [...candles, ...existing];
                const unique = merged.filter((c, index, self) =>
                    index === self.findIndex(t => t.time === c.time)
                );
                unique.sort((a, b) => a.time - b.time);
                state.marketData.set(asset, unique);
                state.assetAvailability[asset] = true;
                return true;
            } else {
                state.assetAvailability[asset] = false;
                return false;
            }
        } catch (error) {
            state.assetAvailability[asset] = false;
            return false;
        }
    }

    async function loadAllAssetsData() {
        const loadingPromises = CONFIG.assets.map(asset => loadAssetData(asset));
        const results = await Promise.all(loadingPromises);
        const loadedCount = results.filter(r => r === true).length;
        return loadedCount;
    }

    // ============================================================
    //  ВИЗУАЛИЗАЦИЯ СИГНАЛОВ (С ЗВУКОВЫМ ОПОВЕЩЕНИЕМ)
    // ============================================================

    function updateSignalVisualization(asset, direction, confidence) {
        const card = els.grid?.querySelector(`[data-asset="${asset}"]`);
        if (!card) return;

        const badge = card.querySelector('.signal-strength-badge');

        const currentClasses = card.className.split(' ');
        const keepClasses = currentClasses.filter(cls =>
            !cls.startsWith('buy-') &&
            !cls.startsWith('sell-') &&
            cls !== 'neutral'
        );
        card.className = keepClasses.join(' ');

        if (badge) {
            badge.className = 'signal-strength-badge';
            badge.textContent = '';
        }

        if (direction === 'NEUTRAL' || confidence < 60) {
            card.classList.add('neutral');
            return;
        }

        let signalClass = '';
        let badgeText = '';
        let badgeClass = '';
        let signalType = '';

        if (direction === 'BUY') {
            signalType = 'BUY';
            if (confidence >= 80) {
                signalClass = 'buy-80';
                badgeText = '🔥 СИЛЬНЫЙ BUY';
                badgeClass = 'buy-strong';
            } else if (confidence >= 75) {
                signalClass = 'buy-75';
                badgeText = '💪 BUY 75%+';
                badgeClass = 'buy-strong';
            } else if (confidence >= 70) {
                signalClass = 'buy-70';
                badgeText = '📈 BUY 70%+';
                badgeClass = 'buy';
            } else if (confidence >= 65) {
                signalClass = 'buy-65';
                badgeText = '📈 BUY 65%+';
                badgeClass = 'buy';
            } else if (confidence >= 60) {
                signalClass = 'buy-60';
                badgeText = '📈 BUY 60%+';
                badgeClass = 'buy';
            }
        } else if (direction === 'SELL') {
            signalType = 'SELL';
            if (confidence >= 80) {
                signalClass = 'sell-80';
                badgeText = '🔥 СИЛЬНЫЙ SELL';
                badgeClass = 'sell-strong';
            } else if (confidence >= 75) {
                signalClass = 'sell-75';
                badgeText = '💪 SELL 75%+';
                badgeClass = 'sell-strong';
            } else if (confidence >= 70) {
                signalClass = 'sell-70';
                badgeText = '📉 SELL 70%+';
                badgeClass = 'sell';
            } else if (confidence >= 65) {
                signalClass = 'sell-65';
                badgeText = '📉 SELL 65%+';
                badgeClass = 'sell';
            } else if (confidence >= 60) {
                signalClass = 'sell-60';
                badgeText = '📉 SELL 60%+';
                badgeClass = 'sell';
            }
        }

        if (signalClass) {
            card.classList.add(signalClass);
        }

        if (badge && badgeText) {
            badge.textContent = badgeText;
            badge.className = `signal-strength-badge visible ${badgeClass}`;
        }

        // --- ЗВУКОВОЕ ОПОВЕЩЕНИЕ ---
        // Проверяем, достиг ли сигнал порога 75%
        if (confidence >= CONFIG.sound.threshold && signalType) {
            // Проверяем, изменился ли сигнал
            const prevSignal = state.previousSignals.get(asset);
            const currentSignal = `${direction}-${confidence}`;
            
            // Воспроизводим звук, если сигнал новый или изменился
            if (prevSignal !== currentSignal) {
                SoundSystem.playSound(signalType, asset, confidence);
                state.previousSignals.set(asset, currentSignal);
            }
        }
    }

    // ============================================================
    //  ОБНОВЛЕНИЕ UI
    // ============================================================

    function generateSignals() {
        const tf = state.currentTF || '1h';

        CONFIG.assets.forEach(asset => {
            const signal = generateSignal(asset, tf);
            if (signal) {
                state.signals.set(asset, signal);
                updateSignalCard(asset, signal);
                updateActionIndicators(asset, signal.actionProbabilities);
                updateIndicatorDisplay(asset, signal.indicatorScores);
                updateSignalVisualization(asset, signal.direction, signal.confidence);
            }
        });

        const active = Array.from(state.signals.values())
            .filter(s => s && s.direction !== 'NEUTRAL' && s.confidence > 45);

        if (els.signalCount) els.signalCount.textContent = active.length;
        if (els.lastUpdate) els.lastUpdate.textContent = new Date().toLocaleTimeString();
        if (els.cacheStatus) els.cacheStatus.textContent = `📊 ${state.marketData.size} активов в кэше`;
    }

    function updateIndicatorDisplay(asset, scores) {
        if (!scores) return;

        const card = els.grid?.querySelector(`[data-asset="${asset}"]`);
        if (!card) return;

        const indicatorsContainer = card.querySelector('.indicators-grid');
        if (!indicatorsContainer) return;

        const items = indicatorsContainer.querySelectorAll('.indicator-item');
        const indicatorKeys = ['rsi', 'macd', 'ema', 'cvd', 'bb', 'volume', 'poc'];
        const maxScore = 20;

        items.forEach((item, index) => {
            const key = indicatorKeys[index];
            const score = scores[key] !== undefined ? scores[key] : 0;

            const valueEl = item.querySelector('.ind-value');
            const barFill = item.querySelector('.indicator-bar-fill');

            if (!valueEl || !barFill) return;

            let direction = 'neutral';
            let displayValue = '0%';

            if (score > 0) {
                const percent = Math.min((score / maxScore) * 100, 100);
                displayValue = `+${Math.round(percent)}%`;
                direction = score >= 15 ? 'strong-bullish' : 'bullish';
            } else if (score < 0) {
                const percent = Math.min((Math.abs(score) / maxScore) * 100, 100);
                displayValue = `-${Math.round(percent)}%`;
                direction = Math.abs(score) >= 15 ? 'strong-bearish' : 'bearish';
            } else {
                displayValue = '0%';
                direction = 'neutral';
            }

            valueEl.textContent = displayValue;
            valueEl.className = `ind-value ${direction}`;

            const barPercent = Math.min(Math.abs(score) / maxScore * 100, 100);
            barFill.style.width = `${barPercent}%`;
            barFill.className = `indicator-bar-fill ${direction === 'strong-bullish' || direction === 'bullish' ? 'bullish' : 
                                                 direction === 'strong-bearish' || direction === 'bearish' ? 'bearish' : 
                                                 'neutral'}`;
        });
    }

    function updateSignalCard(asset, signal) {
        if (!signal) return;
        const card = els.grid?.querySelector(`[data-asset="${asset}"]`);
        if (!card) return;

        const dirEl = card.querySelector('.signal-direction');
        const confEl = card.querySelector('.signal-confidence');
        const priceEl = card.querySelector('.asset-price');
        const tfEl = card.querySelector('.tf-signal');

        if (priceEl && signal.price) {
            priceEl.textContent = `$${signal.price.toFixed(2)}`;
        }

        let color, bgColor, icon;
        if (signal.direction === 'BUY') {
            color = '#34d399';
            bgColor = 'rgba(52,211,153,0.15)';
            icon = '📈';
        } else if (signal.direction === 'SELL') {
            color = '#f87171';
            bgColor = 'rgba(248,113,113,0.15)';
            icon = '📉';
        } else {
            color = '#94a3b8';
            bgColor = 'rgba(255,255,255,0.05)';
            icon = signal.status === '⏳ Загрузка...' ? '⏳' : '⏸️';
        }

        if (dirEl) {
            dirEl.textContent = `${icon} ${signal.direction || 'Ожидание'}`;
            dirEl.style.background = bgColor;
            dirEl.style.color = color;
        }

        if (confEl) {
            const conf = signal.confidence || 0;
            confEl.textContent = conf > 0 ? `${conf}%` : '--%';
            if (conf >= 75) confEl.style.color = '#34d399';
            else if (conf >= 60) confEl.style.color = '#fbbf24';
            else if (conf >= 45) confEl.style.color = '#f59e0b';
            else confEl.style.color = '#475569';
        }

        if (tfEl && signal.indicators) {
            tfEl.textContent = `RSI:${signal.indicators.rsi || 0} | MACD:${signal.indicators.macd || 0}`;
            tfEl.style.color = signal.confidence >= 60 ? '#94a3b8' : '#475569';
        }
    }

    function updateActionIndicators(asset, probs) {
        if (!probs) return;
        const card = els.grid?.querySelector(`[data-asset="${asset}"]`);
        if (!card) return;

        const container = card.querySelector('.action-indicators');
        if (!container) return;

        const indicators = container.querySelectorAll('.action-indicator');
        indicators.forEach(indicator => {
            const action = indicator.dataset.action;
            const valueEl = indicator.querySelector('.value');
            const barFill = indicator.querySelector('.bar-fill');
            if (!valueEl || !barFill) return;

            let percent = probs[action] || 0;
            valueEl.textContent = `${percent}%`;
            barFill.style.width = `${percent}%`;

            if (percent > 30) {
                indicator.classList.add('active');
            } else {
                indicator.classList.remove('active');
            }
        });
    }

    // ============================================================
    //  ИСТОРИЯ ТОРГОВЛИ
    // ============================================================

    async function loadHistoricalData() {
        if (state.historyLoaded) {
            loadTradeHistoryFromCache();
            return;
        }

        if (els.historyStatus) els.historyStatus.textContent = '⏳ Загрузка истории...';

        const loadedCount = await loadAllAssetsData();

        if (loadedCount === 0) {
            if (els.historyStatus) els.historyStatus.textContent = '⚠️ Нет данных';
            return;
        }

        try {
            const allTrades = [];

            for (const asset of CONFIG.assets) {
                const candles = state.marketData.get(asset);
                if (!candles || candles.length < 100) continue;

                const trades = runBacktest(asset, candles, '1h');
                allTrades.push(...trades);
            }

            state.tradeHistory = allTrades.sort((a, b) => b.entryTime - a.entryTime);

            try {
                localStorage.setItem('tradeHistory', JSON.stringify({
                    trades: state.tradeHistory,
                    timestamp: Date.now()
                }));
            } catch (e) {}

            state.historyLoaded = true;
            updateTradeStats();
            renderTradeHistory();

            if (els.historyStatus) els.historyStatus.textContent = `✅ История: ${state.tradeHistory.length} сделок`;
            if (els.historyAssetCount) els.historyAssetCount.textContent =
                `(${CONFIG.assets.length} активов, ${state.tradeHistory.length} сделок)`;

        } catch (error) {
            console.error('❌ Ошибка загрузки истории:', error);
            if (els.historyStatus) els.historyStatus.textContent = '⚠️ Ошибка истории';
            loadTradeHistoryFromCache();
        }
    }

    function runBacktest(asset, candles, tf) {
        const trades = [];
        let position = null;
        let entryPrice = 0;
        let entryTime = 0;
        let direction = '';

        const aggCandles = aggregateCandles(candles, tf);
        if (aggCandles.length < 100) return trades;

        const config = CONFIG.trading;

        for (let i = 100; i < aggCandles.length; i++) {
            const windowCandles = aggCandles.slice(0, i + 1);
            const currentCandle = windowCandles[windowCandles.length - 1];
            const price = currentCandle.close;

            const signal = generateSignalFromCandles(asset, windowCandles, tf);
            if (!signal) continue;

            if (!position) {
                if (signal.confidence >= config.minConfidence) {
                    if (signal.direction === 'BUY' || signal.direction === 'SELL') {
                        position = {
                            direction: signal.direction,
                            entryPrice: price,
                            entryTime: currentCandle.time,
                            asset: asset,
                            entryConfidence: signal.confidence
                        };
                        entryPrice = price;
                        entryTime = currentCandle.time;
                        direction = signal.direction;
                    }
                }
                continue;
            }

            if (position) {
                const profitPercent = ((price - entryPrice) / entryPrice) * 100;
                const isLong = direction === 'BUY';
                const currentProfit = isLong ? profitPercent : -profitPercent;

                if (currentProfit >= config.minProfitPercent) {
                    trades.push({
                        asset: asset,
                        direction: direction,
                        entryPrice: entryPrice,
                        exitPrice: price,
                        entryTime: entryTime,
                        exitTime: currentCandle.time,
                        profitPercent: currentProfit,
                        profit: (currentProfit / 100) * config.positionSize,
                        confidence: position.entryConfidence,
                        exitReason: 'take_profit'
                    });
                    position = null;
                    continue;
                }

                if (currentProfit <= -config.maxLossPercent) {
                    trades.push({
                        asset: asset,
                        direction: direction,
                        entryPrice: entryPrice,
                        exitPrice: price,
                        entryTime: entryTime,
                        exitTime: currentCandle.time,
                        profitPercent: currentProfit,
                        profit: (currentProfit / 100) * config.positionSize,
                        confidence: position.entryConfidence,
                        exitReason: 'stop_loss'
                    });
                    position = null;
                    continue;
                }

                const reverseSignal = generateSignalFromCandles(asset, windowCandles, tf);
                if (reverseSignal && reverseSignal.confidence >= config.minConfidence) {
                    const isOpposite = (direction === 'BUY' && reverseSignal.direction === 'SELL') ||
                        (direction === 'SELL' && reverseSignal.direction === 'BUY');
                    if (isOpposite) {
                        trades.push({
                            asset: asset,
                            direction: direction,
                            entryPrice: entryPrice,
                            exitPrice: price,
                            entryTime: entryTime,
                            exitTime: currentCandle.time,
                            profitPercent: currentProfit,
                            profit: (currentProfit / 100) * config.positionSize,
                            confidence: position.entryConfidence,
                            exitReason: 'reverse_signal'
                        });
                        position = null;
                        continue;
                    }
                }

                const candlesHeld = windowCandles.length - i + 50;
                if (candlesHeld > 50) {
                    trades.push({
                        asset: asset,
                        direction: direction,
                        entryPrice: entryPrice,
                        exitPrice: price,
                        entryTime: entryTime,
                        exitTime: currentCandle.time,
                        profitPercent: currentProfit,
                        profit: (currentProfit / 100) * config.positionSize,
                        confidence: position.entryConfidence,
                        exitReason: 'timeout'
                    });
                    position = null;
                    continue;
                }
            }
        }

        return trades;
    }

    function generateSignalFromCandles(asset, candles, tf) {
        if (!candles || candles.length < 100) return null;

        const closes = candles.map(c => c.close);
        const volumes = candles.map(c => c.volume);

        const rsi = calculateRSI(closes, 14);
        const currentRSI = rsi.length > 0 ? rsi[rsi.length - 1] : 50;

        const macd = calculateMACD(closes, 12, 26, 9);
        const hist = macd.histogram;
        const currentHist = hist.length > 0 ? hist[hist.length - 1] : 0;
        const currentMACD = macd.macd.length > 0 ? macd.macd[macd.macd.length - 1] : 0;
        const currentSignal = macd.signal.length > 0 ? macd.signal[macd.signal.length - 1] : 0;
        const prevHist = hist.length > 1 ? hist[hist.length - 2] : currentHist;

        const ema8 = calculateEMA(closes, 8);
        const ema13 = calculateEMA(closes, 13);
        const ema21 = calculateEMA(closes, 21);
        const ema50 = calculateEMA(closes, 50);
        const close = closes[closes.length - 1];
        const e8 = ema8.length > 0 ? ema8[ema8.length - 1] : close;
        const e13 = ema13.length > 0 ? ema13[ema13.length - 1] : close;
        const e21 = ema21.length > 0 ? ema21[ema21.length - 1] : close;
        const e50 = ema50.length > 0 ? ema50[ema50.length - 1] : close;

        const atrArr = calculateATR(candles, 14);
        const atr = atrArr.length > 0 ? atrArr[atrArr.length - 1] : 0.01;

        const poc = calculatePOC(candles);

        const cvdArr = calculateCVD(candles);
        const cvd = cvdArr.length > 0 ? cvdArr[cvdArr.length - 1] : 0;
        const cvdPrev = cvdArr.length > 1 ? cvdArr[cvdArr.length - 2] : cvd;

        const bb = calculateBB(closes, 20, 2);
        const bbUpper = bb.upper.length > 0 ? bb.upper[bb.upper.length - 1] : close * 1.05;
        const bbLower = bb.lower.length > 0 ? bb.lower[bb.lower.length - 1] : close * 0.95;
        const bbMiddle = bb.middle.length > 0 ? bb.middle[bb.middle.length - 1] : close;
        const bbWidth = (bbUpper - bbLower) / (bbMiddle || 1);

        const vol = volumes[volumes.length - 1] || 0;
        const volAvg = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20 || 1;

        let buyScore = 0,
            sellScore = 0;

        if (currentRSI < 30) buyScore += 15;
        else if (currentRSI > 70) sellScore += 15;
        else if (currentRSI < 40) buyScore += 5;
        else if (currentRSI > 60) sellScore += 5;

        if (currentHist > 0 && currentMACD > currentSignal) buyScore += 20;
        else if (currentHist < 0 && currentMACD < currentSignal) sellScore += 20;
        else if (currentHist > prevHist) buyScore += 10;
        else if (currentHist < prevHist) sellScore += 10;

        if (close > e8 && e8 > e13 && e13 > e21 && e21 > e50) buyScore += 20;
        else if (close < e8 && e8 < e13 && e13 < e21 && e21 < e50) sellScore += 20;

        if (cvd > cvdPrev && cvd > 0) buyScore += 15;
        else if (cvd < cvdPrev && cvd < 0) sellScore += 15;

        if (close < bbLower) buyScore += 15;
        else if (close > bbUpper) sellScore += 15;
        else if (bbWidth < 0.1 && close > bbMiddle) buyScore += 10;
        else if (bbWidth < 0.1 && close < bbMiddle) sellScore += 10;

        const volRatio = vol / (volAvg || 1);
        if (volRatio > 1.5 && close > e8) buyScore += 10;
        else if (volRatio > 1.5 && close < e8) sellScore += 10;

        const pocDist = Math.abs(close - poc) / (atr || 0.01);
        if (pocDist < 0.2 && close > e8) buyScore += 5;
        else if (pocDist < 0.2 && close < e8) sellScore += 5;

        const netScore = buyScore - sellScore;
        const confidence = Math.min(Math.abs(netScore), 100);
        const trendStrength = (close - e50) / (atr || 0.01);

        let direction = 'NEUTRAL';
        if (netScore > 30 && trendStrength > -1) {
            direction = 'BUY';
        } else if (netScore < -30 && trendStrength < 1) {
            direction = 'SELL';
        } else {
            direction = 'NEUTRAL';
        }

        return {
            asset: asset,
            direction: direction,
            confidence: Math.round(confidence),
            price: close
        };
    }

    function loadTradeHistoryFromCache() {
        try {
            const cached = localStorage.getItem('tradeHistory');
            if (cached) {
                const data = JSON.parse(cached);
                if (data.trades && data.trades.length > 0) {
                    state.tradeHistory = data.trades;
                    state.historyLoaded = true;
                    updateTradeStats();
                    renderTradeHistory();
                    if (els.historyStatus) els.historyStatus.textContent =
                        `✅ Кэш: ${state.tradeHistory.length} сделок`;
                    if (els.historyAssetCount) els.historyAssetCount.textContent =
                        `(${CONFIG.assets.length} активов, ${state.tradeHistory.length} сделок)`;
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    function updateTradeStats() {
        const trades = state.tradeHistory;
        const total = trades.length;

        if (total === 0) {
            state.tradeStats = { totalTrades: 0, wins: 0, losses: 0, totalProfit: 0, winRate: 0, avgProfit: 0 };
            updateStatsUI();
            return;
        }

        const wins = trades.filter(t => t.profit > 0).length;
        const losses = trades.filter(t => t.profit < 0).length;
        const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
        const winRate = (wins / total) * 100;

        state.tradeStats = {
            totalTrades: total,
            wins: wins,
            losses: losses,
            totalProfit: totalProfit,
            winRate: winRate,
            avgProfit: totalProfit / total
        };

        updateStatsUI();
    }

    function updateStatsUI() {
        const stats = state.tradeStats;
        if (els.statTotal) els.statTotal.textContent = stats.totalTrades;
        if (els.statWins) els.statWins.textContent = stats.wins;
        if (els.statLosses) els.statLosses.textContent = stats.losses;
        if (els.statWinrate) {
            els.statWinrate.textContent = stats.totalTrades > 0 ? stats.winRate.toFixed(1) + '%' : '0%';
            els.statWinrate.style.color = stats.winRate > 50 ? '#34d399' : stats.winRate > 30 ? '#fbbf24' :
                '#f87171';
        }
        if (els.statPl) {
            const pl = stats.totalProfit;
            els.statPl.textContent = (pl >= 0 ? '+' : '') + pl.toFixed(2) + '$';
            els.statPl.style.color = pl > 0 ? '#34d399' : pl < 0 ? '#f87171' : '#94a3b8';
        }
    }

    function renderTradeHistory() {
        if (!els.historyGrid) return;
        const trades = state.tradeHistory;

        if (trades.length === 0) {
            els.historyGrid.innerHTML =
                `<div style="grid-column:1/-1; text-align:center; color:#475569; font-size:12px; padding:20px;">📭 Нет сделок в истории.</div>`;
            return;
        }

        const displayTrades = trades.slice(0, 20);
        els.historyGrid.innerHTML = displayTrades.map(trade => {
            const isWin = trade.profit > 0;
            const isNeutral = trade.profit === 0;
            const profitStr = (trade.profit >= 0 ? '+' : '') + trade.profit.toFixed(2) + '$';
            const profitPercentStr = (trade.profitPercent >= 0 ? '+' : '') + trade.profitPercent.toFixed(2) + '%';
            const directionLabel = trade.direction === 'BUY' ? '📈 BUY' : '📉 SELL';
            const badgeClass = trade.direction === 'BUY' ? 'buy-badge' : 'sell-badge';
            const date = new Date(trade.entryTime).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            const displayName = ASSET_DISPLAY_NAMES[trade.asset] || trade.asset;

            return `
                        <div class="trade-card">
                            <div class="trade-info">
                                <div class="trade-asset">${displayName}</div>
                                <div class="trade-detail">
                                    <span class="trade-direction-badge ${badgeClass}">${directionLabel}</span>
                                    <span style="color:#475569; margin-left:6px;">conf: ${trade.confidence}%</span>
                                </div>
                                <div class="trade-detail">Entry: $${trade.entryPrice.toFixed(2)} → Exit: $${trade.exitPrice.toFixed(2)}</div>
                                <div class="trade-time">${date}</div>
                            </div>
                            <div class="trade-result">
                                <div class="trade-profit ${isWin ? 'positive' : isNeutral ? 'neutral' : 'negative'}">${profitStr}</div>
                                <div style="font-size:10px; color:#64748b;">${profitPercentStr}</div>
                                <div style="font-size:8px; color:#475569; margin-top:2px;">
                                    ${trade.exitReason === 'take_profit' ? '✅ TP' :
                                      trade.exitReason === 'stop_loss' ? '🛑 SL' :
                                      trade.exitReason === 'reverse_signal' ? '🔄 REV' : '⏱️ TO'}
                                </div>
                            </div>
                        </div>
                    `;
        }).join('');

        if (trades.length > 20) {
            const more = document.createElement('div');
            more.style.cssText =
                'grid-column:1/-1; text-align:center; color:#475569; font-size:11px; padding:8px;';
            more.textContent = `+ ${trades.length - 20} more trades...`;
            els.historyGrid.appendChild(more);
        }
    }

    // ============================================================
    //  УПРАВЛЕНИЕ
    // ============================================================

    function setupCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, data] of cache) {
                if (now - data.timestamp > CONFIG.cacheTTL) {
                    cache.delete(key);
                }
            }
        }, 60000);
    }

    function startPeriodicUpdate() {
        state.updateInterval = setInterval(() => {
            if (state.isConnected) {
                generateSignals();
            }
        }, 120000);
    }

    function destroy() {
        if (state.ws) state.ws.close();
        if (state.updateInterval) clearInterval(state.updateInterval);
        if (state.signalThrottle) clearTimeout(state.signalThrottle);
        state.marketData.clear();
        state.signals.clear();
        state.actionScores.clear();
        state.indicatorScores.clear();
        state.tradeHistory = [];
        cache.clear();
        console.log('🧹 Виджет уничтожен');
    }

    // ============================================================
    //  ИНИЦИАЛИЗАЦИЯ
    // ============================================================

    async function init() {
        console.log('🚀 Инициализация Crypto Signal Widget со звуком...');

        // Инициализация звуковой системы
        SoundSystem.init();

        renderWidget();
        setupWebSocket();
        setupCacheCleanup();
        startPeriodicUpdate();

        await loadHistoricalData();
        setTimeout(generateSignals, 3000);

        setInterval(() => {
            if (!state.historyLoaded) {
                loadHistoricalData();
            }
        }, 300000);

        window.__signalWidget = {
            getState: function() {
                return {
                    connected: state.isConnected,
                    assets: CONFIG.assets.length,
                    timeframes: CONFIG.timeframes,
                    currentTF: state.currentTF,
                    historyTrades: state.tradeHistory.length,
                    tradeStats: state.tradeStats,
                    marketDataSize: state.marketData.size,
                    soundEnabled: SoundSystem.isEnabled(),
                    soundLoaded: SoundSystem.isLoaded(),
                    signals: Array.from(state.signals.entries()).map(([k, v]) => ({
                        asset: k,
                        direction: v.direction,
                        confidence: v.confidence,
                        price: v.price,
                        timeframe: v.timeframe,
                        indicatorScores: v.indicatorScores,
                        actionProbabilities: v.actionProbabilities,
                        status: v.status
                    }))
                };
            },
            generate: generateSignals,
            refreshHistory: loadHistoricalData,
            loadAsset: loadAssetData,
            destroy: destroy,
            config: CONFIG,
            guide: TRADING_GUIDE,
            sound: {
                toggle: SoundSystem.toggle.bind(SoundSystem),
                isEnabled: SoundSystem.isEnabled.bind(SoundSystem),
                isLoaded: SoundSystem.isLoaded.bind(SoundSystem)
            }
        };

        console.log('%c✅ Виджет успешно инициализирован со звуком!', 'font-size:16px; font-weight:bold; color:#34d399;');
        console.log(`🔊 Звук: ${SoundSystem.isEnabled() ? 'Включен' : 'Выключен'}`);
        console.log(`🔊 Звуковой файл: ${CONFIG.sound.filePath}`);
        console.log(`🔊 Статус загрузки: ${SoundSystem.isLoaded() ? 'Загружен ✅' : 'Не загружен ❌'}`);
        console.log(`🔊 Порог срабатывания: ${CONFIG.sound.threshold}%`);
        console.log('📊 Введите window.__signalWidget для управления');
    }

    // ============================================================
    //  АВТОЗАПУСК
    // ============================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('error', function(e) {
        console.error('💥 Необработанная ошибка:', e.message);
    });

    window.addEventListener('beforeunload', function() {
        if (state.ws) state.ws.close();
    });

})();