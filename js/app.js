// ============================================================
//  МОДУЛЬ CRYPTO SIGNAL TOOL (v10.1)
//  + Fear & Greed Index
//  + Market State Widget (Macro Heatmap)
//  + Выпадающая документация справа под ms-panel
//  + TF-arrow: выпадающая карточка doc-card активного TF
//  + При смене TF панель ОСТАЁТСЯ открытой, меняется только контент
//  + КОНФИГУРИРУЕМЫЕ ВЕСА ИНДИКАТОРОВ С АВТОНОРМИРОВКОЙ К 100%
// ============================================================

// ---------- Конфигурация ----------
const CONFIG = {
  assets: ["BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "GRAM", "TRX", "PAXG"],
  symbolMap: {
    BTC: "BTCUSDT",
    ETH: "ETHUSDT",
    BNB: "BNBUSDT",
    SOL: "SOLUSDT",
    XRP: "XRPUSDT",
    ADA: "ADAUSDT",
    GRAM: "GRAMUSDT",
    TRX: "TRXUSDT",
    PAXG: "PAXGUSDT",
  },
  timeframes: ["15m", "1h", "2h", "4h", "1d"],
  tfMinutes: { "15m": 15, "1h": 60, "2h": 120, "4h": 240, "1d": 1440 },
  defaultTF: "1h",
  wsEndpoint: "wss://stream.binance.com:9443/ws",
  maxCandles: 1000,
  historyCandles: 1500,
  minCandlesRequired: 50,
  trading: {
    minConfidence: 75,
    rsiOverbought: 70,
    rsiOversold: 30,
    requireHtfConfirm: true,
    stopAtrMult: 1.25,
    takeProfitAtrMult: 2.5,
    minProfitPercent: 2.0,
    maxLossPercent: 1.0,
    positionSize: 1000,
  },
  sound: {
    threshold: 75,
    filePath: "audio/Ding-ding.mp3",
  },
  indicators: {
    rsiPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    emaPeriods: [8, 13, 21, 50],
    bbPeriod: 20,
    bbStdDev: 2,
    atrPeriod: 14,
  },
  fearGreed: {
    intervalMs: 5 * 60 * 1000,
    neutralFallback: 50,
  },

  // ============================================================
  //  НАСТРАИВАЕМЫЕ ВЕСА ИНДИКАТОРОВ
  //  Итоговый балл автоматически нормируется к 0–100,
  //  поэтому сумма весов может быть любой (не обязательно 100).
  //  Хочешь усилить/ослабить индикатор — меняй одно число.
  // ============================================================
  scoring: {
    // Максимальный вклад каждого индикатора ДО нормировки.
    weights: {
      rsi: 30, // RSI — перекупленность/перепроданность
      macd: 20, // MACD — импульс и пересечение
      ema: 20, // EMA Ribbon — тренд (8/13/21/50)
      cvd: 15, // CVD — давление покупателей/продавцов
      bb: 15, // Bollinger Bands — границы волатильности
      volume: 10, // Volume Spike — всплеск объёма
      poc: 5, // POC — точка контроля (объёмный уровень)
    },
    // Внутренние "ступеньки" для градаций внутри индикатора (доли от веса)
    gradations: {
      rsi: { extreme: 1.0, strong: 0.66, normal: 0.5, weak: 0.16 },
      macd: { main: 1.0, trend: 0.5 },
      bb: { touch: 1.0, squeeze: 0.66 },
    },
    // Порог "активного" сигнала (в нормированных %)
    strongThreshold: 30,
  },
};

// ---------- Единая шкала Macro Score ----------
const MACRO_SCALE = [
  {
    min: 75,
    max: 100,
    label: "Очень здоровый",
    color: "#22c55e",
    barClass: "ms-green",
  },
  {
    min: 55,
    max: 74,
    label: "Здоровый",
    color: "#eab308",
    barClass: "ms-yellow",
  },
  {
    min: 40,
    max: 54,
    label: "Осторожно",
    color: "#f97316",
    barClass: "ms-orange",
  },
  { min: 20, max: 39, label: "Риск", color: "#ef4444", barClass: "ms-red" },
  { min: 0, max: 19, label: "Экстрим", color: "#ef4444", barClass: "ms-red" },
];

// ---------- Гайды по таймфреймам ----------
const TF_GUIDES = {
  "15m": {
    name: "15 Минут",
    icon: "⚡",
    action: {
      BUY: "Скальпинг. Цель: +0.5-1.5%. Стоп: -0.5-1%.",
      SELL: "Краткосрочный выход. Цель: +0.5-1.5%. Стоп: -0.5-1%.",
      WAIT: "Рынок неопределён. Ждите 1H+.",
    },
    risk: "Высокий",
    positionSize: "1-2%",
    stopLoss: "0.5-1%",
    takeProfit: "0.5-1.5%",
  },
  "1h": {
    name: "1 Час",
    icon: "📊",
    action: {
      BUY: "Стандартный вход. Цель: +1-3%. Стоп: -1-1.5%.",
      SELL: "Стандартный выход. Цель: +1-3%. Стоп: -1-1.5%.",
      WAIT: "Сигнал слабый. Ждите 2H+.",
    },
    risk: "Средний",
    positionSize: "3-5%",
    stopLoss: "1-1.5%",
    takeProfit: "1-3%",
  },
  "2h": {
    name: "2 Часа",
    icon: "📈",
    action: {
      BUY: "Свинг-трейдинг. Цель: +2-4%. Стоп: -1.5-2%.",
      SELL: "Свинг-выход. Цель: +2-4%. Стоп: -1.5-2%.",
      WAIT: "Тренд не сформирован. Ждите 4H+.",
    },
    risk: "Средний-Высокий",
    positionSize: "3-5%",
    stopLoss: "1.5-2%",
    takeProfit: "2-4%",
  },
  "4h": {
    name: "4 Часа",
    icon: "📉",
    action: {
      BUY: "Среднесрочный вход. Цель: +3-6%. Стоп: -2-3%.",
      SELL: "Среднесрочный выход. Цель: +3-6%. Стоп: -2-3%.",
      WAIT: "Нет чёткого тренда. Ждите 1D+.",
    },
    risk: "Средний",
    positionSize: "5-10%",
    stopLoss: "2-3%",
    takeProfit: "3-6%",
  },
  "1d": {
    name: "1 День",
    icon: "🏛️",
    action: {
      BUY: "Долгосрочный вход. Цель: +5-15%. Стоп: -3-5%.",
      SELL: "Долгосрочный выход. Цель: +5-15%. Стоп: -3-5%.",
      WAIT: "Глобальный тренд не определён.",
    },
    risk: "Низкий-Средний",
    positionSize: "10-20%",
    stopLoss: "3-5%",
    takeProfit: "5-15%",
  },
};

// ---------- Вспомогательные утилиты ----------
const utils = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  round: (v, d = 2) => {
    const n = Number(v);
    return Number.isFinite(n) ? Number(n.toFixed(d)) : 0;
  },
  toMs: (t) => {
    const n = Number(t);
    if (!Number.isFinite(n)) return 0;
    return n < 1e12 ? n * 1000 : n;
  },
  last: (arr) => arr[arr.length - 1],
  safeGet: (obj, path, def) => {
    try {
      return path.split(".").reduce((o, p) => o?.[p], obj) ?? def;
    } catch {
      return def;
    }
  },
};

// ---------- Менеджер звука ----------
class SoundManager {
  constructor() {
    this._enabled = true;
    this._loaded = false;
    this._audio = new Audio();
    this._audio.preload = "auto";
    this._audio.src = CONFIG.sound.filePath;
    this._lastPlayed = new Map();
    this._intervals = new Map();
    this._useFallback = false;
    this._audioCtx = null;
    this._init();
  }

  _init() {
    this._audio.addEventListener("canplaythrough", () => {
      this._loaded = true;
      console.log("🔊 Звук загружен:", CONFIG.sound.filePath);
    });
    this._audio.addEventListener("error", () => {
      console.warn(
        "⚠️ Не удалось загрузить звук, используем Web Audio fallback",
      );
      this._useFallback = true;
      this._loaded = true;
      this._initWebAudio();
    });
    if (this._audio.readyState >= 3) this._loaded = true;
    this._loadState();
  }

  _initWebAudio() {
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio не поддерживается");
      this._loaded = false;
    }
  }

  _playFallback() {
    if (!this._audioCtx) return;
    try {
      if (this._audioCtx.state === "suspended") {
        this._audioCtx.resume().catch(() => {});
      }
      const osc = this._audioCtx.createOscillator();
      const gain = this._audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this._audioCtx.destination);
      osc.frequency.value = 800;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, this._audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        this._audioCtx.currentTime + 0.2,
      );
      osc.start(this._audioCtx.currentTime);
      osc.stop(this._audioCtx.currentTime + 0.2);
    } catch (e) {}
  }

  play(signalType, asset, confidence) {
    if (!this._enabled || !this._loaded || confidence < CONFIG.sound.threshold)
      return;
    const key = `${asset}-${signalType}`;
    const now = Date.now();
    if (now - (this._lastPlayed.get(key) || 0) < 10000) return;
    this._lastPlayed.set(key, now);

    try {
      if (this._useFallback) this._playFallback();
      else {
        this._audio.currentTime = 0;
        this._audio.play().catch(() => {});
      }
      console.log(`🔊 ${signalType} ${asset} (${confidence}%)`);
      for (const [k, t] of this._lastPlayed) {
        if (now - t > 300000) this._lastPlayed.delete(k);
      }
    } catch (e) {}
  }

  startRepeating(asset, signalType, confidence) {
    const key = `${asset}-${signalType}`;
    if (this._intervals.has(key)) return;
    this.play(signalType, asset, confidence);
    const id = setInterval(() => {
      this.play(signalType, asset, confidence);
    }, 10000);
    this._intervals.set(key, id);
  }

  stopRepeating(asset) {
    for (const [key, id] of this._intervals) {
      if (key.startsWith(`${asset}-`)) {
        clearInterval(id);
        this._intervals.delete(key);
      }
    }
    for (const [key] of this._lastPlayed) {
      if (key.startsWith(`${asset}-`)) this._lastPlayed.delete(key);
    }
  }

  clearAll() {
    for (const [, id] of this._intervals) clearInterval(id);
    this._intervals.clear();
    this._lastPlayed.clear();
  }

  toggle() {
    this._enabled = !this._enabled;
    this._saveState();
    if (!this._enabled) this.clearAll();
    return this._enabled;
  }

  isEnabled() {
    return this._enabled;
  }
  isLoaded() {
    return this._loaded;
  }

  _saveState() {
    try {
      localStorage.setItem("signalSoundEnabled", JSON.stringify(this._enabled));
    } catch (e) {}
  }
  _loadState() {
    try {
      const v = localStorage.getItem("signalSoundEnabled");
      if (v !== null) this._enabled = JSON.parse(v);
    } catch (e) {}
  }
}

// ---------- Загрузчик данных ----------
class DataLoader {
  constructor() {
    this.exchanges = [
      { id: "binance", url: "https://api.binance.com/api/v3/klines" },
      { id: "bybit", url: "https://api.bybit.com/v5/market/kline" },
      { id: "okx", url: "https://www.okx.com/api/v5/market/history-candles" },
      { id: "mexc", url: "https://api.mexc.com/api/v3/klines" },
      { id: "coinbase", url: "https://api.exchange.coinbase.com/products" },
      { id: "htx", url: "https://api.huobi.pro/market/history/kline" },
      { id: "kucoin", url: "https://api.kucoin.com/api/v1/market/candles" },
    ];
    this.timeout = 8000;
    this.maxRetries = 3;
  }

  _formatSymbol(exchangeId, symbol) {
    switch (exchangeId) {
      case "binance":
      case "bybit":
      case "mexc":
        return symbol;
      case "kucoin":
      case "okx":
        return symbol.replace("USDT", "-USDT").replace("BUSD", "-BUSD");
      case "coinbase":
        return symbol.replace("USDT", "-USD").replace("BUSD", "-USD");
      case "htx":
        return symbol.toLowerCase();
      default:
        return symbol;
    }
  }

  async fetchCandles(symbol, interval = "1h", limit = CONFIG.historyCandles) {
    const intervalMap = {
      "15m": {
        binance: "15m",
        bybit: "15",
        okx: "15m",
        mexc: "15m",
        htx: "15min",
        kucoin: "15min",
        coinbase: "15m",
      },
      "1h": {
        binance: "1h",
        bybit: "60",
        okx: "1H",
        mexc: "1h",
        htx: "60min",
        kucoin: "1hour",
        coinbase: "1h",
      },
      "2h": {
        binance: "2h",
        bybit: "120",
        okx: "2H",
        mexc: "2h",
        htx: "2hour",
        kucoin: "2hour",
        coinbase: "2h",
      },
      "4h": {
        binance: "4h",
        bybit: "240",
        okx: "4H",
        mexc: "4h",
        htx: "4hour",
        kucoin: "4hour",
        coinbase: "4h",
      },
      "1d": {
        binance: "1d",
        bybit: "D",
        okx: "1D",
        mexc: "1d",
        htx: "1day",
        kucoin: "1day",
        coinbase: "1d",
      },
    };

    const orderedExchanges = [
      this.exchanges.find((e) => e.id === "binance"),
      ...this.exchanges.filter((e) => e.id !== "binance"),
    ].filter(Boolean);

    for (const ex of orderedExchanges) {
      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          const formattedSymbol = this._formatSymbol(ex.id, symbol);
          const intervalStr = intervalMap[interval]?.[ex.id] || "1h";
          const url = this._buildUrl(ex, formattedSymbol, intervalStr, limit);
          if (!url) continue;

          console.log(
            `📥 Загрузка ${symbol} с ${ex.id} (${formattedSymbol})...`,
          );
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.timeout);
          const resp = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!resp.ok) {
            console.warn(
              `❌ ${ex.id} вернул ${resp.status} для ${formattedSymbol}`,
            );
            if (resp.status >= 400 && resp.status < 500 && resp.status !== 429)
              break;
            continue;
          }

          const data = await resp.json();
          const candles = this._parse(data, ex.id);
          if (candles && candles.length >= CONFIG.minCandlesRequired) {
            console.log(
              `✅ Загружено ${candles.length} свечей с ${ex.id} для ${symbol}`,
            );
            return candles;
          } else {
            console.warn(
              `⚠️ ${ex.id} вернул мало данных (${candles?.length || 0})`,
            );
          }
        } catch (e) {
          console.warn(
            `⚠️ Попытка ${attempt + 1} для ${ex.id} не удалась:`,
            e.message,
          );
          if (attempt < this.maxRetries - 1)
            await utils.sleep(1000 * (attempt + 1));
        }
      }
    }

    console.error(
      `❌ Не удалось загрузить данные для ${symbol} ни с одной биржи`,
    );
    return [];
  }

  _buildUrl(ex, symbol, intervalStr, limit) {
    const lim = this._clampLimit(ex.id, limit);
    let url = "";
    switch (ex.id) {
      case "binance":
        url = `${ex.url}?symbol=${symbol}&interval=${intervalStr}&limit=${lim}`;
        break;
      case "bybit":
        url = `${ex.url}?symbol=${symbol}&interval=${intervalStr}&limit=${lim}`;
        break;
      case "okx":
        url = `${ex.url}?instId=${symbol}&bar=${intervalStr}&limit=${lim}`;
        break;
      case "mexc":
        url = `${ex.url}?symbol=${symbol}&interval=${intervalStr}&limit=${lim}`;
        break;
      case "coinbase": {
        const granularity =
          intervalStr === "1h"
            ? 3600
            : intervalStr === "15m"
              ? 900
              : intervalStr === "2h"
                ? 7200
                : intervalStr === "4h"
                  ? 14400
                  : 86400;
        url = `${ex.url}/${symbol}/candles?granularity=${granularity}`;
        break;
      }
      case "htx":
        url = `${ex.url}?symbol=${symbol}&period=${intervalStr}&size=${lim}`;
        break;
      case "kucoin":
        url = `${ex.url}?symbol=${symbol}&type=${intervalStr}&limit=${lim}`;
        break;
      default:
        return null;
    }
    return url;
  }

  _clampLimit(exId, limit) {
    const max = {
      binance: 1000,
      mexc: 1000,
      bybit: 1000,
      okx: 300,
      coinbase: 300,
      htx: 2000,
      kucoin: 1500,
    };
    return Math.min(limit, max[exId] || 1000);
  }

  _parse(data, exId) {
    try {
      let raw = [];
      switch (exId) {
        case "binance":
        case "mexc":
          raw = Array.isArray(data)
            ? data.map((k) => ({
                time: utils.toMs(k[0]),
                open: +k[1],
                high: +k[2],
                low: +k[3],
                close: +k[4],
                volume: +k[5],
              }))
            : [];
          break;
        case "bybit":
          raw =
            data.result?.list?.map((k) => ({
              time: utils.toMs(k[0]),
              open: +k[1],
              high: +k[2],
              low: +k[3],
              close: +k[4],
              volume: +k[5],
            })) || [];
          break;
        case "okx":
          raw =
            data.data?.map((k) => ({
              time: utils.toMs(k[0]),
              open: +k[1],
              high: +k[2],
              low: +k[3],
              close: +k[4],
              volume: +k[5],
            })) || [];
          break;
        case "coinbase":
          raw = Array.isArray(data)
            ? data.map((k) => ({
                time: utils.toMs(k[0]),
                open: +k[3],
                high: +k[2],
                low: +k[1],
                close: +k[4],
                volume: +k[5],
              }))
            : [];
          break;
        case "htx":
          raw =
            data.data?.map((k) => ({
              time: utils.toMs(k.id ?? k[0]),
              open: +(k.open ?? k[1]),
              high: +(k.high ?? k[2]),
              low: +(k.low ?? k[3]),
              close: +(k.close ?? k[4]),
              volume: +(k.vol ?? k.amount ?? k[5]),
            })) || [];
          break;
        case "kucoin":
          raw =
            data.data?.map((k) => ({
              time: utils.toMs(k[0]),
              open: +k[1],
              close: +k[2],
              high: +k[3],
              low: +k[4],
              volume: +k[5],
            })) || [];
          break;
        default:
          return [];
      }
      return this._normalizeCandles(raw);
    } catch (e) {
      console.warn("Ошибка парсинга данных от", exId, e);
      return [];
    }
  }

  _normalizeCandles(candles) {
    const byTime = new Map();
    for (const c of candles) {
      if (!c || !Number.isFinite(c.time) || !Number.isFinite(c.close)) continue;
      byTime.set(c.time, c);
    }
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  }
}

// ---------- Расчёт индикаторов ----------
class IndicatorCalculator {
  constructor() {
    this.cache = new Map();
  }

  getCached(asset, tf) {
    return this.cache.get(`${asset}_${tf}`);
  }
  setCached(asset, tf, data) {
    this.cache.set(`${asset}_${tf}`, data);
  }

  calculateAll(candles, tf) {
    if (!candles || candles.length < CONFIG.minCandlesRequired) return null;
    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume);

    const rsi = this._rsi(closes, CONFIG.indicators.rsiPeriod);
    const currentRSI = rsi.length ? rsi[rsi.length - 1] : 50;

    const macd = this._macd(
      closes,
      CONFIG.indicators.macdFast,
      CONFIG.indicators.macdSlow,
      CONFIG.indicators.macdSignal,
    );
    const hist = macd.histogram;
    const currentHist = hist.length ? hist[hist.length - 1] : 0;
    const currentMACD = macd.macd.length ? macd.macd[macd.macd.length - 1] : 0;
    const currentSignal = macd.signal.length
      ? macd.signal[macd.signal.length - 1]
      : 0;
    const prevHist = hist.length > 1 ? hist[hist.length - 2] : currentHist;

    const ema8 = this._ema(closes, 8);
    const ema13 = this._ema(closes, 13);
    const ema21 = this._ema(closes, 21);
    const ema50 = this._ema(closes, 50);
    const e8 = ema8.length ? ema8[ema8.length - 1] : closes[closes.length - 1];
    const e13 = ema13.length
      ? ema13[ema13.length - 1]
      : closes[closes.length - 1];
    const e21 = ema21.length
      ? ema21[ema21.length - 1]
      : closes[closes.length - 1];
    const e50 = ema50.length
      ? ema50[ema50.length - 1]
      : closes[closes.length - 1];

    const atrArr = this._atr(candles, CONFIG.indicators.atrPeriod);
    const atr = atrArr.length ? atrArr[atrArr.length - 1] : 0.01;

    const poc = this._poc(candles);
    const cvdArr = this._cvd(candles);
    const cvd = cvdArr.length ? cvdArr[cvdArr.length - 1] : 0;
    const cvdPrev = cvdArr.length > 1 ? cvdArr[cvdArr.length - 2] : cvd;

    const bb = this._bb(
      closes,
      CONFIG.indicators.bbPeriod,
      CONFIG.indicators.bbStdDev,
    );
    const bbUpper = bb.upper.length
      ? bb.upper[bb.upper.length - 1]
      : closes[closes.length - 1] * 1.05;
    const bbLower = bb.lower.length
      ? bb.lower[bb.lower.length - 1]
      : closes[closes.length - 1] * 0.95;
    const bbMiddle = bb.middle.length
      ? bb.middle[bb.middle.length - 1]
      : closes[closes.length - 1];
    const bbWidth = (bbUpper - bbLower) / (bbMiddle || 1);

    const vol = volumes[volumes.length - 1] || 0;
    const volAvg = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20 || 1;

    const close = closes[closes.length - 1];
    const trendStrength = (close - e50) / (atr || 0.01);

    return {
      rsi: currentRSI,
      macdHist: currentHist,
      macdLine: currentMACD,
      macdSignal: currentSignal,
      macdPrevHist: prevHist,
      ema8: e8,
      ema13: e13,
      ema21: e21,
      ema50: e50,
      atr,
      poc,
      cvd,
      cvdPrev,
      bbUpper,
      bbLower,
      bbMiddle,
      bbWidth,
      volume: vol,
      volAvg,
      close,
      trendStrength,
      _rsi: rsi,
      _macd: macd,
      _ema8: ema8,
      _ema13: ema13,
      _ema21: ema21,
      _ema50: ema50,
      _atr: atrArr,
      _cvd: cvdArr,
      _bb: bb,
      _volumes: volumes,
      _closes: closes,
    };
  }

  _rsi(data, period) {
    if (data.length < period + 1) return [50];
    const changes = [];
    for (let i = 1; i < data.length; i++) changes.push(data[i] - data[i - 1]);
    let avgGain = 0,
      avgLoss = 0;
    const len = Math.min(period, changes.length);
    for (let i = 0; i < len; i++) {
      if (changes[i] >= 0) avgGain += changes[i];
      else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period || 1;
    const rsi = [100 - 100 / (1 + avgGain / (avgLoss || 1))];
    for (let i = period; i < changes.length; i++) {
      const gain = changes[i] >= 0 ? changes[i] : 0;
      const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rsi.push(100 - 100 / (1 + avgGain / (avgLoss || 1)));
    }
    return rsi;
  }

  _ema(data, period) {
    if (!data.length) return [];
    const ema = [];
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      if (i < period) {
        sum += data[i];
        ema.push(sum / (i + 1));
      } else {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
      }
    }
    return ema;
  }

  _macd(data, fast, slow, signal) {
    if (data.length < slow) return { macd: [], signal: [], histogram: [] };
    const emaFast = this._ema(data, fast);
    const emaSlow = this._ema(data, slow);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const signalLine = this._ema(macdLine.slice(slow - fast), signal);
    const histogram = macdLine
      .slice(slow - fast)
      .map((v, i) => v - signalLine[i]);
    return { macd: macdLine.slice(slow - fast), signal: signalLine, histogram };
  }

  _atr(candles, period) {
    if (candles.length < period + 1) return [0.01];
    const tr = [];
    for (let i = 1; i < candles.length; i++) {
      const h = candles[i].high,
        l = candles[i].low,
        pc = candles[i - 1].close;
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const atr = [];
    let sum = 0;
    for (let i = 0; i < tr.length; i++) {
      if (i < period) {
        sum += tr[i];
        atr.push(sum / (i + 1));
      } else {
        atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
      }
    }
    return atr;
  }

  _poc(candles) {
    if (!candles.length) return 0;
    const priceLevels = new Map();
    const minP = Math.min(...candles.map((c) => c.low));
    const maxP = Math.max(...candles.map((c) => c.high));
    const bucketSize = (maxP - minP) / 50 || 0.01;
    candles.forEach((c) => {
      const bucket = Math.floor(c.close / (bucketSize || 0.01));
      priceLevels.set(bucket, (priceLevels.get(bucket) || 0) + c.volume);
    });
    let maxVol = 0,
      pocBucket = 0;
    for (const [bucket, vol] of priceLevels) {
      if (vol > maxVol) {
        maxVol = vol;
        pocBucket = bucket;
      }
    }
    return pocBucket * (bucketSize || 0.01) + (bucketSize || 0.01) / 2;
  }

  _cvd(candles) {
    if (candles.length < 2) return [];
    const cvd = [];
    let cum = 0;
    for (let i = 1; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      const vol = candles[i].volume;
      const delta =
        change > 0
          ? vol * (change / candles[i - 1].close)
          : change < 0
            ? -vol * (Math.abs(change) / candles[i - 1].close)
            : 0;
      cum += delta;
      cvd.push(cum);
    }
    return cvd;
  }

  _bb(data, period, stdDev) {
    if (data.length < period) return { upper: [], middle: [], lower: [] };
    const upper = [],
      middle = [],
      lower = [];
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
      const std = Math.sqrt(variance);
      middle.push(mean);
      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
    }
    return { upper, middle, lower };
  }
}

// ---------- Генератор сигналов ----------
class SignalGenerator {
  constructor(indicatorCalc) {
    this.indicatorCalc = indicatorCalc;
  }

  // ============================================================
  //  ГЛАВНЫЙ МЕТОД: конфигурируемые веса + автонормировка к 100
  // ============================================================
  generate(asset, tf, candles) {
    if (!candles || candles.length < CONFIG.minCandlesRequired) {
      return this._emptySignal(asset, tf);
    }
    const ind = this.indicatorCalc.calculateAll(candles, tf);
    if (!ind) return this._emptySignal(asset, tf);

    const cfg = CONFIG.trading;
    const sc = CONFIG.scoring;
    const W = sc.weights;
    const G = sc.gradations;

    // Сумма весов для нормировки (динамическая — меняешь weights, нормировка подстроится)
    const totalWeight = Object.values(W).reduce((s, v) => s + v, 0) || 1;

    // Накопители "сырых" баллов (в единицах весов)
    let buyRaw = 0;
    let sellRaw = 0;
    const scores = {}; // нормированные вклады (в % от totalWeight)

    // ---------- 1. RSI ----------
    {
      const rsi = ind.rsi;
      const w = W.rsi;
      const g = G.rsi;
      let raw = 0;
      if (rsi < 10) raw = w * g.extreme;
      else if (rsi > 90) raw = -w * g.extreme;
      else if (rsi < 20) raw = w * g.strong;
      else if (rsi > 80) raw = -w * g.strong;
      else if (rsi < 30) raw = w * g.normal;
      else if (rsi > 70) raw = -w * g.normal;
      else if (rsi < 40) raw = w * g.weak;
      else if (rsi > 60) raw = -w * g.weak;
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.rsi = (raw / totalWeight) * 100;
    }

    // ---------- 2. MACD ----------
    {
      const w = W.macd;
      const g = G.macd;
      const hist = ind.macdHist;
      let raw = 0;
      if (hist > 0 && ind.macdLine > ind.macdSignal) raw = w * g.main;
      else if (hist < 0 && ind.macdLine < ind.macdSignal) raw = -w * g.main;
      else if (hist > ind.macdPrevHist) raw = w * g.trend;
      else if (hist < ind.macdPrevHist) raw = -w * g.trend;
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.macd = (raw / totalWeight) * 100;
    }

    // ---------- 3. EMA Ribbon ----------
    {
      const w = W.ema;
      const c = ind.close;
      let raw = 0;
      if (
        c > ind.ema8 &&
        ind.ema8 > ind.ema13 &&
        ind.ema13 > ind.ema21 &&
        ind.ema21 > ind.ema50
      ) {
        raw = w;
      } else if (
        c < ind.ema8 &&
        ind.ema8 < ind.ema13 &&
        ind.ema13 < ind.ema21 &&
        ind.ema21 < ind.ema50
      ) {
        raw = -w;
      }
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.ema = (raw / totalWeight) * 100;
    }

    // ---------- 4. CVD ----------
    {
      const w = W.cvd;
      let raw = 0;
      if (ind.cvd > ind.cvdPrev && ind.cvd > 0) raw = w;
      else if (ind.cvd < ind.cvdPrev && ind.cvd < 0) raw = -w;
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.cvd = (raw / totalWeight) * 100;
    }

    // ---------- 5. Bollinger Bands ----------
    {
      const w = W.bb;
      const g = G.bb;
      const c = ind.close;
      let raw = 0;
      if (c < ind.bbLower) raw = w * g.touch;
      else if (c > ind.bbUpper) raw = -w * g.touch;
      else if (ind.bbWidth < 0.1 && c > ind.bbMiddle) raw = w * g.squeeze;
      else if (ind.bbWidth < 0.1 && c < ind.bbMiddle) raw = -w * g.squeeze;
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.bb = (raw / totalWeight) * 100;
    }

    // ---------- 6. Volume Spike ----------
    {
      const w = W.volume;
      const c = ind.close;
      const volRatio = ind.volume / (ind.volAvg || 1);
      let raw = 0;
      if (volRatio > 1.5 && c > ind.ema8) raw = w;
      else if (volRatio > 1.5 && c < ind.ema8) raw = -w;
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.volume = (raw / totalWeight) * 100;
    }

    // ---------- 7. POC ----------
    {
      const w = W.poc;
      const c = ind.close;
      const atr = ind.atr || 0.01;
      const pocDist = Math.abs(c - ind.poc) / atr;
      let raw = 0;
      if (pocDist < 0.2 && c > ind.ema8) raw = w;
      else if (pocDist < 0.2 && c < ind.ema8) raw = -w;
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.poc = (raw / totalWeight) * 100;
    }

    // ---------- Итоговая нормировка к 100 ----------
    const netRaw = buyRaw - sellRaw; // диапазон [-totalWeight, +totalWeight]
    const netScore = (netRaw / totalWeight) * 100; // → [-100, +100]
    const confidence = Math.round(utils.clamp(Math.abs(netScore), 0, 100));

    // Округление вкладов индикаторов для UI
    const scoresPct = {};
    for (const k of Object.keys(scores)) {
      scoresPct[k] = Math.round(scores[k] * 10) / 10;
    }

    // ---------- Направление и подтверждения ----------
    const buyAligned = this._isEntryAligned(ind, "BUY");
    const sellAligned = this._isEntryAligned(ind, "SELL");
    const htfBuy = this._htfConfirms(tf, candles, "BUY");
    const htfSell = this._htfConfirms(tf, candles, "SELL");

    let scoreDirection = "NEUTRAL";
    if (netScore > sc.strongThreshold && ind.trendStrength > -1)
      scoreDirection = "BUY";
    else if (netScore < -sc.strongThreshold && ind.trendStrength < 1)
      scoreDirection = "SELL";

    let direction = "NEUTRAL";
    if (
      buyAligned &&
      htfBuy &&
      confidence >= cfg.minConfidence &&
      netScore > sc.strongThreshold
    )
      direction = "BUY";
    else if (
      sellAligned &&
      htfSell &&
      confidence >= cfg.minConfidence &&
      netScore < -sc.strongThreshold
    )
      direction = "SELL";

    const actionProbs = this._calcActionProbs(
      buyRaw,
      sellRaw,
      ind.trendStrength,
      ind.bbWidth,
      totalWeight,
    );

    return {
      asset,
      timeframe: tf,
      direction,
      scoreDirection,
      confidence,
      price: ind.close,
      atr: ind.atr,
      htfTimeframe: this._htfFor(tf),
      htfConfirmed:
        direction === "BUY" ? htfBuy : direction === "SELL" ? htfSell : false,
      timestamp: Date.now(),
      indicators: {
        rsi: Math.round(ind.rsi),
        macd: ind.macdHist.toFixed(4),
        ema8: ind.ema8.toFixed(2),
        ema50: ind.ema50.toFixed(2),
        atr: ind.atr.toFixed(2),
        bbWidth: (ind.bbWidth * 100).toFixed(1),
        trendStrength: ind.trendStrength.toFixed(2),
      },
      actionProbabilities: actionProbs,
      indicatorScores: scoresPct, // нормированные вклады для UI
      status: "Активен",
    };
  }

  _isEntryAligned(ind, side) {
    const rsi = ind.rsi;
    const macdRising = ind.macdHist > ind.macdPrevHist;
    const macdFalling = ind.macdHist < ind.macdPrevHist;
    const cfg = CONFIG.trading;
    if (side === "BUY")
      return ind.close > ind.ema50 && macdRising && rsi < cfg.rsiOverbought;
    return ind.close < ind.ema50 && macdFalling && rsi > cfg.rsiOversold;
  }

  _htfFor(tf) {
    const minutes = CONFIG.tfMinutes[tf] || 60;
    if (minutes < CONFIG.tfMinutes["4h"]) return "4h";
    if (minutes < CONFIG.tfMinutes["1d"]) return "1d";
    return null;
  }

  _htfConfirms(tf, candles, side) {
    if (!CONFIG.trading.requireHtfConfirm) return true;
    const htf = this._htfFor(tf);
    if (!htf) return true;
    const agg = this._aggregate(candles, htf);
    if (!agg || agg.length < CONFIG.minCandlesRequired) return false;
    const ind = this.indicatorCalc.calculateAll(agg, htf);
    if (!ind) return false;
    return side === "BUY" ? ind.close > ind.ema50 : ind.close < ind.ema50;
  }

  _aggregate(candles, tf) {
    const minutes = CONFIG.tfMinutes[tf] || 60;
    const agg = [];
    let current = null;
    for (const c of candles) {
      if (!current) {
        current = { ...c };
        continue;
      }
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

  // Нормированная версия: принимает сырые buyRaw/sellRaw и totalWeight
  _calcActionProbs(buyRaw, sellRaw, trendStrength, bbWidth, totalWeight) {
    const denom = totalWeight || 1;
    let buyProb = Math.min((buyRaw / denom) * 100, 100);
    let sellProb = Math.min((sellRaw / denom) * 100, 100);

    if (bbWidth < 0.05) {
      buyProb *= 0.7;
      sellProb *= 0.7;
    }
    if (Math.abs(trendStrength) > 2) {
      if (trendStrength > 0) {
        buyProb = Math.min(buyProb * 1.3, 100);
        sellProb *= 0.7;
      } else {
        sellProb = Math.min(sellProb * 1.3, 100);
        buyProb *= 0.7;
      }
    }
    const waitProb = Math.max(100 - (buyProb + sellProb), 0);
    return {
      wait: Math.round(utils.clamp(waitProb, 0, 100)),
      buy: Math.round(utils.clamp(buyProb, 0, 100)),
      sell: Math.round(utils.clamp(sellProb, 0, 100)),
    };
  }

  _emptySignal(asset, tf) {
    const emptyScores = {
      rsi: 0,
      macd: 0,
      ema: 0,
      cvd: 0,
      bb: 0,
      volume: 0,
      poc: 0,
    };
    return {
      asset,
      timeframe: tf || "1h",
      direction: "NEUTRAL",
      scoreDirection: "NEUTRAL",
      confidence: 0,
      price: 0,
      atr: 0,
      htfTimeframe: this._htfFor(tf),
      htfConfirmed: false,
      timestamp: Date.now(),
      indicators: {
        rsi: 0,
        macd: "0",
        ema8: "0",
        ema50: "0",
        atr: "0",
        bbWidth: "0",
        trendStrength: "0",
      },
      actionProbabilities: { wait: 100, buy: 0, sell: 0 },
      indicatorScores: emptyScores,
      status: "⏳ Загрузка...",
    };
  }
}

// ---------- Бэктестер ----------
class Backtester {
  constructor(signalGenerator) {
    this.signalGen = signalGenerator;
    this.tradeHistory = [];
    this.stats = {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      winRate: 0,
    };
  }

  async run(asset, candles, tf) {
    if (!candles || candles.length < 100) return [];
    const agg = this._aggregate(candles, tf);
    if (agg.length < 100) return [];

    const trades = [];
    let position = null,
      entryPrice = 0,
      entryTime = 0,
      direction = "";
    const config = CONFIG.trading;

    for (let i = 100; i < agg.length; i++) {
      const windowCandles = agg.slice(0, i + 1);
      const current = agg[i];
      const price = current.close;
      const signal = this.signalGen.generate(asset, tf, windowCandles);

      if (position) {
        const move =
          direction === "BUY" ? price - entryPrice : entryPrice - price;
        const isOpposite =
          signal &&
          signal.confidence >= config.minConfidence &&
          ((direction === "BUY" && signal.direction === "SELL") ||
            (direction === "SELL" && signal.direction === "BUY"));

        if (move >= position.takeProfitDistance) {
          trades.push(
            this._closePosition(position, price, current.time, "take_profit"),
          );
          position = null;
        } else if (move <= -position.stopDistance) {
          trades.push(
            this._closePosition(position, price, current.time, "stop_loss"),
          );
          position = null;
        } else if (i - (position.entryIndex ?? i) > 50) {
          trades.push(
            this._closePosition(position, price, current.time, "timeout"),
          );
          position = null;
        } else if (isOpposite) {
          trades.push(
            this._closePosition(
              position,
              price,
              current.time,
              "reverse_signal",
            ),
          );
          position = null;
        }
      }

      if (
        !position &&
        signal &&
        (signal.direction === "BUY" || signal.direction === "SELL") &&
        signal.confidence >= config.minConfidence
      ) {
        const levels = this._atrExitLevels(price, signal.atr, config);
        position = {
          asset,
          direction: signal.direction,
          entryPrice: price,
          entryTime: current.time,
          entryConfidence: signal.confidence,
          entryIndex: i,
          stopDistance: levels.stopDistance,
          takeProfitDistance: levels.takeProfitDistance,
        };
        entryPrice = price;
        entryTime = current.time;
        direction = signal.direction;
      }
    }

    if (position) {
      const last = agg[agg.length - 1];
      trades.push(
        this._closePosition(position, last.close, last.time, "timeout"),
      );
    }

    this.tradeHistory = trades.sort((a, b) => b.exitTime - a.exitTime);
    this._updateStats();
    return this.tradeHistory;
  }

  computeStats(trades) {
    const list = trades || [];
    const total = list.length;
    if (total === 0)
      return { totalTrades: 0, wins: 0, losses: 0, totalProfit: 0, winRate: 0 };
    const wins = list.filter((t) => t.profit > 0).length;
    const losses = list.filter((t) => t.profit < 0).length;
    const totalProfit = list.reduce((s, t) => s + t.profit, 0);
    return {
      totalTrades: total,
      wins,
      losses,
      totalProfit,
      winRate: (wins / total) * 100,
    };
  }

  _atrExitLevels(entryPrice, atr, config) {
    const n = Number(atr);
    const hasAtr = Number.isFinite(n) && n > 0;
    const stopDistance = hasAtr
      ? config.stopAtrMult * n
      : entryPrice * (config.maxLossPercent / 100);
    const takeProfitDistance = hasAtr
      ? config.takeProfitAtrMult * n
      : entryPrice * (config.minProfitPercent / 100);
    return { stopDistance, takeProfitDistance };
  }

  _closePosition(pos, exitPrice, exitTime, reason) {
    const profitPercent = ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const profit = pos.direction === "BUY" ? profitPercent : -profitPercent;
    return {
      asset: pos.asset || "UNKNOWN",
      direction: pos.direction,
      entryPrice: pos.entryPrice,
      exitPrice: exitPrice,
      entryTime: pos.entryTime,
      exitTime: exitTime,
      profitPercent: profit,
      profit: (profit / 100) * CONFIG.trading.positionSize,
      confidence: pos.entryConfidence,
      exitReason: reason,
    };
  }

  _updateStats() {
    this.stats = this.computeStats(this.tradeHistory);
  }

  _aggregate(candles, tf) {
    const tfMap = { "15m": 15, "1h": 60, "2h": 120, "4h": 240, "1d": 1440 };
    const minutes = tfMap[tf] || 60;
    const agg = [];
    let current = null;
    for (const c of candles) {
      if (!current) {
        current = { ...c };
        continue;
      }
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
}

// ---------- WebSocket менеджер ----------
class WSManager {
  constructor(onKline) {
    this.onKline = onKline;
    this.ws = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxAttempts = 10;
    this._stopped = false;
    this._skipReconnect = false;
    this.onStatus = null;
  }

  connect() {
    this._stopped = false;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      this._skipReconnect = true;
      this.ws.close();
    }
    const streams = CONFIG.assets
      .map((a) => CONFIG.symbolMap[a].toLowerCase() + "@kline_1m")
      .join("/");
    try {
      this.ws = new WebSocket(
        `wss://stream.binance.com:9443/stream?streams=${streams}`,
      );
      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        console.log("🔌 WebSocket подключен");
        if (this.onStatus) this.onStatus(true);
      };
      this.ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data);
          const payload = parsed.data || parsed;
          if (payload && payload.k) this.onKline(payload);
        } catch (e) {}
      };
      this.ws.onclose = () => {
        this.connected = false;
        if (this.onStatus) this.onStatus(false);
        if (this._skipReconnect) {
          this._skipReconnect = false;
          return;
        }
        if (this._stopped) return;
        console.log("🔌 WebSocket закрыт, переподключение...");
        this._reconnect();
      };
      this.ws.onerror = () => {
        console.warn("⚠️ WebSocket ошибка");
      };
    } catch (e) {
      console.warn("⚠️ Ошибка создания WebSocket", e);
      this._reconnect();
    }
  }

  _reconnect() {
    if (this._stopped || this.reconnectAttempts >= this.maxAttempts) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * this.reconnectAttempts, 30000);
    setTimeout(() => {
      if (!this.connected && !this._stopped) this.connect();
    }, delay);
  }

  close() {
    this._stopped = true;
    if (this.ws) this.ws.close();
  }
}

// ============================================================
//  Fear & Greed Index Manager
// ============================================================
class FearGreedManager {
  constructor({ intervalMs = 5 * 60 * 1000, neutralFallback = 50 } = {}) {
    this.intervalMs = intervalMs;
    this.neutralFallback = neutralFallback;
    this._el = { marker: null, value: null };
    this._lastValue = -1;
    this._rafId = null;
    this._timerId = null;
    this._abort = null;
  }

  start() {
    this._el.marker = document.getElementById("fngMarker");
    this._el.value = document.getElementById("fngValue");

    if (!this._el.marker || !this._el.value) {
      console.warn("⚠️ F&G: элементы #fngMarker / #fngValue не найдены в DOM");
      return;
    }

    console.log("🟢 F&G: start() — элементы найдены, запускаю");
    this._set(this.neutralFallback);
    this._fetch();
    this._timerId = setInterval(() => this._fetch(), this.intervalMs);
  }

  stop() {
    if (this._timerId) clearInterval(this._timerId);
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._abort) this._abort.abort();
  }

  async _fetch() {
    if (this._abort) this._abort.abort();
    this._abort = new AbortController();

    const sources = [
      "https://api.alternative.me/fng/?limit=1&format=json",
      "https://corsproxy.io/?" +
        encodeURIComponent("https://api.alternative.me/fng/?limit=1"),
      "https://api.allorigins.win/raw?url=" +
        encodeURIComponent("https://api.alternative.me/fng/?limit=1"),
    ];

    for (const url of sources) {
      try {
        console.log("🌐 F&G: запрос", url);
        const resp = await fetch(url, {
          signal: this._abort.signal,
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const json = await resp.json();
        const raw = json?.data?.[0]?.value ?? json?.value;
        const v = parseInt(raw, 10);
        if (Number.isFinite(v)) {
          console.log(
            "✅ F&G:",
            v,
            "—",
            json?.data?.[0]?.value_classification || this._classify(v),
          );
          this._set(v);
          return;
        }
      } catch (e) {
        if (e.name === "AbortError") return;
        console.warn("⚠️ F&G источник не сработал:", url, e.message);
      }
    }

    console.warn(
      "⚠️ F&G: все источники недоступны, оставляю",
      this.neutralFallback,
    );
    this._set(this.neutralFallback);
  }

  _set(v) {
    const clamped = Math.max(0, Math.min(100, v));
    if (clamped === this._lastValue) return;
    this._lastValue = clamped;

    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = requestAnimationFrame(() => {
      const { marker, value } = this._el;
      if (marker) marker.style.left = clamped + "%";
      if (value) {
        value.textContent = `${clamped} ${this._classify(clamped)}`;
        let color = "#fbbf24";
        if (clamped < 25) color = "#ef4444";
        else if (clamped < 45) color = "#f97316";
        else if (clamped < 55) color = "#fbbf24";
        else if (clamped < 75) color = "#84cc16";
        else color = "#22c55e";
        value.style.color = color;
      }
    });
  }

  _classify(v) {
    if (v < 25) return "Extreme Fear";
    if (v < 45) return "Fear";
    if (v < 55) return "Neutral";
    if (v < 75) return "Greed";
    return "Extreme Greed";
  }
}

// ============================================================
//  MARKET STATE WIDGET (Macro Heatmap) v2.7
// ============================================================
class MarketStateWidget {
  static CONFIG = {
    containerId: "market-state-widget",
    refreshMs: 5 * 60 * 1000,
    cacheTTL: 4 * 60 * 1000,
    cacheKey: "ms_widget_cache_v2",
    timeout: 8000,
    weights: {
      macro: { liquidity: 0.4, leverage: 0.3, breadth: 0.3 },
      liquidity: { volume: 0.4, mcap: 0.3, volatility: 0.3 },
      leverage: { funding: 0.4, oi: 0.35, lsRatio: 0.25 },
      breadth: { dominance: 0.4, altseason: 0.35, gainers: 0.25 },
    },
  };

  constructor(opts = {}) {
    this.cfg = { ...MarketStateWidget.CONFIG, ...opts };
    this._timer = null;
    this._loading = false;
    this._lastData = null;
    this._container = null;
    this._isOpen = false;
    this._isDocsOpen = false;

    this._onDocClick = (e) => {
      if (!this._isOpen) return;
      if (this._container && !this._container.contains(e.target)) {
        this._close();
      }
    };
    this._onKeyDown = (e) => {
      if (e.key === "Escape" && this._isOpen) this._close();
    };
  }

  start() {
    this._container = document.getElementById(this.cfg.containerId);
    if (!this._container) {
      console.warn(
        `⚠️ MarketStateWidget: #${this.cfg.containerId} не найден в DOM`,
      );
      return;
    }
    this._renderSkeleton();

    const cached = this._getCache();
    if (cached) {
      this._lastData = cached;
      this._render(cached);
    }

    this._refresh();
    this._timer = setInterval(() => this._refresh(), this.cfg.refreshMs);

    document.addEventListener("click", this._onDocClick);
    document.addEventListener("keydown", this._onKeyDown);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    document.removeEventListener("click", this._onDocClick);
    document.removeEventListener("keydown", this._onKeyDown);
  }

  refreshNow() {
    return this._refresh(true);
  }

  _toggle() {
    this._isOpen ? this._close() : this._open();
  }

  _open() {
    this._isOpen = true;
    const compact = this._container?.querySelector(".ms-compact");
    const wrap = this._container?.querySelector(".ms-dropdown-wrap");
    if (compact) compact.classList.add("ms-open");
    if (wrap) wrap.classList.add("ms-open");
  }

  _close() {
    this._isOpen = false;
    this._isDocsOpen = false;
    const compact = this._container?.querySelector(".ms-compact");
    const wrap = this._container?.querySelector(".ms-dropdown-wrap");
    const docs = this._container?.querySelector(".ms-docs-panel");
    const arrow = this._container?.querySelector(".ms-docs-arrow");
    if (compact) compact.classList.remove("ms-open");
    if (wrap) wrap.classList.remove("ms-open");
    if (docs) docs.classList.remove("ms-open");
    if (arrow) arrow.classList.remove("ms-open");
  }

  _toggleDocs() {
    this._isDocsOpen = !this._isDocsOpen;
    const docs = this._container?.querySelector(".ms-docs-panel");
    const arrow = this._container?.querySelector(".ms-docs-arrow");
    if (docs) docs.classList.toggle("ms-open", this._isDocsOpen);
    if (arrow) arrow.classList.toggle("ms-open", this._isDocsOpen);
  }

  _clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  _map(v, inMin, inMax, outMin = 0, outMax = 100) {
    if (inMax === inMin) return outMin;
    const t = (v - inMin) / (inMax - inMin);
    return outMin + this._clamp(t, 0, 1) * (outMax - outMin);
  }
  _log10(v) {
    return Math.log(Math.max(v, 1)) / Math.log(10);
  }
  _fmtNum(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "--";
    if (Math.abs(v) >= 1e12) return (v / 1e12).toFixed(1) + "T";
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return v.toFixed(2);
  }
  _fmtTime(ts) {
    return new Date(ts).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  async _fetchJSON(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.cfg.timeout);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  async _fetchAll() {
    const tasks = await Promise.allSettled([
      this._fetchJSON("https://api.coingecko.com/api/v3/global"),
      this._fetchJSON(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h",
      ),
      this._fetchJSON(
        "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT",
      ),
      this._fetchJSON(
        "https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=24",
      ),
      this._fetchJSON(
        "https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1",
      ),
    ]);

    const g = tasks[0].status === "fulfilled" ? tasks[0].value : {};
    const c = tasks[1].status === "fulfilled" ? tasks[1].value : [];
    const p = tasks[2].status === "fulfilled" ? tasks[2].value : {};
    const oh = tasks[3].status === "fulfilled" ? tasks[3].value : [];
    const ls = tasks[4].status === "fulfilled" ? tasks[4].value : [];

    const btc = Array.isArray(c) ? c.find((x) => x.symbol === "btc") : null;
    const d = g?.data || {};

    return {
      totalMcap: d.total_market_cap?.usd || 0,
      totalVolume: d.total_volume?.usd || 0,
      btcDominance: d.market_cap_percentage?.btc || 0,
      mcapChange24h: d.market_cap_change_percentage_24h_usd || 0,
      btcChange24h: btc?.price_change_percentage_24h || 0,
      fundingRate: parseFloat(p?.lastFundingRate) || 0,
      lsRatio: parseFloat(ls?.[0]?.longShortRatio) || 1.0,
      oiHist: Array.isArray(oh) ? oh : [],
      topCoins: Array.isArray(c) ? c : [],
    };
  }

  _normVolume(v) {
    return this._map(this._log10(v / 1e9), this._log10(30), this._log10(300));
  }
  _normMcap(v) {
    return this._map(this._log10(v / 1e12), this._log10(0.8), this._log10(4));
  }
  _normVolatility(ch) {
    return this._clamp(100 - Math.abs(ch) * 8, 0, 100);
  }
  _normFunding(rate) {
    const r = rate * 100;
    const absR = Math.abs(r);
    const sign = r >= 0 ? 1 : -1;
    const extremity = this._clamp((absR / 0.1) * 50, 0, 50);
    return this._clamp(50 + sign * (50 - extremity), 0, 100);
  }
  _normOI(hist) {
    if (!hist || hist.length < 2) return 50;
    const first = parseFloat(hist[0].sumOpenInterest) || 1;
    const last = parseFloat(hist[hist.length - 1].sumOpenInterest) || first;
    const ch = ((last - first) / first) * 100;
    if (ch >= 20) return 30;
    if (ch >= 10) return 60;
    if (ch >= 0) return 70;
    if (ch >= -10) return 55;
    return 40;
  }
  _normLS(r) {
    if (r >= 2.5) return 25;
    if (r >= 1.8) return 50;
    if (r >= 1.2) return 70;
    if (r >= 0.8) return 80;
    if (r >= 0.5) return 50;
    return 25;
  }
  _normDominance(d) {
    if (d >= 65) return 30;
    if (d >= 55) return 50;
    if (d >= 48) return 75;
    if (d >= 40) return 85;
    return 70;
  }
  _normAltseason(btcCh, coins) {
    if (!coins || coins.length < 10) return 50;
    const top50 = coins.slice(0, 50);
    const beating = top50.filter(
      (x) => (x.price_change_percentage_24h || 0) > btcCh,
    ).length;
    return this._clamp((beating / top50.length) * 100, 0, 100);
  }
  _normGainers(coins) {
    if (!coins || !coins.length) return 50;
    const up = coins.filter(
      (x) => (x.price_change_percentage_24h || 0) > 0,
    ).length;
    return this._clamp((up / coins.length) * 100, 0, 100);
  }

  _computeScores(m) {
    const w = this.cfg.weights;
    const liquidity = Math.round(
      this._normVolume(m.totalVolume) * w.liquidity.volume +
        this._normMcap(m.totalMcap) * w.liquidity.mcap +
        this._normVolatility(m.mcapChange24h) * w.liquidity.volatility,
    );
    const leverage = Math.round(
      this._normFunding(m.fundingRate) * w.leverage.funding +
        this._normOI(m.oiHist) * w.leverage.oi +
        this._normLS(m.lsRatio) * w.leverage.lsRatio,
    );
    const breadth = Math.round(
      this._normDominance(m.btcDominance) * w.breadth.dominance +
        this._normAltseason(m.btcChange24h, m.topCoins) * w.breadth.altseason +
        this._normGainers(m.topCoins) * w.breadth.gainers,
    );
    const macro = Math.round(
      liquidity * w.macro.liquidity +
        leverage * w.macro.leverage +
        breadth * w.macro.breadth,
    );
    return { liquidity, leverage, breadth, macro };
  }

  _getCache() {
    try {
      const raw = localStorage.getItem(this.cfg.cacheKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.ts > this.cfg.cacheTTL) return null;
      return obj.data;
    } catch {
      return null;
    }
  }
  _setCache(data) {
    try {
      localStorage.setItem(
        this.cfg.cacheKey,
        JSON.stringify({ ts: Date.now(), data }),
      );
    } catch {}
  }

  async _refresh() {
    if (this._loading) return;
    this._loading = true;
    this._setStatus("loading");
    try {
      const raw = await this._fetchAll();
      const scores = this._computeScores(raw);
      const data = { ...raw, scores, ts: Date.now() };
      this._lastData = data;
      this._setCache(data);
      this._render(data);
      this._setStatus("ok");
    } catch (e) {
      console.warn("MarketStateWidget: ошибка", e);
      this._setStatus("error");
      if (!this._lastData) this._renderFallback();
    } finally {
      this._loading = false;
    }
  }

  _scaleInfo(v) {
    const x = utils.clamp(Math.round(v), 0, 100);
    for (const s of MACRO_SCALE) {
      if (x >= s.min && x <= s.max) return s;
    }
    return MACRO_SCALE[MACRO_SCALE.length - 1];
  }

  _scoreClass(v) {
    return this._scaleInfo(v).barClass;
  }
  _scoreColor(v) {
    return this._scaleInfo(v).color;
  }
  _scoreLabel(v) {
    return this._scaleInfo(v).label;
  }

  _buildDocsHtml() {
    return `
      <h3>СОСТОЯНИЕ РЫНКА</h3>
      <p>Виджет агрегирует 3 композитных индекса (Ликвидность, Плечо, Широта) в 1 итоговый Macro Score. Каждый индекс и Macro находятся в диапазоне 0–100.</p>
      <h4>Как читать баллы (общая шкала)</h4>
      <ul>
        <li>75–100 🟢 Очень здоровый — Рынок сильный, тренд устойчив, можно торговать</li>
        <li>55–74 🟡 Здоровый/нейтральный — Смешанные сигналы, торгуйте осторожно</li>
        <li>40–54 🟠 Осторожно — Риски растут, снижайте плечо</li>
        <li>20–39 🔴 Риск — Перегрев/паника, лучше в стороне</li>
        <li>0–19 🔴 Экстрим — Кризис, экстремальные условия</li>
      </ul>
      <p><strong>Важно:</strong> это не сигнал покупать/продавать. Это контекст — фильтр, который говорит «сейчас хорошее время для сделок» или «сейчас всё против вас». Сигнал даёт основной движок (7 индикаторов), а виджет помогает решить, стоит ли вообще торговать сейчас.</p>
      <p><strong>1. Ликвидность</strong> — это «толщина» рынка. Насколько легко купить или продать актив без сильного движения цены. Чем выше ликвидность — тем больше денег ходит по рынку, тем меньше проскальзывание в сделках, тем стабильнее цены.</p>
      <p><strong>2. Плечо</strong> — это кредитное плечо, которое используют трейдеры для увеличения потенциальной прибыли. Чем больше плечо — тем больше потенциальная прибыль, но и больше потенциальные потери.</p>
      <p><strong>3. Широта</strong> — это количество торговых пар, в которых можно торговать активом. Чем больше широта — тем больше возможностей для торговли, но и больше рисков.</p>
      <p><strong>Правило:</strong> чем выше Macro → тем больше размер позиции и агрессия. Чем ниже → тем меньше и осторожнее.</p>
      <p><strong>Финальный совет:</strong> используйте виджет не как сигнал, а как фильтр. Он говорит: «сейчас хорошее время торговать» или «лучше не лезть».</p>
      <h4>ПОКАЗАТЕЛИ СОСТОЯНИЯ РЫНКА</h4>
      <p><strong>1. Funding BTC</strong> — ставка финансирования. Формат: +0.0124%</p>
      <ul>
        <li>🟢 зелёный: −0.05% до +0.05% (здоровый диапазон)</li>
        <li>🔴 красный: вне этого диапазона (перегрев/паника)</li>
      </ul>
      <p>Как читать: +0.01% — норма. +0.1% — экстрим (все лонги платят грабительские ставки). −0.1% — паника шортов.</p>
      <p><strong>2. Long/Short</strong> — соотношение счетов. Формат: 1.42</p>
      <ul>
        <li>🟢 зелёный: 0.6 – 2.2 (здоровый баланс)</li>
        <li>🔴 красный: &lt; 0.6 или &gt; 2.2 (перекос)</li>
      </ul>
      <p>Как читать: 1.0 = идеальный баланс. 2.0+ = большинство в лонгах (риск). 0.5 = большинство в шортах (паника).</p>
      <p><strong>3. BTC Dom</strong> — доминирование BTC. Формат: 52.3%</p>
      <p>Серый цвет (не оценивается как +/-). Как читать: &gt;60% = альтам плохо. 40-50% = альтсезон близко. &lt;40% = альт-эйфория.</p>
      <p><strong>4. MCap 24h</strong> — изменение капитализации за сутки. Формат: +1.2%</p>
      <ul>
        <li>🟢 зелёный: положительное</li>
        <li>🔴 красный: отрицательное</li>
      </ul>
      <p>Как читать: ±1% = спокойный день. ±5% = активный день. ±10% = экстрим.</p>
      <p><strong>5. Объём 24h</strong> — объём торгов за сутки. Формат: $85.3B или $2.1T</p>
      <p>Нейтральный цвет. Как читать: выше $100B — высокий интерес. Ниже $30B — тонко.</p>
      <p><strong>6. Капитализация</strong> — общая капитализация. Формат: $2.4T</p>
      <p>Нейтральный цвет. Как читать: абсолютная цифра. Важна динамика, а не само значение.</p>
      <p><strong>Итоговый Macro Score = Ликвидность × 0.4 + Плечо × 0.3 + Широта × 0.3</strong></p>
    `;
  }

  _renderSkeleton() {
    this._container.innerHTML = `
      <div class="ms-compact" title="Состояние рынка — Macro Heatmap">
        <span class="ms-compact-dot ms-loading"></span>
        <span class="ms-compact-label">СОСТОЯНИЕ РЫНКА</span>
        <span class="ms-compact-value" style="color:#94a3b8;">--</span>
        <span class="ms-compact-arrow">▶</span>
      </div>
      <div class="ms-dropdown-wrap">
        <div class="ms-panel">
          <div class="ms-panel-header">
            <div class="ms-panel-title">СОСТОЯНИЕ РЫНКА</div>
            <div class="ms-panel-macro">
              <span class="ms-panel-macro-value" style="color:#94a3b8;">--</span>
              <span class="ms-panel-macro-label">Macro</span>
            </div>
          </div>
          <div class="ms-heatmap">
            ${["Ликвидность", "Плечо", "Широта"]
              .map(
                (l) => `
              <div class="ms-row">
                <span class="ms-row-label">${l}</span>
                <div class="ms-bar-track"><div class="ms-bar-fill ms-blue"></div></div>
                <span class="ms-bar-value">--</span>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
        <div class="ms-docs-panel">
          <div class="ms-docs-header">
            <span>ДОКУМЕНТАЦИЯ</span>
            <button class="ms-docs-close" type="button">✕</button>
          </div>
          <div class="ms-docs-content"></div>
        </div>
      </div>
    `;
    this._bindEvents();
  }

  _render(data) {
    const s = data.scores;
    const macroInfo = this._scaleInfo(s.macro);

    const compactHtml = `
      <div class="ms-compact" title="Состояние рынка — Macro Heatmap">
        <span class="ms-compact-dot" id="ms-status-dot"></span>
        <span class="ms-compact-label">СОСТОЯНИЕ РЫНКА</span>
        <span class="ms-compact-value" style="color:${macroInfo.color};">${s.macro}</span>
        <span class="ms-compact-arrow">▶</span>
      </div>
    `;

    const rows = [
      { label: "Ликвидность", val: s.liquidity },
      { label: "Плечо", val: s.leverage },
      { label: "Широта", val: s.breadth },
    ];
    const rowsHtml = rows
      .map(
        (r) => `
      <div class="ms-row">
        <span class="ms-row-label">${r.label}</span>
        <div class="ms-bar-track">
          <div class="ms-bar-fill ${this._scoreClass(r.val)}" style="width:${
            r.val
          }%"></div>
        </div>
        <span class="ms-bar-value" style="color:${this._scoreColor(r.val)};">${
          r.val
        }</span>
      </div>
    `,
      )
      .join("");

    const fundingPct = (data.fundingRate * 100).toFixed(4);
    const fundingCls =
      data.fundingRate > 0.0005 || data.fundingRate < -0.0005 ? "neg" : "pos";
    const lsRatioStr = data.lsRatio.toFixed(2);
    const lsCls = data.lsRatio > 2.2 || data.lsRatio < 0.6 ? "neg" : "pos";
    const btcDom = data.btcDominance.toFixed(1);
    const mcapChange = data.mcapChange24h.toFixed(2);
    const mcapCls = data.mcapChange24h >= 0 ? "pos" : "neg";

    const panelHtml = `
      <div class="ms-dropdown-wrap">
        <div class="ms-panel">
          <div class="ms-panel-header">
            <div class="ms-panel-title">Состояние рынка</div>
            <div class="ms-panel-macro">
              <span class="ms-panel-macro-value" style="color:${
                macroInfo.color
              };">${s.macro}</span>
              <span class="ms-panel-macro-label">${macroInfo.label}</span>
            </div>
          </div>

          <div class="ms-heatmap">${rowsHtml}</div>

          <div class="ms-details">
            <div class="ms-detail"><span>Funding BTC</span><span class="ms-detail-val ${fundingCls}">${fundingPct}%</span></div>
            <div class="ms-detail"><span>Long/Short</span><span class="ms-detail-val ${lsCls}">${lsRatioStr}</span></div>
            <div class="ms-detail"><span>BTC Dom</span><span class="ms-detail-val">${btcDom}%</span></div>
            <div class="ms-detail"><span>MCap 24h</span><span class="ms-detail-val ${mcapCls}">${mcapChange}%</span></div>
            <div class="ms-detail"><span>Объём 24h</span><span class="ms-detail-val">$${this._fmtNum(
              data.totalVolume,
            )}</span></div>
            <div class="ms-detail"><span>Капитализация</span><span class="ms-detail-val">$${this._fmtNum(
              data.totalMcap,
            )}</span></div>
          </div>

          <div class="ms-panel-footer">
            <div class="ms-panel-update">
              <span class="ms-dot" id="ms-status-dot"></span>
              <span id="ms-update-time">${this._fmtTime(
                data.ts || Date.now(),
              )}</span>
            </div>
            <button class="ms-refresh-btn" id="ms-refresh-btn" type="button">↻ Обновить</button>
            <button class="ms-docs-btn" id="ms-docs-btn" type="button">
              ДОКУМЕНТАЦИЯ<span class="ms-compact-arrow ms-docs-arrow">▼</span>
            </button>
          </div>
        </div>

        <div class="ms-docs-panel">
          <div class="ms-docs-header">
            <span>ДОКУМЕНТАЦИЯ</span>
            <button class="ms-docs-close" type="button">✕</button>
          </div>
          <div class="ms-docs-content">
            ${this._buildDocsHtml()}
          </div>
        </div>
      </div>
    `;

    this._container.innerHTML = compactHtml + panelHtml;

    if (this._isOpen) this._open();
    if (this._isDocsOpen) {
      const docs = this._container.querySelector(".ms-docs-panel");
      const arrow = this._container.querySelector(".ms-docs-arrow");
      if (docs) docs.classList.add("ms-open");
      if (arrow) arrow.classList.add("ms-open");
    }

    this._bindEvents();
  }

  _renderFallback() {
    this._render({
      scores: { liquidity: 50, leverage: 50, breadth: 50, macro: 50 },
      fundingRate: 0,
      lsRatio: 1,
      btcDominance: 50,
      mcapChange24h: 0,
      totalVolume: 0,
      totalMcap: 0,
      ts: Date.now(),
    });
    this._setStatus("error");
  }

  _bindEvents() {
    const compact = this._container.querySelector(".ms-compact");
    const refreshBtn = this._container.querySelector("#ms-refresh-btn");
    const docsBtn = this._container.querySelector("#ms-docs-btn");
    const docsClose = this._container.querySelector(".ms-docs-close");

    if (compact) {
      compact.addEventListener("click", (e) => {
        e.stopPropagation();
        this._toggle();
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.refreshNow();
      });
    }
    if (docsBtn) {
      docsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._toggleDocs();
      });
    }
    if (docsClose) {
      docsClose.addEventListener("click", (e) => {
        e.stopPropagation();
        this._isDocsOpen = false;
        const docs = this._container.querySelector(".ms-docs-panel");
        const arrow = this._container.querySelector(".ms-docs-arrow");
        if (docs) docs.classList.remove("ms-open");
        if (arrow) arrow.classList.remove("ms-open");
      });
    }
  }

  _setStatus(status) {
    const dot = this._container?.querySelector("#ms-status-dot");
    const time = this._container?.querySelector("#ms-update-time");
    const compactDot = this._container?.querySelector(".ms-compact-dot");

    if (dot) {
      dot.className = "ms-dot";
      if (status === "loading") dot.classList.add("ms-loading");
      else if (status === "error") dot.classList.add("ms-error");
    }
    if (compactDot) {
      compactDot.className = "ms-compact-dot";
      if (status === "loading") compactDot.classList.add("ms-loading");
      else if (status === "error") compactDot.classList.add("ms-error");
    }
    if (time && status === "ok") time.textContent = this._fmtTime(Date.now());
  }
}

// ============================================================
//  TF GUIDE PANEL (◂ выпадающая панель с doc-card активного TF)
//  Логика:
//   • При смене TF панель ОСТАЁТСЯ открытой (если была открыта),
//     содержимое просто перерисовывается.
//   • Закрыть можно: повторным кликом на ◂, кнопкой ✕,
//     кликом вне панели или Escape.
//   • Клик по .tf-btn (смена таймфрейма) НЕ закрывает панель.
// ============================================================
class TFGuidePanel {
  constructor() {
    this._isOpen = false;
    this._el = {
      trigger: null,
      wrap: null,
      body: null,
      closeBtn: null,
    };
    this._currentTF = CONFIG.defaultTF;

    this._onDocClick = (e) => {
      if (!this._isOpen) return;

      if (this._el.trigger && this._el.trigger.contains(e.target)) return;

      const tfBtn = e.target.closest?.(".tf-btn");
      if (tfBtn) return;

      if (this._el.closeBtn && this._el.closeBtn.contains(e.target)) return;

      if (this._el.wrap && this._el.wrap.contains(e.target)) return;

      this.close();
    };

    this._onKeyDown = (e) => {
      if (e.key === "Escape" && this._isOpen) this.close();
    };
  }

  init() {
    this._el.trigger = document.querySelector(".tf-arrow");
    this._el.wrap = document.getElementById("tf-guide-panel");
    this._el.body = document.getElementById("tf-guide-body");
    this._el.closeBtn = document.querySelector(".tf-guide-panel-close");

    if (!this._el.trigger || !this._el.wrap || !this._el.body) {
      console.warn("⚠️ TFGuidePanel: элементы не найдены в DOM");
      return;
    }

    this._renderCard(this._currentTF);

    this._el.trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });

    if (this._el.closeBtn) {
      this._el.closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    document.addEventListener("click", this._onDocClick);
    document.addEventListener("keydown", this._onKeyDown);
  }

  destroy() {
    document.removeEventListener("click", this._onDocClick);
    document.removeEventListener("keydown", this._onKeyDown);
  }

  setTF(tf) {
    this._currentTF = tf;
    this._renderCard(tf);
  }

  toggle() {
    this._isOpen ? this.close() : this.open();
  }

  open() {
    this._isOpen = true;
    this._el.wrap?.classList.add("ms-open");
    this._el.trigger?.classList.add("active");
  }

  close() {
    this._isOpen = false;
    this._el.wrap?.classList.remove("ms-open");
    this._el.trigger?.classList.remove("active");
  }

  _renderCard(tf) {
    const guide = TF_GUIDES[tf];
    if (!guide || !this._el.body) return;
    this._el.body.innerHTML = `
      <div class="doc-card" data-tf="${tf}">
        <div class="tf-name">${guide.icon} ${guide.name}</div>
        <div style="margin:4px 0; font-size:11px;"><span class="action-buy"><span style="color:green;">▲</span> BUY:</span> ${guide.action.BUY}</div>
        <div style="margin:4px 0; font-size:11px;"><span class="action-sell"><span style="color:red;">▼</span> SELL:</span> ${guide.action.SELL}</div>
        <div style="margin:4px 0; font-size:11px;"><span class="action-wait">⏸️ WAIT:</span> ${guide.action.WAIT}</div>
        <div style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05);">
          <div><span class="risk-label">Риск:</span> <span class="risk-value">${guide.risk}</span></div>
          <div><span class="risk-label">Размер:</span> <span class="risk-value">${guide.positionSize}</span></div>
          <div><span class="risk-label">Стоп:</span> <span class="risk-value" style="color:#f87171;">${guide.stopLoss}</span></div>
          <div><span class="risk-label">Профит:</span> <span class="risk-value" style="color:#34d399;">${guide.takeProfit}</span></div>
        </div>
      </div>
    `;
  }
}

// ---------- Рендерер UI ----------
class UIRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error("Контейнер не найден");
    this.cards = {};
    this.soundManager = null;
    this.currentTF = CONFIG.defaultTF;
    this.signals = new Map();
    this.tradeHistory = [];
    this.stats = {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      winRate: 0,
    };
    this._lastSignalKey = {};
    this.tfGuide = new TFGuidePanel();
  }

  setSoundManager(sm) {
    this.soundManager = sm;
  }

  render() {
    const html = this._buildHTML();
    this.container.innerHTML = html;
    this._cacheElements();
    this._bindEvents();
    this.tfGuide.init();
    return this;
  }

  _buildHTML() {
    const assetCards = CONFIG.assets
      .map(
        (asset) => `
            <div class="signal-card neutral" data-asset="${asset}">
                <div class="signal-strength-badge"></div>
                <div class="card-header">
                    <span class="asset-name">${this._displayName(asset)}</span>
                    <span class="asset-price">--</span>
                </div>
                <div class="card-body">
                    <span class="signal-direction">⏳ Ожидание</span>
                    <span class="signal-confidence">--%</span>
                </div>
                <div class="indicators-grid">
                    ${["rsi", "macd", "ema", "cvd", "bb", "volume", "poc"]
                      .map(
                        (ind) => `
                        <div class="indicator-item" data-indicator="${ind}">
                            <span class="ind-label">${this._indLabel(
                              ind,
                            )}</span>
                            <div class="indicator-bar-wrap">
                                <div class="indicator-bar-fill neutral" style="width:0%"></div>
                            </div>
                            <span class="ind-value neutral">--</span>
                        </div>
                    `,
                      )
                      .join("")}
                </div>
                <div class="action-indicators">
                    <div class="action-indicator wait" data-action="wait">
                        <span class="label">⏸️ Ждать</span>
                        <span class="value">0%</span>
                        <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
                    </div>
                    <div class="action-indicator buy" data-action="buy">
                        <span class="label"><span style="color:green;">▲</span> Купить</span>
                        <span class="value">0%</span>
                        <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
                    </div>
                    <div class="action-indicator sell" data-action="sell">
                        <span class="label">🔻 Продать</span>
                        <span class="value">0%</span>
                        <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
                    </div>
                </div>
                <div class="card-footer">
                    <span class="tf-signal">--</span>
                </div>
            </div>
        `,
      )
      .join("");

    return `
            <div class="crypto-signal-widget">
                <div class="widget-header">
                    <div>
                        <span class="widget-title">⚛ CRYPTO SIGNAL TOOL ⚛</span>
                        <span class="widget-version"><b>v10.1</b> • Приложение работает в реальном времени, анализируя данные 7 индикаторов с 7 криптобирж (Binance, Bybit, OKX, MEXC, Coinbase, HTX, KuCoin) •</span>
                    </div>
                    <div class="widget-status-group">
                        <div class="sound-controls">
                            <button class="sound-toggle active" id="sound-toggle">
                                🔊 <span class="sound-label">Вкл</span>
                            </button>
                            <span class="sound-status" id="sound-status">
                                <span class="sound-indicator on"></span>
                            </span>
                            <span class="sound-info">Звук при ≥75%</span>
                        </div>
                        <div class="ws-status-group">
                          <span class="ws-status" id="ws-status">⚡ Подключение...</span>
                          <span class="last-update" id="last-update">--:--:--</span>
                        </div>
                    </div>
                </div>

                <div class="tf-group" id="tf-group">
                    <div class="tf-arrow-wrap">
                        <button class="tf-arrow" type="button" data-tf="◂">◂</button>
                        <div class="tf-guide-panel" id="tf-guide-panel">
                            <div class="tf-guide-panel-header">
                                <span>ГАЙД ТАЙМФРЕЙМА</span>
                                <button class="tf-guide-panel-close" type="button" title="Закрыть">✕</button>
                            </div>
                            <div class="tf-guide-panel-body" id="tf-guide-body"></div>
                        </div>
                    </div>
                    ${CONFIG.timeframes
                      .map(
                        (tf) =>
                          `<button class="tf-btn ${
                            tf === CONFIG.defaultTF ? "active" : ""
                          }" data-tf="${tf}">${tf}</button>`,
                      )
                      .join("")}
                    <div class="signal-count-item">⚡ <span id="signal-count">0</span> сигналов</div>

                    <!-- === Fear & Greed === -->
                    <div class="fng-widget" id="fngWidget" title="Crypto Fear & Greed Index">
                        <span class="fng-label">СТРАХ & ЖАДНОСТЬ</span>
                        <div class="fng-track">
                            <div class="fng-marker" id="fngMarker"></div>
                        </div>
                        <span class="fng-value" id="fngValue">50 Neutral</span>
                    </div>

                    <!-- === Market State Widget (Macro Heatmap) === -->
                    <div class="ms-inline-slot">
                        <div id="market-state-widget"></div>
                    </div>
                </div>

                <div class="signal-grid" id="signal-grid">
                    ${assetCards}
                </div>

                <div class="trade-history-section">
                    <div class="trade-history-header">
                        <div class="trade-history-title">ИСТОРИЯ ТОРГОВЛИ (backtesting) стратегии на исторических данных. Виджет симулирует торговлю, используя те же самые 7 индикаторов, и показывает, как бы вы заработали или потеряли деньги, если бы следовали сигналам в прошлом.</div>
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
                    <div class="footer-stat">🎯 >75% Сильный</div>
                    <div class="footer-stat">💾 <span id="cache-status">Кэш</span></div>
                    <div class="footer-stat">🔗 <span id="connection-info">WebSocket</span></div>
                    <div class="footer-stat">📈 <span id="history-status">История</span></div>
                    <div class="footer-stat">⚡<span id="asset-count">${
                      CONFIG.assets.length
                    } активов</span></div>
                </div>

                <div class="docs-wrapper">
                    <details>
                        <summary>ДОКУМЕНТАЦИЯ</summary>
                        <div class="docs-content">
                            ${this._buildDocs()}
                        </div>
                    </details>
                </div>
            </div>
        `;
  }

  _buildDocs() {
    const w = CONFIG.scoring.weights;
    const totalW = Object.values(w).reduce((s, v) => s + v, 0) || 1;
    const pct = (k) => Math.round((w[k] / totalW) * 100);

    return `
            <div class="doc-grid">
                ${CONFIG.timeframes
                  .map((tf) => {
                    const guide = TF_GUIDES[tf];
                    if (!guide) return "";
                    return `
                        <div class="doc-card" data-tf="${tf}">
                            <div class="tf-name">${guide.icon} ${guide.name}</div>
                            <div style="margin:4px 0; font-size:11px;"><span class="action-buy"><span style="color:green;">▲</span> BUY:</span> ${guide.action.BUY}</div>
                            <div style="margin:4px 0; font-size:11px;"><span class="action-sell">🔻 SELL:</span> ${guide.action.SELL}</div>
                            <div style="margin:4px 0; font-size:11px;"><span class="action-wait">⏸️ WAIT:</span> ${guide.action.WAIT}</div>
                            <div style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05);">
                                <div><span class="risk-label">Риск:</span> <span class="risk-value">${guide.risk}</span></div>
                                <div><span class="risk-label">Размер:</span> <span class="risk-value">${guide.positionSize}</span></div>
                                <div><span class="risk-label">Стоп:</span> <span class="risk-value" style="color:#f87171;">${guide.stopLoss}</span></div>
                                <div><span class="risk-label">Профит:</span> <span class="risk-value" style="color:#34d399;">${guide.takeProfit}</span></div>
                            </div>
                        </div>
                    `;
                  })
                  .join("")}
            </div>
            <div class="doc-legend">
                <span class="legend-item"><span class="legend-dot buy-dot"></span> BUY</span>
                <span class="legend-item"><span class="legend-dot sell-dot"></span> SELL</span>
                <span class="legend-item"><span class="legend-dot wait-dot"></span> WAIT</span>
                <span class="legend-item"><span class="legend-dot strong-dot"></span> Strong (>75%)</span>
                <span class="legend-item" style="color:#fbbf24;">🔊 Звук при ≥75%</span>
                <span class="legend-item">⚠️ Риск-менеджмент обязателен! ⚠️</span>
            </div>
            <div style="margin-top:8px; padding:8px 12px; background:rgba(255,255,255,0.03); border-radius:8px; font-size:11px; color:#94a3b8;">
                <strong style="color:#e2e8f0;">📌 Общие правила:</strong><br>
                • Используйте 4H как основной таймфрейм для входа<br>
                • 1H и 2H — для уточнения точек входа<br>
                • 15m — только для скальпинга (опытные трейдеры)<br>
                • 1D — для долгосрочных инвестиций<br>
                • Всегда используйте стоп-лосс!<br>
                • Не рискуйте более 2-3% депозита на одну сделку<br>
                • Диверсифицируйте активы (не более 30% в один актив)
            </div>
            <br>
            <span>Данное приложение — это мощный инструмент для принятия торговых решений, но не гарантия прибыли. Это профессиональный торговый терминал для криптовалют, который объединяет 7 лучших технических индикаторов в единую систему генерации сигналов. Приложение работает в реальном времени, анализируя данные с 7 криптобирж (Binance, Bybit, OKX, MEXC, Coinbase, HTX, KuCoin)</span>
            <br><br>
            <span>🧠 РАСШИФРОВКА 7 ИНДИКАТОРОВ (веса настраиваются в CONFIG.scoring.weights, итог автонормируется к 100%)<br>
              1. RSI — вес ${w.rsi} → ${pct("rsi")}%<br>
              2. MACD — вес ${w.macd} → ${pct("macd")}%<br>
              3. EMA Ribbon — вес ${w.ema} → ${pct("ema")}%<br>
              4. CVD — вес ${w.cvd} → ${pct("cvd")}%<br>
              5. Bollinger Bands — вес ${w.bb} → ${pct("bb")}%<br>
              6. Volume Spike — вес ${w.volume} → ${pct("volume")}%<br>
              7. POC — вес ${w.poc} → ${pct("poc")}%<br>
              <em style="color:#64748b;">Сумма сырых весов: ${totalW} (нормируется автоматически).</em>
            </span>
            <br>
            <span>
                <strong>МЕРЦАНИЕ</strong><br>
                60-64% Слабая • 65-69% Средняя • 70-74% Сильная • 75-79% Очень сильная • 80%+ Экстремальная
            </span>
        `;
  }

  _displayName(asset) {
    const map = {
      BTC: "BTC",
      ETH: "ETH",
      BNB: "BNB",
      SOL: "SOL",
      XRP: "XRP",
      ADA: "ADA",
      GRAM: "GRAM",
      TRX: "TRX",
      PAXG: "PAXG",
    };
    return map[asset] || asset;
  }

  _indLabel(ind) {
    const map = {
      rsi: "RSI",
      macd: "MACD",
      ema: "EMA Ribbon",
      cvd: "CVD",
      bb: "Bollinger",
      volume: "Volume",
      poc: "POC",
    };
    return map[ind] || ind;
  }

  _cacheElements() {
    this.el = {
      grid: document.getElementById("signal-grid"),
      status: document.getElementById("ws-status"),
      lastUpdate: document.getElementById("last-update"),
      signalCount: document.getElementById("signal-count"),
      cacheStatus: document.getElementById("cache-status"),
      connectionInfo: document.getElementById("connection-info"),
      historyGrid: document.getElementById("trade-history-grid"),
      historyStatus: document.getElementById("history-status"),
      assetCount: document.getElementById("asset-count"),
      soundStatusFooter: document.getElementById("sound-status-footer"),
      soundToggle: document.getElementById("sound-toggle"),
      tfGroup: document.getElementById("tf-group"),
      statTotal: document.getElementById("stat-total"),
      statWins: document.getElementById("stat-wins"),
      statLosses: document.getElementById("stat-losses"),
      statWinrate: document.getElementById("stat-winrate"),
      statPl: document.getElementById("stat-pl"),
    };
    this.cards = {};
    document.querySelectorAll(".signal-card").forEach((card) => {
      const asset = card.dataset.asset;
      this.cards[asset] = card;
    });
  }

  _bindEvents() {
    if (this.el.soundToggle) {
      this.el.soundToggle.addEventListener("click", () => {
        if (this.soundManager) {
          const enabled = this.soundManager.toggle();
          this.el.soundToggle.className = `sound-toggle ${
            enabled ? "active" : "muted"
          }`;
          this.el.soundToggle.innerHTML = `${
            enabled ? "🔊" : "🔇"
          }<span class="sound-label">${enabled ? "Вкл" : "Выкл"}</span>`;
          if (this.el.soundStatusFooter) {
            this.el.soundStatusFooter.textContent = `Звук: ${
              enabled ? "Вкл" : "Выкл"
            }`;
          }
        }
      });
    }
    if (this.el.tfGroup) {
      this.el.tfGroup.addEventListener("click", (e) => {
        const btn = e.target.closest(".tf-btn");
        if (!btn) return;
        this.el.tfGroup
          .querySelectorAll(".tf-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentTF = btn.dataset.tf;
        this.tfGuide.setTF(this.currentTF);
        if (this.onTFChange) this.onTFChange(this.currentTF);
      });
    }
  }

  updateSignal(asset, signal) {
    this.signals.set(asset, signal);
    const card = this.cards[asset];
    if (!card) return;

    const priceEl = card.querySelector(".asset-price");
    if (priceEl && signal.price)
      priceEl.textContent = `$${signal.price.toFixed(2)}`;

    const dirEl = card.querySelector(".signal-direction");
    const confEl = card.querySelector(".signal-confidence");
    const displayDir = signal.scoreDirection || signal.direction;
    if (dirEl) {
      let icon = "⏸️",
        color = "#94a3b8",
        bg = "rgba(255,255,255,0.05)";
      if (displayDir === "BUY") {
        icon = "📈";
        color = "#34d399";
        bg = "rgba(52,211,153,0.15)";
      } else if (displayDir === "SELL") {
        icon = "📉";
        color = "#f87171";
        bg = "rgba(248,113,113,0.15)";
      }
      dirEl.textContent = `${icon} ${displayDir}`;
      dirEl.style.background = bg;
      dirEl.style.color = color;
    }
    if (confEl) {
      const conf = signal.confidence || 0;
      confEl.textContent = conf > 0 ? `${conf}%` : "--%";
      confEl.style.color =
        conf >= 75
          ? "#34d399"
          : conf >= 60
            ? "#fbbf24"
            : conf >= 45
              ? "#f59e0b"
              : "#475569";
    }

    this._updateIndicators(card, signal.indicatorScores);
    this._updateActions(card, signal.actionProbabilities);
    this._updateBadgeAndGlow(card, displayDir, signal.confidence);

    const tfEl = card.querySelector(".tf-signal");
    if (tfEl && signal.indicators) {
      tfEl.textContent = `RSI:${signal.indicators.rsi} | MACD:${signal.indicators.macd}`;
    }

    if (
      this.soundManager &&
      signal.confidence >= CONFIG.sound.threshold &&
      displayDir !== "NEUTRAL"
    ) {
      const signalType = displayDir;
      const currentKey = `${asset}-${signalType}-${signal.confidence}`;
      const prevKey = this._lastSignalKey?.[asset];
      if (prevKey !== currentKey) {
        this.soundManager.stopRepeating(asset);
        this.soundManager.startRepeating(asset, signalType, signal.confidence);
        this._lastSignalKey = this._lastSignalKey || {};
        this._lastSignalKey[asset] = currentKey;
      }
    } else if (this.soundManager) {
      this.soundManager.stopRepeating(asset);
      if (this._lastSignalKey) delete this._lastSignalKey[asset];
    }
  }

  _updateIndicators(card, scores) {
    if (!scores) return;
    const items = card.querySelectorAll(".indicator-item");
    const keys = ["rsi", "macd", "ema", "cvd", "bb", "volume", "poc"];
    items.forEach((item, idx) => {
      const key = keys[idx];
      const score = scores[key] || 0;
      const valueEl = item.querySelector(".ind-value");
      const barFill = item.querySelector(".indicator-bar-fill");
      if (!valueEl || !barFill) return;

      // scores теперь в диапазоне примерно [-50%, +50%] (нормированные).
      // Масштабируем для UI: 20 → 100%.
      let direction = "neutral",
        display = "0%";
      if (score > 0) {
        const pct = Math.min((score / 20) * 100, 100);
        display = `+${Math.round(pct)}%`;
        direction = score >= 15 ? "strong-bullish" : "bullish";
      } else if (score < 0) {
        const pct = Math.min((Math.abs(score) / 20) * 100, 100);
        display = `-${Math.round(pct)}%`;
        direction = Math.abs(score) >= 15 ? "strong-bearish" : "bearish";
      }
      valueEl.textContent = display;
      valueEl.className = `ind-value ${direction}`;
      const barPercent = Math.min((Math.abs(score) / 20) * 100, 100);
      barFill.style.width = `${barPercent}%`;
      barFill.className = `indicator-bar-fill ${
        direction.includes("bullish")
          ? "bullish"
          : direction.includes("bearish")
            ? "bearish"
            : "neutral"
      }`;
    });
  }

  _updateActions(card, probs) {
    if (!probs) return;
    const actions = card.querySelectorAll(".action-indicator");
    actions.forEach((el) => {
      const action = el.dataset.action;
      const valueEl = el.querySelector(".value");
      const barFill = el.querySelector(".bar-fill");
      if (!valueEl || !barFill) return;
      const pct = probs[action] || 0;
      valueEl.textContent = `${pct}%`;
      barFill.style.width = `${pct}%`;
      el.classList.toggle("active", pct > 30);
    });
  }

  _updateBadgeAndGlow(card, direction, confidence) {
    const badge = card.querySelector(".signal-strength-badge");
    card.className = card.className
      .split(" ")
      .filter(
        (cls) =>
          !cls.startsWith("buy-") &&
          !cls.startsWith("sell-") &&
          cls !== "neutral",
      )
      .join(" ");
    if (badge) {
      badge.className = "signal-strength-badge";
      badge.textContent = "";
    }
    if (direction === "NEUTRAL" || confidence < 60) {
      card.classList.add("neutral");
      return;
    }
    let signalClass = "",
      badgeText = "",
      badgeClass = "";
    const isBuy = direction === "BUY";
    if (confidence >= 80) {
      signalClass = isBuy ? "buy-80" : "sell-80";
      badgeText = isBuy ? "🔥 СИЛЬНЫЙ BUY" : "🔥 СИЛЬНЫЙ SELL";
      badgeClass = isBuy ? "buy-strong" : "sell-strong";
    } else if (confidence >= 75) {
      signalClass = isBuy ? "buy-75" : "sell-75";
      badgeText = isBuy ? "💪 BUY 75%+" : "💪 SELL 75%+";
      badgeClass = isBuy ? "buy-strong" : "sell-strong";
    } else if (confidence >= 70) {
      signalClass = isBuy ? "buy-70" : "sell-70";
      badgeText = isBuy ? "📈 BUY 70%+" : "📉 SELL 70%+";
      badgeClass = isBuy ? "buy" : "sell";
    } else if (confidence >= 65) {
      signalClass = isBuy ? "buy-65" : "sell-65";
      badgeText = isBuy ? "📈 BUY 65%+" : "📉 SELL 65%+";
      badgeClass = isBuy ? "buy" : "sell";
    } else {
      signalClass = isBuy ? "buy-60" : "sell-60";
      badgeText = isBuy ? "📈 BUY 60%+" : "📉 SELL 60%+";
      badgeClass = isBuy ? "buy" : "sell";
    }
    card.classList.add(signalClass);
    if (badge) {
      badge.textContent = badgeText;
      badge.className = `signal-strength-badge visible ${badgeClass}`;
    }
  }

  updateTradeHistory(history, stats) {
    this.tradeHistory = history || [];
    this.stats = stats || {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      winRate: 0,
    };
    this._renderHistory();
    this._updateStatsUI();
  }

  _renderHistory() {
    const grid = this.el.historyGrid;
    if (!grid) return;
    const trades = this.tradeHistory;
    if (!trades.length) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:#475569; font-size:12px; padding:20px;">📭 Нет сделок</div>`;
      return;
    }
    const display = trades.slice(0, 20);
    grid.innerHTML = display
      .map((t) => {
        const isWin = t.profit > 0;
        const profitStr =
          (t.profit >= 0 ? "+" : "") + t.profit.toFixed(2) + "$";
        const dirLabel = t.direction === "BUY" ? "📈 BUY" : "📉 SELL";
        const badgeCls = t.direction === "BUY" ? "buy-badge" : "sell-badge";
        const date = new Date(t.entryTime).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        const assetName = this._displayName(t.asset) || t.asset;
        return `
                <div class="trade-card">
                    <div class="trade-info">
                        <div class="trade-asset">${assetName}</div>
                        <div class="trade-detail">
                            <span class="trade-direction-badge ${badgeCls}">${dirLabel}</span>
                            <span style="color:#475569; margin-left:6px;">conf: ${
                              t.confidence
                            }%</span>
                        </div>
                        <div class="trade-detail">Entry: $${t.entryPrice.toFixed(
                          2,
                        )} → Exit: $${t.exitPrice.toFixed(2)}</div>
                        <div class="trade-time">${date}</div>
                    </div>
                    <div class="trade-result">
                        <div class="trade-profit ${
                          isWin ? "positive" : "negative"
                        }">${profitStr}</div>
                        <div style="font-size:10px; color:#64748b;">${
                          (t.profitPercent >= 0 ? "+" : "") +
                          t.profitPercent.toFixed(2)
                        }%</div>
                        <div style="font-size:8px; color:#475569; margin-top:2px;">${
                          t.exitReason === "take_profit"
                            ? "✅ TP"
                            : t.exitReason === "stop_loss"
                              ? "🛑 SL"
                              : t.exitReason === "reverse_signal"
                                ? "🔄 REV"
                                : "⏱️ TO"
                        }</div>
                    </div>
                </div>
            `;
      })
      .join("");
    if (trades.length > 20) {
      grid.innerHTML += `<div style="grid-column:1/-1; text-align:center; color:#475569; font-size:11px; padding:8px;">+ ${
        trades.length - 20
      } more...</div>`;
    }
  }

  _updateStatsUI() {
    const s = this.stats;
    if (this.el.statTotal) this.el.statTotal.textContent = s.totalTrades;
    if (this.el.statWins) this.el.statWins.textContent = s.wins;
    if (this.el.statLosses) this.el.statLosses.textContent = s.losses;
    if (this.el.statWinrate) {
      const wr = s.totalTrades ? s.winRate.toFixed(1) + "%" : "0%";
      this.el.statWinrate.textContent = wr;
      this.el.statWinrate.style.color =
        s.winRate > 50 ? "#34d399" : s.winRate > 30 ? "#fbbf24" : "#f87171";
    }
    if (this.el.statPl) {
      const pl = s.totalProfit;
      this.el.statPl.textContent = (pl >= 0 ? "+" : "") + pl.toFixed(2) + "$";
      this.el.statPl.style.color =
        pl > 0 ? "#34d399" : pl < 0 ? "#f87171" : "#94a3b8";
    }
  }

  setConnectionStatus(connected) {
    const status = this.el.status;
    if (status) {
      status.textContent = connected ? "🟢 Live" : "🔴 Переподключение...";
      status.style.color = connected ? "#34d399" : "#f87171";
    }
    if (this.el.connectionInfo) {
      this.el.connectionInfo.textContent = connected
        ? "🟢 Подключен"
        : "🔴 Отключен";
      this.el.connectionInfo.style.color = connected ? "#34d399" : "#f87171";
    }
  }

  setLastUpdate(time) {
    if (this.el.lastUpdate) this.el.lastUpdate.textContent = time;
  }
  setSignalCount(count) {
    if (this.el.signalCount) this.el.signalCount.textContent = count;
  }
  setCacheStatus(text) {
    if (this.el.cacheStatus) this.el.cacheStatus.textContent = text;
  }
  setHistoryStatus(text) {
    if (this.el.historyStatus) this.el.historyStatus.textContent = text;
  }

  onTFChange = null;
}

// ---------- Главный класс приложения ----------
class App {
  constructor() {
    this.sound = new SoundManager();
    this.dataLoader = new DataLoader();
    this.indicatorCalc = new IndicatorCalculator();
    this.signalGen = new SignalGenerator(this.indicatorCalc);
    this.backtester = new Backtester(this.signalGen);
    this.ui = new UIRenderer("signal-widget");
    this.ui.setSoundManager(this.sound);
    this.ui.onTFChange = (tf) => this.onTFChange(tf);

    this.marketData = new Map();
    this.signals = new Map();
    this.currentTF = CONFIG.defaultTF;
    this.wsManager = null;
    this._updateInterval = null;
    this._historyLoaded = false;
    this._signalThrottle = null;
    this._loadingAssets = new Set();
    this._loadedTF = null;

    this.fng = new FearGreedManager(CONFIG.fearGreed);
    this.marketState = null;
  }

  async init() {
    this.ui.render();
    this._bindUIEvents();

    this.fng.start();

    this.marketState = new MarketStateWidget();
    this.marketState.start();

    this.wsManager = new WSManager((data) => this._handleKline(data));
    this.wsManager.onStatus = (connected) =>
      this.ui.setConnectionStatus(connected);
    this.wsManager.connect();

    await this._loadHistoricalData();
    this._generateSignals();

    this._updateInterval = setInterval(() => this._generateSignals(), 120000);

    setInterval(() => {
      this.ui.setLastUpdate(new Date().toLocaleTimeString());
    }, 30000);

    console.log("✅ Приложение инициализировано");
    window.__app = this;
  }

  _bindUIEvents() {}

  async _loadHistoricalData() {
    const tf = this.currentTF;
    if (this._historyLoaded && this._loadedTF === tf) return;
    this.ui.setHistoryStatus("⏳ Загрузка...");
    let loaded = 0;
    for (const asset of CONFIG.assets) {
      const symbol = CONFIG.symbolMap[asset];
      const candles = await this.dataLoader.fetchCandles(
        symbol,
        tf,
        CONFIG.historyCandles,
      );
      if (candles && candles.length) {
        this.marketData.set(asset, candles);
        loaded++;
      } else {
        console.warn(`⚠️ Нет данных для ${asset}`);
      }
    }
    this.ui.setCacheStatus(`${loaded}/${CONFIG.assets.length} активов`);
    this._historyLoaded = loaded > 0;
    this._loadedTF = tf;
    if (loaded === 0) {
      this.ui.setHistoryStatus("⚠️ Нет данных");
      return;
    }
    setTimeout(() => this._runBacktest(), 500);
  }

  async _runBacktest() {
    const allTrades = [];
    for (const asset of CONFIG.assets) {
      const candles = this.marketData.get(asset);
      if (!candles || candles.length < 100) continue;
      const trades = await this.backtester.run(asset, candles, this.currentTF);
      allTrades.push(...trades);
    }
    allTrades.sort((a, b) => b.exitTime - a.exitTime);
    this.ui.updateTradeHistory(
      allTrades,
      this.backtester.computeStats(allTrades),
    );
    this.ui.setHistoryStatus(`${allTrades.length} сделок`);
  }

  _tfToMs(tf) {
    const map = {
      "15m": 15 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "2h": 2 * 60 * 60 * 1000,
      "4h": 4 * 60 * 60 * 1000,
      "1d": 24 * 60 * 60 * 1000,
    };
    return map[tf] || map["1h"];
  }

  _handleKline(data) {
    const k = data.k;
    const symbol = data.s;
    const asset = Object.keys(CONFIG.symbolMap).find(
      (a) => CONFIG.symbolMap[a] === symbol,
    );
    if (!asset || !CONFIG.assets.includes(asset)) return;
    if (!this.marketData.has(asset)) this.marketData.set(asset, []);
    const candles = this.marketData.get(asset);
    const openTime = Number(k.t);
    const tfMs = this._tfToMs(this.currentTF);
    const bucket = Math.floor(openTime / tfMs) * tfMs;
    const last = candles[candles.length - 1];
    const lastBucket = last ? Math.floor(last.time / tfMs) * tfMs : null;

    if (last && lastBucket === bucket) {
      last.high = Math.max(last.high, +k.h);
      last.low = Math.min(last.low, +k.l);
      last.close = +k.c;
    } else if (!last || bucket > lastBucket) {
      candles.push({
        open: +k.o,
        high: +k.h,
        low: +k.l,
        close: +k.c,
        volume: +k.v,
        time: bucket,
      });
    }

    if (candles.length > CONFIG.maxCandles) candles.splice(0, 100);
    if (!this._signalThrottle) {
      this._signalThrottle = setTimeout(() => {
        this._generateSignals();
        this._signalThrottle = null;
      }, 30000);
    }
  }

  async onTFChange(tf) {
    this.currentTF = tf;
    this._historyLoaded = false;
    await this._loadHistoricalData();
    this._generateSignals();
  }

  _generateSignals() {
    const tf = this.currentTF;
    let activeCount = 0;
    for (const asset of CONFIG.assets) {
      const candles = this.marketData.get(asset);
      if (!candles || candles.length < CONFIG.minCandlesRequired) {
        if (!this._loadingAssets.has(asset)) this._loadAssetData(asset);
        continue;
      }
      const agg = this._aggregateCandles(candles, tf);
      if (!agg || agg.length < CONFIG.minCandlesRequired) continue;
      const signal = this.signalGen.generate(asset, tf, agg);
      if (signal) {
        this.signals.set(asset, signal);
        this.ui.updateSignal(asset, signal);
        if (
          (signal.scoreDirection || signal.direction) !== "NEUTRAL" &&
          signal.confidence >= 60
        )
          activeCount++;
      }
    }
    this.ui.setSignalCount(activeCount);
    this.ui.setLastUpdate(new Date().toLocaleTimeString());
  }

  _aggregateCandles(candles, tf) {
    const tfMap = { "15m": 15, "1h": 60, "2h": 120, "4h": 240, "1d": 1440 };
    const minutes = tfMap[tf] || 60;
    const agg = [];
    let current = null;
    for (const c of candles) {
      if (!current) {
        current = { ...c };
        continue;
      }
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

  async _loadAssetData(asset) {
    if (this._loadingAssets.has(asset)) return;
    this._loadingAssets.add(asset);
    try {
      const symbol = CONFIG.symbolMap[asset];
      const candles = await this.dataLoader.fetchCandles(
        symbol,
        this.currentTF,
        CONFIG.historyCandles,
      );
      if (candles && candles.length) {
        this.marketData.set(asset, candles);
        this._generateSignals();
        this.ui.setCacheStatus(`📊 ${this.marketData.size} активов`);
      }
    } finally {
      this._loadingAssets.delete(asset);
    }
  }

  destroy() {
    if (this.wsManager) this.wsManager.close();
    if (this._updateInterval) clearInterval(this._updateInterval);
    if (this._signalThrottle) clearTimeout(this._signalThrottle);
    if (this.fng) this.fng.stop();
    if (this.marketState) this.marketState.stop();
    if (this.ui?.tfGuide) this.ui.tfGuide.destroy();
    this.sound.clearAll();
    console.log("🧹 Приложение уничтожено");
  }
}

// ---------- Запуск ----------
document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.init();
  window.__app = app;
});
